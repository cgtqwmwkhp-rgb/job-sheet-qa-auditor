/**
 * OCR Reconciliation Service
 *
 * Joint OCR reconciliation with targeted region re-processing and confidence
 * calibration. Re-OCR prefers real ROI crop OCR (precomputed or via runner);
 * never invents high-confidence placeholder values.
 *
 * DESIGN NOTES:
 * - Primary OCR is always used first
 * - Re-OCR only for missing/low-confidence fields with known bbox
 * - Crop OCR results beat whole-PDF plateau when available
 * - Without crop OCR: fail-soft (keep original) — optional rawText regex only
 */

import type {
  ExtractedField,
  ReOcrRequest,
  ReOcrResult,
  ReOcrMethod,
  ReconciliationResult,
  CalibrationTable,
  ReviewRoutingDecision,
  ReviewReason,
  ReconcileOptions,
  CropOcrFieldResult,
  RegionBBox,
} from "./types";
import { getDefaultCalibrationTable } from "./types";
import type { CropOcrRunner } from "../ocrAdapter/cropOcrAdapter";
import type { RoiRegion } from "../templateRegistry/types";

export interface ReconcileWithCropOptions extends ReconcileOptions {
  /** PDF bytes for live crop → OCR when precomputed results are missing */
  pdfBuffer?: Buffer | null;
  /** Injected crop OCR runner (tests / production) */
  cropOcrRunner?: CropOcrRunner;
  /** ROI geometry keyed by field name (0–1 bounds); required for live crop */
  roiByField?: Record<string, RoiRegion>;
}

/**
 * Convert percent bbox (0–100) to RoiRegion bounds (0–1).
 */
export function regionBBoxToRoi(
  fieldName: string,
  bbox: RegionBBox
): RoiRegion {
  return {
    name: fieldName,
    page: Math.max(1, bbox.pageNumber || 1),
    bounds: {
      x: bbox.x / 100,
      y: bbox.y / 100,
      width: bbox.width / 100,
      height: bbox.height / 100,
    },
  };
}

/**
 * Reconcile extracted fields with re-OCR and fallback methods (sync).
 *
 * Pass `cropOcrResults` from processWithRoi / cropOcrAdapter so critical
 * fields receive real crop OCR. Without them, candidates fail-soft.
 */
export function reconcileFields(
  documentId: string,
  originalFields: ExtractedField[],
  requiredFields: string[] = [],
  calibration: CalibrationTable = getDefaultCalibrationTable(),
  options: ReconcileOptions = {}
): ReconciliationResult {
  const startTime = Date.now();

  const reOcrRequests = identifyReOcrCandidates(
    originalFields,
    requiredFields,
    calibration
  );

  const reOcrResults = processReOcrRequests(
    reOcrRequests,
    originalFields,
    options
  );

  const reconciledFields = mergeResults(originalFields, reOcrResults);
  const summary = calculateSummary(
    originalFields,
    reconciledFields,
    calibration
  );

  const reviewReasons: string[] = [];
  if (summary.lowConfidenceCount > 0) {
    reviewReasons.push(
      `${summary.lowConfidenceCount} field(s) have low confidence`
    );
  }
  if (summary.fieldsFailed > 0) {
    reviewReasons.push(
      `${summary.fieldsFailed} field(s) failed reconciliation`
    );
  }

  return {
    documentId,
    processedAt: new Date().toISOString(),
    processingTimeMs: Date.now() - startTime,
    originalFields,
    reOcrRequests,
    reOcrResults,
    reconciledFields,
    summary,
    requiresReview: reviewReasons.length > 0,
    reviewReasons,
  };
}

/**
 * Async reconciliation that can call the crop OCR runner for candidates
 * lacking precomputed crop results (when PDF + ROI geometry available).
 */
