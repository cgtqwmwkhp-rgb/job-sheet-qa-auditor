/**
 * Build honest OCR / Image QA / ROI maps for pipeline fusion from upstream stage outputs.
 * No synthetic placeholders — fields are included only when real evidence exists.
 */

import {
  IMAGE_QA_FUSION_FIELDS,
  type ImageQaResult,
  type OcrFieldResult,
  type RoiBbox,
} from "../imageQaFusion/fusionService";
import type { ImageQaResult as RoiImageQaResult } from "../roiProcessor";
import type { PreExtractedFieldMap } from "../roiSpatialExtraction";
import type { SelectionMarksResult } from "../selectionMarks";
import type { RoiConfig, RoiRegion } from "../templateRegistry/types";

export interface FusionStageInputs {
  roiSpatialFields: PreExtractedFieldMap;
  roiConfig?: RoiConfig | null;
  selectionMarksResult?: SelectionMarksResult | null;
  /** VLM signature ink QA when Stage 1.95 ran with a real detector decision. */
  vlmSignatureImageQa?: RoiImageQaResult | null;
}

export interface FusionInputMapsResult {
  ocrResults: Map<string, OcrFieldResult>;
  imageQaResults: Map<string, ImageQaResult>;
  roiBboxes: Map<string, RoiBbox>;
  /** True when at least one fusion field has entries in all three maps. */
  ready: boolean;
  readyFieldIds: string[];
  skipReason?: string;
}

const FUSION_FIELD_SET = new Set<string>(IMAGE_QA_FUSION_FIELDS);

function regionToBbox(region: RoiRegion): RoiBbox {
  return {
    pageIndex: Math.max(0, region.page - 1),
    x: region.bounds.x,
    y: region.bounds.y,
    width: region.bounds.width,
    height: region.bounds.height,
  };
}

function resolveFusionFieldIdsForRegion(region: RoiRegion): string[] {
  const ids = new Set<string>();
  if (FUSION_FIELD_SET.has(region.name)) {
    ids.add(region.name);
  }
  for (const fieldId of region.fields ?? []) {
    if (FUSION_FIELD_SET.has(fieldId)) {
      ids.add(fieldId);
    }
  }
  return [...ids];
}

function preExtractedConfidenceToUnit(confidence: number): number {
  return confidence > 1 ? confidence / 100 : confidence;
}

function mapPreExtractedToOcr(
  fieldId: string,
  field: PreExtractedFieldMap[string]
): OcrFieldResult {
  const value = field.value?.trim() ?? "";
  return {
    fieldId,
    extracted: value.length > 0,
    value: value.length > 0 ? value : null,
    confidence: preExtractedConfidenceToUnit(field.confidence),
    source: "roi",
  };
}

function mapTickboxPreExtractedToImageQa(
  fieldId: string,
  field: PreExtractedFieldMap[string]
): ImageQaResult {
  const value = field.value?.trim() ?? "";
  const confidence = preExtractedConfidenceToUnit(field.confidence);
  const unreadable =
    value.length === 0 || value.toLowerCase().includes("unreadable");

  return {
    fieldId,
    present: !unreadable,
    confidence,
    quality: unreadable
      ? "unreadable"
      : confidence >= 0.85
        ? "high"
        : confidence >= 0.65
          ? "medium"
          : "low",
    issues: unreadable ? ["selection_marks_unreadable"] : [],
  };
}

function mapVlmSignatureToFusionImageQa(
  imageQa: RoiImageQaResult
): ImageQaResult | null {
  if (imageQa.available === false || imageQa.vlmUsed !== true) {
    return null;
  }

  return {
    fieldId: imageQa.fieldId,
    present: imageQa.passed,
    confidence: imageQa.confidence,
    quality:
      imageQa.confidence >= 0.85
        ? "high"
        : imageQa.confidence >= 0.65
          ? "medium"
          : "low",
    issues: imageQa.passed ? [] : [imageQa.details || "signature_not_verified"],
  };
}

