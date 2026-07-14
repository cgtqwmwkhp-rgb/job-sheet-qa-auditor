/**
 * ROI Extraction Service
 *
 * PR-J / PR-AI-05: ROI-targeted processing for critical fields.
 * Crop → re-OCR (and VLM for visual fields) replaces the former mock trap
 * that returned fabricated JOB-ROI-001 values.
 */

import type { RoiConfig, RoiRegion } from "../templateRegistry/types";
import {
  createCropOcrRunner,
  isRoiCropReocrEnabled,
  type CropOcrRunner,
  type RoiCropImage,
} from "../ocrAdapter/cropOcrAdapter";
import {
  getVlmAdapter,
  getVlmConfig,
  isVlmVerificationEnabled,
  type VlmCropImage,
  type VlmDocumentPdf,
} from "../vlmAdapter";

/**
 * Critical field IDs that benefit from ROI-targeted extraction
 */
export const CRITICAL_ROI_FIELDS = [
  "jobReference",
  "assetId",
  "date",
  "expiryDate",
  "tickboxBlock",
  "signatureBlock",
] as const;

export type CriticalRoiField = (typeof CRITICAL_ROI_FIELDS)[number];

/**
 * Fields requiring image QA (visual verification)
 */
export const IMAGE_QA_FIELDS = ["tickboxBlock", "signatureBlock"] as const;
export type ImageQaField = (typeof IMAGE_QA_FIELDS)[number];

/**
 * ROI extraction result for a single field
 */
export interface RoiExtractionResult {
  fieldId: string;
  extracted: boolean;
  value: string | null;
  confidence: number;
  source: "roi" | "fullpage" | "reprocessed" | "crop_ocr";
  roiRegion?: RoiRegion;
  reprocessAttempts: number;
  imageQaResult?: ImageQaResult;
  cropHash?: string;
}

/**
 * Image QA result for visual fields
 */
export interface ImageQaResult {
  fieldId: string;
  passed: boolean;
  checkType: "signature_present" | "tickboxes_checked";
  confidence: number;
  details: string;
  /**
   * False when no real detector/VLM ran — confidence must not be treated as evidence.
   * Omitted or true means a real verification decision was produced.
   */
  available?: boolean;
  vlmProvider?: string;
  vlmModel?: string;
  vlmUsed?: boolean;
}

export interface RoiImageQaOptions {
  /** Base64 crop for VLM; without this, Image QA is unavailable unless documentPdf set */
  cropImage?: VlmCropImage;
  /** Full PDF for Anthropic document ink verification when crop unavailable */
  documentPdf?: VlmDocumentPdf;
  disputed?: boolean;
  extractionConfidence?: number;
  disputeReason?: string;
}

/**
 * ROI processing trace for debugging/audit
 */
export interface RoiProcessingTrace {
  documentId: number;
  templateVersionId: number;
  timestamp: string;
  roiConfig: RoiConfig | null;
  results: RoiExtractionResult[];
  totalReprocessAttempts: number;
  processingTimeMs: number;
  warnings: string[];
}

/**
 * Performance caps configuration
 */
export interface PerformanceCaps {
  /** Max reprocessing attempts per document */
  maxReprocessAttemptsPerDoc: number;
  /** Max reprocessing attempts per ROI */
  maxReprocessAttemptsPerRoi: number;
  /** Timeout for single ROI extraction (ms) */
  roiExtractionTimeoutMs: number;
  /** Minimum confidence threshold for acceptance */
  minConfidenceThreshold: number;
}

/**
 * Default performance caps
 */
export const DEFAULT_PERFORMANCE_CAPS: PerformanceCaps = {
  maxReprocessAttemptsPerDoc: 3,
  maxReprocessAttemptsPerRoi: 2,
  roiExtractionTimeoutMs: 5000,
  minConfidenceThreshold: 0.6,
};