export async function reconcileFieldsWithCropOcr(
  documentId: string,
  originalFields: ExtractedField[],
  requiredFields: string[] = [],
  calibration: CalibrationTable = getDefaultCalibrationTable(),
  options: ReconcileWithCropOptions = {}
): Promise<ReconciliationResult> {
  const startTime = Date.now();

  const reOcrRequests = identifyReOcrCandidates(
    originalFields,
    requiredFields,
    calibration
  );

  const cropOcrResults: Record<string, CropOcrFieldResult> = {
    ...(options.cropOcrResults ?? {}),
  };

  const canLiveCrop =
    Boolean(options.cropOcrRunner) &&
    (Boolean(options.pdfBuffer?.length) ||
      Object.keys(options.roiByField ?? {}).length > 0);

  if (canLiveCrop && options.cropOcrRunner) {
    for (const request of reOcrRequests) {
      if (cropOcrResults[request.fieldName]?.value) continue;

      const roi =
        options.roiByField?.[request.fieldName] ??
        regionBBoxToRoi(request.fieldName, request.bbox);

      try {
        const crop = await options.cropOcrRunner({
          fieldId: request.fieldName,
          roi,
          pdfBuffer: options.pdfBuffer,
          skipRetry: true,
        });
        if (crop.success && crop.value) {
          cropOcrResults[request.fieldName] = {
            value: crop.value,
            confidence: crop.confidence,
            method: "crop_ocr",
          };
        }
      } catch {
        // Fail-soft: leave without crop result
      }
    }
  }

  const reOcrResults = processReOcrRequests(
    reOcrRequests,
    originalFields,
    { ...options, cropOcrResults }
  );

  const reconciledFields = mergeResults(originalFields, reOcrResults);
  const summary = calculateSummary(
    originalFields,
    reconciledFields,
    calibration
  );

  const reviewReasons: string[] = [];
  if (summary.lowConfidenceCount > 0) {
    reviewReasons.push(
      `${summary.lowConfidenceCount} field(s) have low confidence`
    );
  }
  if (summary.fieldsFailed > 0) {
    reviewReasons.push(
      `${summary.fieldsFailed} field(s) failed reconciliation`
    );
  }

  return {
    documentId,
    processedAt: new Date().toISOString(),
    processingTimeMs: Date.now() - startTime,
    originalFields,
    reOcrRequests,
    reOcrResults,
    reconciledFields,
    summary,
    requiresReview: reviewReasons.length > 0,
    reviewReasons,
  };
}

/**
 * Identify fields that need re-OCR
 */
function identifyReOcrCandidates(
  fields: ExtractedField[],
  requiredFields: string[],
  calibration: CalibrationTable
): ReOcrRequest[] {
  const requests: ReOcrRequest[] = [];

  for (const field of fields) {
    const threshold = getFieldThreshold(field.fieldName, calibration);

    // Missing value for required field
    if (!field.value && requiredFields.includes(field.fieldName)) {
      if (field.bbox) {
        requests.push({
          fieldName: field.fieldName,
          bbox: field.bbox,
          reason: "missing",
          originalValue: field.value ?? undefined,
          originalConfidence: field.confidence,
        });
      }
      continue;
    }

    // Low confidence
    if (field.confidence < threshold && field.bbox) {
      requests.push({
        fieldName: field.fieldName,
        bbox: field.bbox,
        reason: "low_confidence",
        originalValue: field.value ?? undefined,
        originalConfidence: field.confidence,
      });
    }
  }

  return requests.sort((a, b) => a.fieldName.localeCompare(b.fieldName));
}

function getFieldThreshold(
  fieldName: string,
  calibration: CalibrationTable
): number {
  const entry = calibration.entries.find(
    e => e.fieldName === fieldName || e.fieldName === "*"
  );
  return entry?.threshold ?? calibration.defaultThreshold;
}

/**
 * Process re-OCR requests using real crop OCR results when provided.
 * Never fabricates high-confidence placeholder values.
 */
function processReOcrRequests(
  requests: ReOcrRequest[],
  originalFields: ExtractedField[],
  options: ReconcileOptions
): ReOcrResult[] {
  const results: ReOcrResult[] = [];

  for (const request of requests) {
    const startTime = Date.now();
    const original = originalFields.find(
      f => f.fieldName === request.fieldName
    );
    const resolved = resolveReOcr(request, original, options);

    results.push({
      fieldName: request.fieldName,
      success: resolved.success,
      newValue: resolved.value,
      newConfidence: resolved.confidence,
      method: resolved.method,
      processingTimeMs: Date.now() - startTime,
    });
  }

  return results;
}

/**
 * Resolve a re-OCR candidate: crop OCR first, then optional rawText regex.
 * No simulated confidence bumps or invented JOB-ROI / phone placeholders.
 */
function resolveReOcr(
  request: ReOcrRequest,
  original: ExtractedField | undefined,
  options: ReconcileOptions
): {
  success: boolean;
  value: string | null;
  confidence: number;
  method: ReOcrMethod;
} {
  const crop = options.cropOcrResults?.[request.fieldName];
  if (crop && crop.value && crop.confidence > 0) {
    return {
      success: true,
      value: crop.value,
      confidence: Math.min(1, Math.max(0, crop.confidence)),
      method: crop.method ?? "crop_ocr",
    };
  }

  if (options.enableTextFallback && original?.rawText?.trim()) {
    const fromText = extractFromRawText(request.fieldName, original.rawText);
    if (fromText.value) {
      return {
        success: true,
        value: fromText.value,
        confidence: fromText.confidence,
        method: "regex",
      };
    }
  }

  return {
    success: false,
    value: null,
    confidence: 0,
    method: "unavailable",
  };
}

/**
 * Evidence-only regex from rawText — never invents example.com / 555 numbers.
 */
function extractFromRawText(
  fieldName: string,
  rawText: string
): { value: string | null; confidence: number } {
  const lower = fieldName.toLowerCase();
  const text = rawText.trim();
  if (!text) return { value: null, confidence: 0 };

  if (lower.includes("phone")) {
    const m = text.match(
      /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?)?\d{3,4}[\s.-]?\d{3,4}/
    );
    if (m?.[0]) {
      return { value: m[0].trim().slice(0, 40), confidence: 0.85 };
    }
  }

  if (lower.includes("email")) {
    const m = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    if (m?.[0]) {
      return { value: m[0].trim().slice(0, 120), confidence: 0.9 };
    }
  }

  return { value: null, confidence: 0 };
}