export function getFusionReadyFieldIds(
  ocrResults: Map<string, OcrFieldResult>,
  imageQaResults: Map<string, ImageQaResult>,
  roiBboxes: Map<string, RoiBbox>
): string[] {
  const ready: string[] = [];
  for (const fieldId of IMAGE_QA_FUSION_FIELDS) {
    if (
      ocrResults.has(fieldId) &&
      imageQaResults.has(fieldId) &&
      roiBboxes.has(fieldId)
    ) {
      ready.push(fieldId);
    }
  }
  return ready;
}

export function describeFusionMapGap(
  ocrResults: Map<string, OcrFieldResult>,
  imageQaResults: Map<string, ImageQaResult>,
  roiBboxes: Map<string, RoiBbox>
): string {
  const missingOcr = IMAGE_QA_FUSION_FIELDS.filter(id => !ocrResults.has(id));
  const missingImageQa = IMAGE_QA_FUSION_FIELDS.filter(
    id => !imageQaResults.has(id)
  );
  const missingRoi = IMAGE_QA_FUSION_FIELDS.filter(id => !roiBboxes.has(id));

  return [
    "image_qa_fusion_flag_on_but_no_complete_field_maps",
    missingOcr.length ? `missing_ocr:${missingOcr.join(",")}` : null,
    missingImageQa.length
      ? `missing_image_qa:${missingImageQa.join(",")}`
      : null,
    missingRoi.length ? `missing_roi:${missingRoi.join(",")}` : null,
  ]
    .filter(Boolean)
    .join("; ");
}

/**
 * Build fusion maps from ROI spatial, selection marks, template ROI config, and VLM ink QA.
 */
export function buildFusionInputMapsFromStages(
  input: FusionStageInputs
): FusionInputMapsResult {
  const ocrResults = new Map<string, OcrFieldResult>();
  const imageQaResults = new Map<string, ImageQaResult>();
  const roiBboxes = new Map<string, RoiBbox>();

  for (const region of input.roiConfig?.regions ?? []) {
    const fieldIds = resolveFusionFieldIdsForRegion(region);
    if (fieldIds.length === 0) continue;

    const bbox = regionToBbox(region);
    for (const fieldId of fieldIds) {
      roiBboxes.set(fieldId, bbox);
    }
  }

  for (const fieldId of IMAGE_QA_FUSION_FIELDS) {
    const spatial = input.roiSpatialFields[fieldId];
    if (spatial) {
      ocrResults.set(fieldId, mapPreExtractedToOcr(fieldId, spatial));
    }
  }

  for (const fieldId of ["complianceTickboxes", "tickboxBlock"] as const) {
    const tickboxField =
      input.roiSpatialFields[fieldId] ??
      input.selectionMarksResult?.preExtractedFields?.[fieldId];
    if (tickboxField) {
      if (!ocrResults.has(fieldId)) {
        ocrResults.set(fieldId, mapPreExtractedToOcr(fieldId, tickboxField));
      }
      imageQaResults.set(
        fieldId,
        mapTickboxPreExtractedToImageQa(fieldId, tickboxField)
      );
    }
  }

  const vlmImageQa = input.vlmSignatureImageQa
    ? mapVlmSignatureToFusionImageQa(input.vlmSignatureImageQa)
    : null;
  if (vlmImageQa) {
    imageQaResults.set(vlmImageQa.fieldId, vlmImageQa);
    if (!ocrResults.has(vlmImageQa.fieldId)) {
      ocrResults.set(vlmImageQa.fieldId, {
        fieldId: vlmImageQa.fieldId,
        extracted: vlmImageQa.present,
        value: vlmImageQa.present ? "Present" : "Absent",
        confidence: vlmImageQa.confidence,
        source: "roi",
      });
    }
  }

  const readyFieldIds = getFusionReadyFieldIds(
    ocrResults,
    imageQaResults,
    roiBboxes
  );

  return {
    ocrResults,
    imageQaResults,
    roiBboxes,
    ready: readyFieldIds.length > 0,
    readyFieldIds,
    skipReason:
      readyFieldIds.length > 0
        ? undefined
        : describeFusionMapGap(ocrResults, imageQaResults, roiBboxes),
  };
}
