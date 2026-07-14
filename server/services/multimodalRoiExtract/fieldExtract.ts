/**
 * Gemini (or mock) structured JSON extract for a single ROI crop.
 * Fail-soft: never throws.
 */

import { invokeLLM } from "../../_core/llm";
import { createSafeLogger } from "../../utils/safeLogger";
import type { RoiRegion } from "../templateRegistry/types";
import type { VlmCropImage, VlmDocumentPdf } from "../vlmAdapter";
import { buildCropReference, normalizeBounds } from "./cropMedia";
import type {
  MultimodalCropExtractJson,
  MultimodalCropFieldJson,
} from "./types";

const logger = createSafeLogger("MultimodalRoiExtract");

const CROP_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    fields: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          fieldId: { type: "string" },
          value: { type: ["string", "null"] },
          confidence: { type: "number" },
          present: { type: "boolean" },
          reasoning: { type: "string" },
        },
        required: ["fieldId", "value", "confidence", "present", "reasoning"],
      },
    },
  },
  required: ["fields"],
} as const;

export function isMultimodalRoiExtractEnabled(): boolean {
  const flag = process.env.FEATURE_MULTIMODAL_ROI_EXTRACT;
  if (flag === "false" || flag === "0") return false;
  if (flag === "true" || flag === "1") return true;
  // Default on when Gemini multimodal is usable (same judgment key).
  if (process.env.FEATURE_GEMINI_MULTIMODAL === "false") return false;
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

export function parseCropFieldsJson(
  text: string,
  fieldIds: string[]
): MultimodalCropFieldJson[] {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return fieldIds.map(emptyField);
  try {
    const obj = JSON.parse(match[0]) as {
      fields?: Array<Record<string, unknown>>;
    };
    const byId = new Map<string, MultimodalCropFieldJson>();
    for (const raw of obj.fields ?? []) {
      const fieldId = String(raw.fieldId ?? "");
      if (!fieldId) continue;
      const confidence = clamp01(Number(raw.confidence) || 0);
      const value =
        raw.value === null || raw.value === undefined
          ? null
          : String(raw.value).trim() || null;
      byId.set(fieldId, {
        fieldId,
        value,
        confidence,
        present: raw.present === true || Boolean(value),
        reasoning: String(raw.reasoning ?? ""),
      });
    }
    return fieldIds.map(id => byId.get(id) ?? emptyField(id));
  } catch {
    return fieldIds.map(emptyField);
  }
}

function emptyField(fieldId: string): MultimodalCropFieldJson {
  return {
    fieldId,
    value: null,
    confidence: 0,
    present: false,
    reasoning: "not extracted",
  };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

export function mockCropExtract(
  roi: RoiRegion,
  fieldIds: string[]
): MultimodalCropExtractJson {
  const bbox = normalizeBounds(roi.bounds) ?? {
    x: 0,
    y: 0,
    width: 1,
    height: 1,
  };
  const ref = buildCropReference(roi, {
    pixelCropped: false,
    mediaHint: "mock",
  });
  const fields = fieldIds.map(fieldId => {
    const lower = fieldId.toLowerCase();
    if (lower.includes("signature") || lower.includes("signoff")) {
      return {
        fieldId,
        value: "Present",
        confidence: 0.9,
        present: true,
        reasoning: "mock signature presence in ROI crop",
      };
    }
    if (lower.includes("job") || lower.includes("reference")) {
      return {
        fieldId,
        value: "JS-MOCK-001",
        confidence: 0.88,
        present: true,
        reasoning: "mock job reference from ROI crop",
      };
    }
    if (lower.includes("asset")) {
      return {
        fieldId,
        value: "ASSET-MOCK",
        confidence: 0.85,
        present: true,
        reasoning: "mock asset from ROI crop",
      };
    }
    if (lower.includes("date")) {
      return {
        fieldId,
        value: "2026-07-14",
        confidence: 0.84,
        present: true,
        reasoning: "mock date from ROI crop",
      };
    }
    return {
      fieldId,
      value: `mock-${fieldId}`,
      confidence: 0.8,
      present: true,
      reasoning: "mock ROI crop extract",
    };
  });

  return {
    roiId: roi.name,
    page: roi.page || 1,
    bbox,
    fields,
    cropHash: ref?.cropHash ?? "crop_mock",
    provider: "mock",
    model: "mock-multimodal-roi-v1",
    media: "none",
    processingTimeMs: 0,
  };
}

export async function extractFieldsFromCrop(options: {
  roi: RoiRegion;
  fieldIds: string[];
  cropImage?: VlmCropImage;
  documentPdf?: VlmDocumentPdf | null;
  media: "crop" | "page" | "pdf" | "none";
  forceMock?: boolean;
}): Promise<MultimodalCropExtractJson> {
  const start = Date.now();
  const { roi, fieldIds } = options;
  const bbox = normalizeBounds(roi.bounds) ?? {
    x: 0,
    y: 0,
    width: 1,
    height: 1,
  };
  const ref = buildCropReference(roi, {
    pixelCropped: options.media === "crop",
    mediaHint: options.media,
  });

  if (
    options.forceMock ||
    process.env.MULTIMODAL_ROI_PROVIDER === "mock" ||
    !process.env.GEMINI_API_KEY?.trim()
  ) {
    const mocked = mockCropExtract(roi, fieldIds);
    return {
      ...mocked,
      media: options.media,
      processingTimeMs: Date.now() - start,
    };
  }

  if (!options.cropImage && !options.documentPdf) {
    return {
      roiId: roi.name,
      page: roi.page || 1,
      bbox,
      fields: fieldIds.map(emptyField),
      cropHash: ref?.cropHash ?? "crop_none",
      provider: "none",
      model: "none",
      media: "none",
      processingTimeMs: Date.now() - start,
      error: "MISSING_MEDIA",
    };
  }

  const prompt = `Extract structured fields from this job-sheet ROI crop only.
ROI id: ${roi.name}
Page: ${roi.page || 1}
Normalized bounds (x,y,w,h 0-1): ${bbox.x.toFixed(3)},${bbox.y.toFixed(3)},${bbox.width.toFixed(3)},${bbox.height.toFixed(3)}
Target field IDs: ${fieldIds.join(", ")}
${options.media === "page" || options.media === "pdf" ? "IMPORTANT: Only read inside the ROI bounds — ignore the rest of the page/PDF." : "The attached image is already cropped to the ROI."}

Reply JSON only matching schema {"fields":[{"fieldId","value","confidence","present","reasoning"}]}.
Use null value when not visible. Confidence is 0-1.`;

  try {
    const userContent: Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string; detail: "high" } }
      | {
          type: "file_url";
          file_url: { url: string; mime_type: "application/pdf" };
        }
    > = [{ type: "text", text: prompt }];

    if (options.cropImage) {
      userContent.push({
        type: "image_url",
        image_url: {
          url: `data:${options.cropImage.mediaType};base64,${options.cropImage.data}`,
          detail: "high",
        },
      });
    } else if (options.documentPdf) {
      userContent.push({
        type: "file_url",
        file_url: {
          url: `data:application/pdf;base64,${options.documentPdf.data}`,
          mime_type: "application/pdf",
        },
      });
    }

    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content:
            "You are a precise job-sheet field extractor. Return JSON only for the requested ROI crop.",
        },
        { role: "user", content: userContent },
      ],
      costMeta: {
        stage: "multimodal_roi_extract",
        provider: "gemini",
        tool: "multimodal_roi_fields",
      },
      responseFormat: {
        type: "json_schema",
        json_schema: {
          name: "multimodal_roi_crop_fields",
          schema: CROP_JSON_SCHEMA as unknown as Record<string, unknown>,
        },
      },
      maxTokens: 1024,
    });

    const text =
      typeof response.choices[0]?.message?.content === "string"
        ? response.choices[0].message.content
        : "";
    const fields = parseCropFieldsJson(text, fieldIds);

    return {
      roiId: roi.name,
      page: roi.page || 1,
      bbox,
      fields,
      cropHash: ref?.cropHash ?? "crop_gemini",
      provider: "gemini",
      model: response.model || "gemini",
      media: options.media,
      processingTimeMs: Date.now() - start,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    logger.warn("Multimodal ROI crop extract failed soft", {
      roiId: roi.name,
      message,
    });
    return {
      roiId: roi.name,
      page: roi.page || 1,
      bbox,
      fields: fieldIds.map(emptyField),
      cropHash: ref?.cropHash ?? "crop_error",
      provider: "gemini",
      model: "gemini",
      media: options.media,
      processingTimeMs: Date.now() - start,
      error: message,
    };
  }
}