function mergeResults(
  originalFields: ExtractedField[],
  reOcrResults: ReOcrResult[]
): ExtractedField[] {
  const resultMap = new Map<string, ReOcrResult>();
  for (const result of reOcrResults) {
    resultMap.set(result.fieldName, result);
  }

  const merged: ExtractedField[] = [];

  for (const original of originalFields) {
    const reOcrResult = resultMap.get(original.fieldName);

    if (
      reOcrResult &&
      reOcrResult.success &&
      reOcrResult.newConfidence > original.confidence
    ) {
      merged.push({
        ...original,
        value: reOcrResult.newValue,
        confidence: reOcrResult.newConfidence,
        source: "reocr",
      });
    } else {
      merged.push(original);
    }
  }

  return merged.sort((a, b) => a.fieldName.localeCompare(b.fieldName));
}

function calculateSummary(
  originalFields: ExtractedField[],
  reconciledFields: ExtractedField[],
  calibration: CalibrationTable
): ReconciliationResult["summary"] {
  let improved = 0;
  let unchanged = 0;
  let failed = 0;
  let totalConfidence = 0;
  let lowConfidence = 0;

  for (const reconciled of reconciledFields) {
    const original = originalFields.find(
      f => f.fieldName === reconciled.fieldName
    );
    const threshold = getFieldThreshold(reconciled.fieldName, calibration);

    if (reconciled.source === "reocr") {
      if (reconciled.confidence > (original?.confidence ?? 0)) {
        improved++;
      } else {
        failed++;
      }
    } else {
      unchanged++;
    }

    totalConfidence += reconciled.confidence;
    if (reconciled.confidence < threshold) {
      lowConfidence++;
    }
  }

  return {
    totalFields: reconciledFields.length,
    fieldsImproved: improved,
    fieldsUnchanged: unchanged,
    fieldsFailed: failed,
    averageConfidence:
      reconciledFields.length > 0
        ? Math.round((totalConfidence / reconciledFields.length) * 100) / 100
        : 0,
    lowConfidenceCount: lowConfidence,
  };
}

/**
 * Determine review routing based on reconciliation result
 */
export function determineReviewRouting(
  result: ReconciliationResult,
  requiredFields: string[] = []
): ReviewRoutingDecision {
  const reasons: ReviewReason[] = [];

  for (const field of result.reconciledFields) {
    if (field.confidence < 0.5) {
      reasons.push({
        code: "LOW_CONFIDENCE_FIELD",
        severity: requiredFields.includes(field.fieldName) ? "S1" : "S2",
        message: `Field "${field.fieldName}" has low confidence (${Math.round(field.confidence * 100)}%)`,
        fieldName: field.fieldName,
        confidence: field.confidence,
      });
    }
  }

  for (const required of requiredFields) {
    const field = result.reconciledFields.find(f => f.fieldName === required);
    if (!field || !field.value) {
      reasons.push({
        code: "MISSING_REQUIRED",
        severity: "S0",
        message: `Required field "${required}" is missing`,
        fieldName: required,
      });
    }
  }

  if (result.summary.fieldsFailed > 0) {
    reasons.push({
      code: "RECONCILIATION_FAILED",
      severity: "S2",
      message: `${result.summary.fieldsFailed} field(s) failed reconciliation`,
    });
  }

  reasons.sort((a, b) => {
    const severityOrder = { S0: 0, S1: 1, S2: 2, S3: 3 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });

  let priority: "low" | "medium" | "high" = "low";
  if (reasons.some(r => r.severity === "S0")) {
    priority = "high";
  } else if (reasons.some(r => r.severity === "S1")) {
    priority = "medium";
  }

  return {
    shouldRoute: reasons.length > 0,
    priority,
    reasons,
  };
}

/**
 * Generate reconciliation artifact JSON
 */
export function generateReconciliationArtifact(
  result: ReconciliationResult
): string {
  const artifact = {
    schemaVersion: "1.0.0",
    documentId: result.documentId,
    processedAt: result.processedAt,
    processingTimeMs: result.processingTimeMs,
    summary: result.summary,
    reconciledFields: result.reconciledFields.map(f => ({
      fieldName: f.fieldName,
      value: f.value,
      confidence: Math.round(f.confidence * 100) / 100,
      source: f.source,
    })),
    reOcrAttempts: result.reOcrResults.map(r => ({
      fieldName: r.fieldName,
      success: r.success,
      method: r.method,
      newConfidence: Math.round(r.newConfidence * 100) / 100,
    })),
    requiresReview: result.requiresReview,
    reviewReasons: result.reviewReasons,
  };

  return JSON.stringify(artifact, null, 2);
}
