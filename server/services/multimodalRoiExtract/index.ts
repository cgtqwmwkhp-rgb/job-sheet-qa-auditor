/**
 * Multimodal ROI field extract (AI-08).
 *
 * Runs Gemini/Claude-style structured JSON extract per page/ROI crop,
 * parallel to ensemble text extraction. Fail-soft; never throws.
 */

import { getVlmConfig } from "../vlmAdapter";
import type { RoiRegion } from "../templateRegistry/types";
import {
  findRoiForField,
  isSignatureRoiName,
  resolveCropForRoi,
} from "./cropMedia";
import {
  extractFieldsFromCrop,
  isMultimodalRoiExtractEnabled,
  mockCropExtract,
} from "./fieldExtract";
import {
  FEATURE_MULTIMODAL_ROI_EXTRACT,
  MULTIMODAL_ROI_FIELD_IDS,
  type MultimodalCropExtractJson,
  type MultimodalRoiExtractArtifact,
  type MultimodalRoiExtractInput,
} from "./types";

export * from "./types";
export * from "./cropMedia";
export {
  extractFieldsFromCrop,
  isMultimodalRoiExtractEnabled,
  mockCropExtract,
  parseCropFieldsJson,
} from "./fieldExtract";

export { FEATURE_MULTIMODAL_ROI_EXTRACT };

function selectRoisForExtract(
  regions: RoiRegion[],
  fieldIds: string[],
  maxCrops: number
): Array<{ roi: RoiRegion; fieldIds: string[] }> {
  const selected: Array<{ roi: RoiRegion; fieldIds: string[] }> = [];
  const used = new Set<string>();

  for (const fieldId of fieldIds) {
    if (selected.length >= maxCrops) break;
    const roi = findRoiForField(regions, fieldId);
    if (!roi) continue;
    const key = `${roi.page}:${roi.name}`;
    const existing = selected.find(s => `${s.roi.page}:${s.roi.name}` === key);
    if (existing) {
      if (!existing.fieldIds.includes(fieldId)) {
        existing.fieldIds.push(fieldId);
      }
      continue;
    }
    if (used.has(key)) continue;
    used.add(key);
    const roiFields =
      roi.fields?.length && roi.fields.some(f => fieldIds.includes(f))
        ? roi.fields.filter(f => fieldIds.includes(f))
        : [fieldId];
    selected.push({ roi, fieldIds: roiFields });
  }

  // Always try signature ROIs for presence fields when room remains.
  for (const roi of regions) {
    if (selected.length >= maxCrops) break;
    if (!isSignatureRoiName(roi.name)) continue;
    const key = `${roi.page}:${roi.name}`;
    if (used.has(key)) continue;
    used.add(key);
    selected.push({
      roi,
      fieldIds: (roi.fields?.length
        ? roi.fields
        : ["customerSignature", "engineerSignOff"]
      ).filter(f => fieldIds.includes(f) || isSignatureRoiName(f)),
    });
  }

  return selected.slice(0, maxCrops);
}

function toPreExtracted(
  crops: MultimodalCropExtractJson[]
): MultimodalRoiExtractArtifact["preExtractedFields"] {
  const out: MultimodalRoiExtractArtifact["preExtractedFields"] = {};
  for (const crop of crops) {
    for (const field of crop.fields) {
      if (!field.present || !field.value) continue;
      if (field.confidence < 0.55) continue;
      const prev = out[field.fieldId];
      if (prev && prev.confidence / 100 >= field.confidence) continue;
      out[field.fieldId] = {
        value: field.value,
        confidence: Math.round(field.confidence * 100),
        pageNumber: crop.page,
      };
    }
  }
  return out;
}

/**
 * Extract structured JSON fields from page/ROI crops.
 */
export async function extractMultimodalRoiFields(
  input: MultimodalRoiExtractInput
): Promise<MultimodalRoiExtractArtifact> {
  const start = Date.now();

  if (!isMultimodalRoiExtractEnabled() && !input.mockExtract) {
    return {
      enabled: false,
      ran: false,
      skippedReason: `${FEATURE_MULTIMODAL_ROI_EXTRACT} off`,
      crops: [],
      preExtractedFields: {},
      processingTimeMs: 0,
    };
  }

  const regions = input.roiConfig?.regions ?? [];
  if (!regions.length) {
    return {
      enabled: true,
      ran: false,
      skippedReason: "no_roi_regions",
      crops: [],
      preExtractedFields: {},
      processingTimeMs: Date.now() - start,
    };
  }

  const fieldIds = input.fieldIds?.length
    ? input.fieldIds
    : [...MULTIMODAL_ROI_FIELD_IDS];
  const maxCrops =
    input.maxCrops ?? Math.max(1, getVlmConfig().maxCropsPerDoc || 5);

  const targets = selectRoisForExtract(regions, fieldIds, maxCrops);
  if (!targets.length) {
    return {
      enabled: true,
      ran: false,
      skippedReason: "no_matching_rois",
      crops: [],
      preExtractedFields: {},
      processingTimeMs: Date.now() - start,
    };
  }

  const crops: MultimodalCropExtractJson[] = [];
  for (const target of targets) {
    if (input.mockExtract) {
      crops.push(input.mockExtract(target.roi, target.fieldIds));
      continue;
    }

    const resolved = resolveCropForRoi(target.roi, {
      cropImages: input.cropImages,
      pageImages: input.pageImages,
    });

    const media =
      resolved.media === "crop" || resolved.media === "page"
        ? resolved.media
        : input.documentPdf
          ? "pdf"
          : "none";

    const result = await extractFieldsFromCrop({
      roi: target.roi,
      fieldIds: target.fieldIds.length ? target.fieldIds : fieldIds.slice(0, 3),
      cropImage: resolved.cropImage,
      documentPdf: resolved.cropImage ? null : input.documentPdf,
      media,
      forceMock: process.env.MULTIMODAL_ROI_PROVIDER === "mock",
    });

    if (resolved.reference?.cropHash) {
      result.cropHash = resolved.reference.cropHash;
    }
    crops.push(result);
  }

  return {
    enabled: true,
    ran: crops.length > 0,
    crops,
    preExtractedFields: toPreExtracted(crops),
    processingTimeMs: Date.now() - start,
  };
}
