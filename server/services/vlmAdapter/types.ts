/**
 * VLM Adapter types — second-vendor vision verification for disputed ROI crops.
 * Advisory / fail-soft: never hard-fail the document pipeline.
 */

export type VlmProvider = "anthropic" | "mock";

export interface VlmCropImage {
  /** Raw bytes or base64 without data-URI prefix */
  data: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  encoding?: "base64";
}

/** Full PDF document for ink verification when ROI crop is unavailable. */
export interface VlmDocumentPdf {
  /** Base64 without data-URI prefix */
  data: string;
  mediaType: "application/pdf";
  encoding?: "base64";
}

export interface VlmVerifyInput {
  fieldId: string;
  checkType: "signature_present" | "tickboxes_checked";
  /** Preferred: cropped ROI image. */
  cropImage?: VlmCropImage;
  /** Fallback: full PDF (Anthropic document content). */
  documentPdf?: VlmDocumentPdf;
  disputeReason?: string;
}

export interface VlmVerificationResult {
  success: boolean;
  present: boolean;
  confidence: number;
  reasoning: string;
  provider: VlmProvider;
  model: string;
  processingTimeMs: number;
  error?: string;
}

export interface VlmAdapter {
  readonly providerName: VlmProvider;
  readonly modelId: string;
  verify(input: VlmVerifyInput): Promise<VlmVerificationResult>;
}

export interface VlmConfig {
  enabled: boolean;
  provider: VlmProvider;
  model: string;
  apiKey: string | undefined;
  maxCropsPerDoc: number;
  confidenceThreshold: number;
}

export function getVlmConfig(): VlmConfig {
  const providerEnv = (process.env.VLM_PROVIDER || "mock").toLowerCase();
  const provider: VlmProvider =
    providerEnv === "anthropic" ? "anthropic" : "mock";

  return {
    enabled: process.env.FEATURE_VLM_VERIFICATION === "true",
    provider,
    model: process.env.ANTHROPIC_VLM_MODEL || "claude-3-5-sonnet-20241022",
    apiKey: process.env.ANTHROPIC_API_KEY,
    maxCropsPerDoc: Math.max(
      1,
      Number.parseInt(process.env.VLM_MAX_CROPS_PER_DOC || "5", 10) || 5
    ),
    confidenceThreshold: Number.parseFloat(
      process.env.VLM_CONFIDENCE_THRESHOLD || "0.7"
    ),
  };
}

export function isVlmVerificationEnabled(): boolean {
  return getVlmConfig().enabled;
}