export interface ProcessWithRoiOptions {
  /** PDF bytes for ROI crop → re-OCR */
  pdfBuffer?: Buffer | null;
  /** Injected crop OCR runner (tests / custom HTR later) */
  cropOcrRunner?: CropOcrRunner;
  /** Force crop path even when FEATURE_ROI_CROP_REOCR is off */
  forceCropReocr?: boolean;
  /** Full PDF for VLM when crop render fails */
  documentPdf?: VlmDocumentPdf;
}

/**
 * Check if a field is a critical ROI field
 */
export function isCriticalRoiField(
  fieldId: string
): fieldId is CriticalRoiField {
  return CRITICAL_ROI_FIELDS.includes(fieldId as CriticalRoiField);
}

/**
 * Check if a field requires image QA
 */
export function requiresImageQa(fieldId: string): fieldId is ImageQaField {
  return IMAGE_QA_FIELDS.includes(fieldId as ImageQaField);
}

/**
 * Get ROI region for a field from config
 */
export function getRoiForField(
  roiConfig: RoiConfig | null,
  fieldId: string
): RoiRegion | null {
  if (!roiConfig) return null;
  return roiConfig.regions.find(r => r.name === fieldId) ?? null;
}

/**
 * Check which critical ROIs are missing from config
 */
export function getMissingCriticalRois(
  roiConfig: RoiConfig | null
): CriticalRoiField[] {
  if (!roiConfig) return [...CRITICAL_ROI_FIELDS];

  const presentRois = new Set(roiConfig.regions.map(r => r.name));
  return CRITICAL_ROI_FIELDS.filter(f => !presentRois.has(f));
}

