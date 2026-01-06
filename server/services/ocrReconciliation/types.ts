/**
 * OCR Reconciliation Types
 * 
 * Types for joint OCR reconciliation and confidence calibration.
 * Supports targeted region re-processing and field-level confidence.
 */

/**
 * Bounding box for a region
 */
export interface RegionBBox {
  x: number;      // 0-100 percentage from left
  y: number;      // 0-100 percentage from top
  width: number;  // 0-100 percentage
  height: number; // 0-100 percentage
  pageNumber: number;
}

/**
 * Extracted field with confidence
 */
export interface ExtractedField {
  fieldName: string;
  value: string | null;
  confidence: number;  // 0-1
  source: 'primary' | 'reocr' | 'table_parser' | 'regex' | 'fallback';
  bbox?: RegionBBox;
  rawText?: string;
}

/**
 * Calibration entry for field confidence thresholds
 */
export interface CalibrationEntry {
  fieldName: string;
  method: 'ocr' | 'table_parser' | 'regex';
  docType: string;
  threshold: number;  // Confidence threshold (0-1)
  weight: number;     // Weight for scoring (0-1)
}

/**
 * Calibration table configuration
 */
export interface CalibrationTable {
  version: string;
  entries: CalibrationEntry[];
  defaultThreshold: number;
  defaultWeight: number;
}

/**
 * Re-OCR request for a specific region
 */
export interface ReOcrRequest {
  fieldName: string;
  bbox: RegionBBox;
  reason: 'missing' | 'low_confidence' | 'validation_failed';
  originalValue?: string;
  originalConfidence?: number;
}

/**
 * Re-OCR result
 */
export interface ReOcrResult {
  fieldName: string;
  success: boolean;
  newValue: string | null;
  newConfidence: number;
  method: 'region_ocr' | 'table_parser' | 'regex';
  processingTimeMs: number;
}

/**
 * Reconciliation result for a document
 */
export interface ReconciliationResult {
  documentId: string;
  processedAt: string;
  processingTimeMs: number;
  
  // Original extraction
  originalFields: ExtractedField[];
  
  // Re-OCR attempts
  reOcrRequests: ReOcrRequest[];
  reOcrResults: ReOcrResult[];
  
  // Final reconciled fields
  reconciledFields: ExtractedField[];
  
  // Summary
  summary: {
    totalFields: number;
    fieldsImproved: number;
    fieldsUnchanged: number;
    fieldsFailed: number;
    averageConfidence: number;
    lowConfidenceCount: number;
  };
  
  // Review routing
  requiresReview: boolean;
  reviewReasons: string[];
}

/**
 * Review routing decision based on reconciliation
 */
export interface ReviewRoutingDecision {
  shouldRoute: boolean;
  priority: 'low' | 'medium' | 'high';
  reasons: ReviewReason[];
}

/**
 * Reason for routing to review
 */
export interface ReviewReason {
  code: 'LOW_QUALITY_DOC' | 'LOW_CONFIDENCE_FIELD' | 'MISSING_REQUIRED' | 'RECONCILIATION_FAILED';
  severity: 'S0' | 'S1' | 'S2' | 'S3';
  message: string;
  fieldName?: string;
  confidence?: number;
}

/**
 * Get default calibration table
 */
export function getDefaultCalibrationTable(): CalibrationTable {
  return {
    version: '1.0.0',
    defaultThreshold: 0.7,
    defaultWeight: 1.0,
    entries: [
      // High-priority fields with strict thresholds
      { fieldName: 'jobNumber', method: 'ocr', docType: '*', threshold: 0.9, weight: 1.0 },
      { fieldName: 'customerName', method: 'ocr', docType: '*', threshold: 0.85, weight: 1.0 },
      { fieldName: 'serviceDate', method: 'ocr', docType: '*', threshold: 0.85, weight: 1.0 },
      { fieldName: 'technicianName', method: 'ocr', docType: '*', threshold: 0.8, weight: 0.9 },
      { fieldName: 'customerSignature', method: 'ocr', docType: '*', threshold: 0.75, weight: 1.0 },
      { fieldName: 'technicianSignature', method: 'ocr', docType: '*', threshold: 0.75, weight: 1.0 },
      
      // Table-parsed fields
      { fieldName: 'partsUsed', method: 'table_parser', docType: '*', threshold: 0.7, weight: 0.8 },
      { fieldName: 'laborHours', method: 'table_parser', docType: '*', threshold: 0.75, weight: 0.9 },
      
      // Regex-extracted fields
      { fieldName: 'phoneNumber', method: 'regex', docType: '*', threshold: 0.95, weight: 0.7 },
      { fieldName: 'email', method: 'regex', docType: '*', threshold: 0.95, weight: 0.7 },
    ],
  };
}
