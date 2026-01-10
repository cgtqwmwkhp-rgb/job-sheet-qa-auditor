/**
 * ROI Extraction Service
 * 
 * PR-J: ROI-targeted processing for critical fields.
 * Improves accuracy and speed by extracting from specific regions.
 */

import type { RoiConfig, RoiRegion } from '../templateRegistry/types';

/**
 * Critical field IDs that benefit from ROI-targeted extraction
 */
export const CRITICAL_ROI_FIELDS = [
  'jobReference',
  'assetId',
  'date',
  'expiryDate',
  'tickboxBlock',
  'signatureBlock',
] as const;

export type CriticalRoiField = typeof CRITICAL_ROI_FIELDS[number];

/**
 * Fields requiring image QA (visual verification)
 */
export const IMAGE_QA_FIELDS = ['tickboxBlock', 'signatureBlock'] as const;
export type ImageQaField = typeof IMAGE_QA_FIELDS[number];

/**
 * ROI extraction result for a single field
 */
export interface RoiExtractionResult {
  fieldId: string;
  extracted: boolean;
  value: string | null;
  confidence: number;
  source: 'roi' | 'fullpage' | 'reprocessed';
  roiRegion?: RoiRegion;
  reprocessAttempts: number;
  imageQaResult?: ImageQaResult;
}

/**
 * Image QA result for visual fields
 */
export interface ImageQaResult {
  fieldId: string;
  passed: boolean;
  checkType: 'signature_present' | 'tickboxes_checked';
  confidence: number;
  details: string;
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

/**
 * Check if a field is a critical ROI field
 */
export function isCriticalRoiField(fieldId: string): fieldId is CriticalRoiField {
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

/**
 * Mock OCR extraction from ROI region
 * In production, this would call actual OCR with ROI coordinates
 */
export function extractFromRoi(
  _documentText: string,
  roi: RoiRegion,
  fieldId: string
): { value: string | null; confidence: number } {
  // Simulate ROI-based extraction with higher confidence
  // In production: crop image to ROI bounds, run OCR on crop
  
  // Mock: return placeholder value with high confidence
  const mockValues: Record<string, string> = {
    jobReference: 'JOB-ROI-001',
    assetId: 'ASSET-ROI-001',
    date: '2024-01-15',
    expiryDate: '2025-01-15',
    tickboxBlock: 'all_checked',
    signatureBlock: 'signed',
  };

  return {
    value: mockValues[fieldId] ?? `extracted-${fieldId}`,
    confidence: 0.92, // ROI extraction typically has higher confidence
  };
}

/**
 * Mock image QA for visual fields
 */
export function runImageQa(
  _roi: RoiRegion,
  fieldId: ImageQaField
): ImageQaResult {
  // In production: run vision model on ROI crop
  
  const checkType = fieldId === 'signatureBlock' 
    ? 'signature_present' 
    : 'tickboxes_checked';

  return {
    fieldId,
    passed: true,
    checkType,
    confidence: 0.88,
    details: `${checkType} verified in ROI region`,
  };
}

/**
 * Process a document using ROI-targeted extraction
 */
export function processWithRoi(
  documentId: number,
  documentText: string,
  templateVersionId: number,
  roiConfig: RoiConfig | null,
  fieldIds: string[],
  caps: PerformanceCaps = DEFAULT_PERFORMANCE_CAPS
): RoiProcessingTrace {
  const startTime = Date.now();
  const results: RoiExtractionResult[] = [];
  const warnings: string[] = [];
  let totalReprocessAttempts = 0;

  // Check for missing critical ROIs
  const missingCritical = getMissingCriticalRois(roiConfig);
  if (missingCritical.length > 0) {
    warnings.push(`Missing critical ROIs: ${missingCritical.join(', ')}`);
  }

  for (const fieldId of fieldIds) {
    const roi = getRoiForField(roiConfig, fieldId);
    let extracted = false;
    let value: string | null = null;
    let confidence = 0;
    let source: 'roi' | 'fullpage' | 'reprocessed' = 'fullpage';
    let reprocessAttempts = 0;
    let imageQaResult: ImageQaResult | undefined;

    if (roi) {
      // ROI exists - extract from region
      const roiResult = extractFromRoi(documentText, roi, fieldId);
      value = roiResult.value;
      confidence = roiResult.confidence;
      source = 'roi';
      extracted = confidence >= caps.minConfidenceThreshold;

      // Run image QA for visual fields
      if (requiresImageQa(fieldId)) {
        imageQaResult = runImageQa(roi, fieldId as ImageQaField);
      }

      // Reprocess if low confidence (respecting caps)
      if (!extracted && totalReprocessAttempts < caps.maxReprocessAttemptsPerDoc) {
        while (
          !extracted &&
          reprocessAttempts < caps.maxReprocessAttemptsPerRoi &&
          totalReprocessAttempts < caps.maxReprocessAttemptsPerDoc
        ) {
          reprocessAttempts++;
          totalReprocessAttempts++;
          
          // Simulate reprocessing with slightly better result
          const reprocessResult = extractFromRoi(documentText, roi, fieldId);
          value = reprocessResult.value;
          confidence = Math.min(reprocessResult.confidence + 0.05, 0.95);
          source = 'reprocessed';
          extracted = confidence >= caps.minConfidenceThreshold;
        }
      }
    } else if (isCriticalRoiField(fieldId)) {
      // Critical field without ROI - flag for review
      warnings.push(`Critical field '${fieldId}' has no ROI defined`);
      extracted = false;
      confidence = 0;
    } else {
      // Non-critical field without ROI - extract from full page
      // In production: use full-page OCR result
      value = `fullpage-${fieldId}`;
      confidence = 0.75;
      extracted = true;
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
  MISSING_CRITICAL_ROI: 'SPEC_GAP',    // Config issue - ROI not defined
  IMAGE_QA_FAILED: 'OCR_FAILURE',       // Processing failure - image QA failed
  LOW_CONFIDENCE: 'LOW_CONFIDENCE',     // Document issue - extraction uncertain
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
    reasonCodes.add('SPEC_GAP');
  }

  // Check for low confidence critical fields → LOW_CONFIDENCE (document issue)
  for (const result of trace.results) {
    if (isCriticalRoiField(result.fieldId)) {
      if (!result.extracted || result.confidence < DEFAULT_PERFORMANCE_CAPS.minConfidenceThreshold) {
        reasonCodes.add('LOW_CONFIDENCE');
        break;
      }
    }
  }

  // Check for failed image QA → OCR_FAILURE (processing issue)
  for (const result of trace.results) {
    if (result.imageQaResult && !result.imageQaResult.passed) {
      reasonCodes.add('OCR_FAILURE');
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