const FIELD_EVIDENCE_PATTERNS: Record<string, RegExp[]> = {
  jobReference: [
    /(?:job\s*(?:ref(?:erence)?|no\.?|number|#)|jsr)\s*[:#-]?\s*([A-Z0-9][\w/-]{2,})/i,
    /\b(JOB[-_\s]?\d{3,})\b/i,
  ],
  assetId: [
    /(?:asset(?:\s*id)?|fleet|reg(?:istration)?|plant)\s*[:#-]?\s*([A-Z0-9][\w/-]{2,})/i,
  ],
  date: [
    /(?:^|\b)(?:date|visited|completed)\s*[:#-]?\s*(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}|\d{4}-\d{2}-\d{2})/im,
  ],
  expiryDate: [
    /(?:expir(?:y|es|ation)|valid\s*until)\s*[:#-]?\s*(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}|\d{4}-\d{2}-\d{2})/i,
  ],
  tickboxBlock: [/\b(all[_\s-]?checked|tick(?:ed|box)?s?\s*complete)\b/i],
  signatureBlock: [/\b(signed|signature\s*present|sign[_-]?off)\b/i],
};

/**
 * Evidence-based extraction from document text for an ROI field.
 * Never fabricates placeholder values (former mock trap removed).
 */
export function extractFromRoi(
  documentText: string,
  roi: RoiRegion,
  fieldId: string
): { value: string | null; confidence: number } {
  void roi; // geometry used by crop path; text path is field-pattern evidence
  const text = documentText ?? "";
  if (!text.trim()) {
    return { value: null, confidence: 0 };
  }

  const patterns = FIELD_EVIDENCE_PATTERNS[fieldId];
  if (patterns) {
    for (const re of patterns) {
      const m = text.match(re);
      const captured = (m?.[1] || m?.[0] || "").trim();
      if (captured) {
        return {
          value: captured.slice(0, 200),
          // Labeled evidence is ROI-strength; crop OCR may still beat this.
          confidence: 0.85,
        };
      }
    }
  }

  return { value: null, confidence: 0 };
}

function imageQaCheckType(fieldId: ImageQaField): ImageQaResult["checkType"] {
  return fieldId === "signatureBlock"
    ? "signature_present"
    : "tickboxes_checked";
}

/**
 * Honest unavailable Image QA — never fabricates a live-looking pass/confidence.
 * Fusion/VLM consumers must treat available:false as "no Image QA evidence".
 */
function unavailableImageQa(
  fieldId: ImageQaField,
  reason: string,
  extras: Partial<Pick<ImageQaResult, "vlmProvider" | "vlmModel">> = {}
): ImageQaResult {
  return {
    fieldId,
    passed: false,
    checkType: imageQaCheckType(fieldId),
    confidence: 0,
    details: reason,
    available: false,
    vlmUsed: false,
    ...extras,
  };
}

/**
 * Image QA for visual fields.
 * When FEATURE_VLM_VERIFICATION is on and a crop or PDF is provided for a
 * disputed / low-confidence field, calls the VLM adapter (Anthropic or mock).
 * Without a real detector/VLM result, returns unavailable (never a fake pass).
 * Fail-soft: VLM errors return unavailable, not a stub pass.
 */
export async function runImageQa(
  _roi: RoiRegion,
  fieldId: ImageQaField,
  options: RoiImageQaOptions = {}
): Promise<ImageQaResult> {
  const checkType = imageQaCheckType(fieldId);

  if (!isVlmVerificationEnabled()) {
    if (options.disputed) {
      // Fail-closed decision: disputed and cannot verify → not a pass.
      return {
        fieldId,
        passed: false,
        checkType,
        confidence: 0,
        available: true,
        details: `${checkType} disputed but VLM verification is off — cannot confirm`,
        vlmUsed: false,
      };
    }
    return unavailableImageQa(
      fieldId,
      `${checkType} unavailable — no VLM/detector result (heuristic stub disabled)`
    );
  }

  const config = getVlmConfig();
  const lowConfidence =
    typeof options.extractionConfidence === "number" &&
    options.extractionConfidence < config.confidenceThreshold;
  const hasMedia = Boolean(options.cropImage || options.documentPdf);
  const shouldUseVlm = hasMedia && (options.disputed === true || lowConfidence);

  if (!shouldUseVlm) {
    return unavailableImageQa(
      fieldId,
      hasMedia
        ? `${checkType} unavailable — VLM not invoked (not disputed / confidence above threshold)`
        : `${checkType} unavailable — no crop or PDF media for VLM`
    );
  }

  try {
    const adapter = getVlmAdapter();
    const vlm = await adapter.verify({
      fieldId,
      checkType,
      cropImage: options.cropImage,
      documentPdf: options.documentPdf,
      disputeReason: options.disputeReason,
    });

    if (!vlm.success) {
      return unavailableImageQa(
        fieldId,
        `${checkType} unavailable (vlm fail-soft: ${vlm.error || vlm.reasoning})`,
        { vlmProvider: vlm.provider, vlmModel: vlm.model }
      );
    }

    return {
      fieldId,
      passed: vlm.present && vlm.confidence >= config.confidenceThreshold,
      checkType,
      confidence: vlm.confidence,
      details: vlm.reasoning || `${checkType} verified via VLM`,
      available: true,
      vlmProvider: vlm.provider,
      vlmModel: vlm.model,
      vlmUsed: true,
    };
  } catch {
    return unavailableImageQa(
      fieldId,
      `${checkType} unavailable (vlm exception fail-soft)`
    );
  }
}

function toVlmCrop(crop: RoiCropImage): VlmCropImage {
  return {
    data: crop.dataBase64,
    mediaType: crop.mediaType,
  };
}

/**
 * Process a document using ROI-targeted extraction.
 * Prefers crop → re-OCR when PDF bytes (or injected runner) are available.
 */
export async function processWithRoi(
  documentId: number,
  documentText: string,
  templateVersionId: number,
  roiConfig: RoiConfig | null,
  fieldIds: string[],
  caps: PerformanceCaps = DEFAULT_PERFORMANCE_CAPS,
  options: ProcessWithRoiOptions = {}
): Promise<RoiProcessingTrace> {
  const startTime = Date.now();
  const results: RoiExtractionResult[] = [];
  const warnings: string[] = [];
  let totalReprocessAttempts = 0;

  const cropEnabled =
    options.forceCropReocr === true ||
    (isRoiCropReocrEnabled() &&
      (Boolean(options.pdfBuffer?.length) || Boolean(options.cropOcrRunner)));
  const cropRunner = options.cropOcrRunner ?? createCropOcrRunner();

  // Check for missing critical ROIs
  const missingCritical = getMissingCriticalRois(roiConfig);
  if (missingCritical.length > 0) {
    warnings.push(`Missing critical ROIs: ${missingCritical.join(", ")}`);
  }

  for (const fieldId of fieldIds) {
    const roi = getRoiForField(roiConfig, fieldId);
    let extracted = false;
    let value: string | null = null;
    let confidence = 0;
    let source: RoiExtractionResult["source"] = "fullpage";
    let reprocessAttempts = 0;
    let imageQaResult: ImageQaResult | undefined;
    let cropHash: string | undefined;
    let lastCrop: RoiCropImage | undefined;

    if (roi) {
      source = "roi"; // ROI path attempted (never invent values)

      // Prefer crop → re-OCR for critical / text fields when enabled
      if (cropEnabled && !requiresImageQa(fieldId)) {
        const cropResult = await cropRunner({
          fieldId,
          roi,
          pdfBuffer: options.pdfBuffer,
          skipRetry: true,
        });
        if (cropResult.crop) {
          lastCrop = cropResult.crop;
          cropHash = cropResult.crop.cropHash;
        }
        if (cropResult.success && cropResult.value) {
          value = cropResult.value;
          confidence = cropResult.confidence;
          source = "crop_ocr";
          extracted = confidence >= caps.minConfidenceThreshold;
        }
      }

      // Evidence fallback from document text (never mock placeholders)
      if (!extracted) {
        const roiResult = extractFromRoi(documentText, roi, fieldId);
        if (roiResult.value) {
          value = roiResult.value;
          confidence = roiResult.confidence;
          source = "roi";
          extracted = confidence >= caps.minConfidenceThreshold;
        }
      }

      // Run image QA for visual fields (pass crop when we have one)
      if (requiresImageQa(fieldId)) {
        if (cropEnabled && !lastCrop && options.pdfBuffer?.length) {
          const cropOnly = await cropRunner({
            fieldId,
            roi,
            pdfBuffer: options.pdfBuffer,
            skipRetry: true,
          });
          if (cropOnly.crop) {
            lastCrop = cropOnly.crop;
            cropHash = cropOnly.crop.cropHash;
          }
          if (cropOnly.value) {
            value = cropOnly.value;
            confidence = Math.max(confidence, cropOnly.confidence);
            source = "crop_ocr";
          }
        }

        imageQaResult = await runImageQa(roi, fieldId as ImageQaField, {
          extractionConfidence: confidence,
          disputed: !extracted,
          cropImage: lastCrop ? toVlmCrop(lastCrop) : undefined,
          documentPdf: options.documentPdf,
        });
        if (imageQaResult.passed && imageQaResult.confidence >= caps.minConfidenceThreshold) {
          extracted = true;
          confidence = Math.max(confidence, imageQaResult.confidence);
          if (!value) {
            value =
              fieldId === "signatureBlock" ? "signed" : "tickboxes_checked";
          }
        }
      }

      // Reprocess via crop OCR if still low confidence (respecting caps)
      if (
        !extracted &&
        cropEnabled &&
        totalReprocessAttempts < caps.maxReprocessAttemptsPerDoc
      ) {
        while (
          !extracted &&
          reprocessAttempts < caps.maxReprocessAttemptsPerRoi &&
          totalReprocessAttempts < caps.maxReprocessAttemptsPerDoc
        ) {
          reprocessAttempts++;
          totalReprocessAttempts++;

          const reprocessResult = await cropRunner({
            fieldId,
            roi,
            pdfBuffer: options.pdfBuffer,
            cropImage: lastCrop,
            skipRetry: false,
          });
          if (reprocessResult.crop) {
            lastCrop = reprocessResult.crop;
            cropHash = reprocessResult.crop.cropHash;
          }
          if (reprocessResult.success && reprocessResult.value) {
            value = reprocessResult.value;
            confidence = reprocessResult.confidence;
            source = "reprocessed";
            extracted = confidence >= caps.minConfidenceThreshold;
          }
        }
      }
    } else if (isCriticalRoiField(fieldId)) {
      // Critical field without ROI - flag for review
      warnings.push(`Critical field '${fieldId}' has no ROI defined`);
      extracted = false;
      confidence = 0;
    } else {
      // Non-critical field without ROI — evidence from full page text only
      const full = extractFromRoi(documentText, {
        name: fieldId,
        page: 1,
        bounds: { x: 0, y: 0, width: 1, height: 1 },
      }, fieldId);
      value = full.value;
      confidence = full.value ? Math.min(full.confidence, 0.75) : 0;
      extracted = Boolean(full.value);
      source = "fullpage";
    }

    results.push({
      fieldId,
      extracted,
      value,
      confidence,
      source,
      roiRegion: roi ?? undefined,
      reprocessAttempts,
      imageQaResult,
      cropHash,
    });
  }

  return {
    documentId,
    templateVersionId,
    timestamp: new Date().toISOString(),
    roiConfig,
    results,
    totalReprocessAttempts,
    processingTimeMs: Date.now() - startTime,
    warnings,
  };
}

/**
 * Canonical reason codes (from parity/runner/types.ts)
 *
 * PR-P Semantic Correction for Analytics:
 * - MISSING_CRITICAL_ROI → SPEC_GAP (config issue, not document fault)
 * - IMAGE_QA_FAILED → OCR_FAILURE (processing failure, not document fault)
 * - LOW_CONFIDENCE → LOW_CONFIDENCE (document extraction issue)
 *
 * This ensures analytics won't misattribute system/config faults to documents/engineers.
 */
export const CANONICAL_REASON_CODE_MAP = {
  MISSING_CRITICAL_ROI: "SPEC_GAP", // Config issue - ROI not defined
  IMAGE_QA_FAILED: "OCR_FAILURE", // Processing failure - image QA failed
  LOW_CONFIDENCE: "LOW_CONFIDENCE", // Document issue - extraction uncertain
} as const;

/**
 * Check if processing result requires review queue
 *
 * Returns semantically correct canonical reason codes:
 * - SPEC_GAP: Template ROI configuration incomplete (system issue)
 * - OCR_FAILURE: Image QA processing failed (system issue)
 * - LOW_CONFIDENCE: Extraction confidence too low (document issue)
 */
export function requiresReviewQueue(trace: RoiProcessingTrace): {
  required: boolean;
  reasonCodes: string[];
} {
  const reasonCodes: Set<string> = new Set();

  // Check for missing critical ROIs → SPEC_GAP (config/system issue)
  const missingCritical = getMissingCriticalRois(trace.roiConfig);
  if (missingCritical.length > 0) {
    reasonCodes.add("SPEC_GAP");
  }

  // Check for low confidence critical fields → LOW_CONFIDENCE (document issue)
  for (const result of trace.results) {
    if (isCriticalRoiField(result.fieldId)) {
      if (
        !result.extracted ||
        result.confidence < DEFAULT_PERFORMANCE_CAPS.minConfidenceThreshold
      ) {
        reasonCodes.add("LOW_CONFIDENCE");
        break;
      }
    }
  }

  // Check for failed image QA → OCR_FAILURE (processing issue).
  // Unavailable (available:false) is not a failed check — it must not look like a live fail.
  for (const result of trace.results) {
    const qa = result.imageQaResult;
    if (qa && qa.available !== false && !qa.passed) {
      reasonCodes.add("OCR_FAILURE");
      break;
    }
  }

  // Return sorted array for deterministic output
  const sortedCodes = Array.from(reasonCodes).sort();

  return {
    required: sortedCodes.length > 0,
    reasonCodes: sortedCodes,
  };
}
