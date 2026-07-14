/**
 * Multimodal ROI field extract — structured JSON per page/ROI crop (AI-08).
 */

import type { RoiRegion } from "../templateRegistry/types";
import type { VlmCropImage, VlmDocumentPdf } from "../vlmAdapter";

export const FEATURE_MULTIMODAL_ROI_EXTRACT = "FEATURE_MULTIMODAL_ROI_EXTRACT";

/** Default critical fields for ROI multimodal extract (excludes visual-only blocks). */
export const MULTIMODAL_ROI_FIELD_IDS = [
  "jobReference",
  "assetId",
  "date",
  "expiryDate",
  "make",
  "model",
  "customerSignature",
  "engineerSignOff",
] as const;

export type MultimodalRoiFieldId = (typeof MULTIMODAL_ROI_FIELD_IDS)[number];

export interface NormalizedRoiBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RoiCropReference {
  roiId: string;
  page: number;
  bbox: NormalizedRoiBounds;
  cropHash: string;
  extractedAt: string;
  /** True when pixel crop bytes were produced (vs page/PDF + bounds hint). */
  pixelCropped: boolean;
}

export interface PageImageInput {
  page: number;
  data: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp";
  encoding?: "base64";
  width?: number;
  height?: number;
}

export interface MultimodalCropFieldJson {
  fieldId: string;
  value: string | null;
  confidence: number;
  present: boolean;
  reasoning: string;
}

/** Structured JSON returned for a single ROI crop. */
export interface MultimodalCropExtractJson {
  roiId: string;
  page: number;
  bbox: NormalizedRoiBounds;
  fields: MultimodalCropFieldJson[];
  cropHash: string;
  provider: "gemini" | "mock" | "none";
  model: string;
  media: "crop" | "page" | "pdf" | "none";
  processingTimeMs: number;
  error?: string;
}

export interface MultimodalRoiExtractArtifact {
  enabled: boolean;
  ran: boolean;
  skippedReason?: string;
  crops: MultimodalCropExtractJson[];
  /** Flattened pre-extract hints for analyzer merge. */
  preExtractedFields: Record<
    string,
    { value: string; confidence: number; pageNumber: number }
  >;
  processingTimeMs: number;
}

export interface MultimodalRoiExtractInput {
  documentId?: number;
  roiConfig: { regions: RoiRegion[] } | null | undefined;
  /** Optional page bitmaps (preferred for pixel crops). */
  pageImages?: PageImageInput[];
  /** Optional pre-cropped ROI images keyed by region name. */
  cropImages?: Record<string, VlmCropImage>;
  /** Fallback media when no page/crop images. */
  documentPdf?: VlmDocumentPdf | null;
  /** Limit crops per document (defaults to VLM_MAX_CROPS_PER_DOC / 5). */
  maxCrops?: number;
  /** Field IDs to target; defaults to MULTIMODAL_ROI_FIELD_IDS. */
  fieldIds?: string[];
  /** Inject deterministic JSON in tests (no network). */
  mockExtract?: (
    roi: RoiRegion,
    fieldIds: string[]
  ) => MultimodalCropExtractJson;
}
