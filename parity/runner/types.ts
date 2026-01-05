/**
 * Parity Runner Types - Stage 8 v2
 * 
 * Types for parity testing with positive/negative suite support.
 */

/**
 * Canonical reason codes - the only valid codes in the system
 */
export const CANONICAL_REASON_CODES = [
  'VALID',
  'MISSING_FIELD',
  'INVALID_FORMAT',
  'OUT_OF_POLICY',
  'LOW_CONFIDENCE',
  'CONFLICT',
] as const;

export type CanonicalReasonCode = typeof CANONICAL_REASON_CODES[number];

/**
 * Severity levels
 */
export type Severity = 'S0' | 'S1' | 'S2' | 'S3';

/**
 * Expected failure specification for negative suite
 */
export interface ExpectedFailure {
  ruleId: string;
  field: string;
  reasonCode: CanonicalReasonCode;
  severity: Severity;
}

/**
 * Golden document fixture
 */
export interface GoldenDocument {
  id: string;
  name: string;
  description: string;
  expectedResult: 'pass' | 'fail';
  reviewQueueReasons?: string[];
  extractedFields: Record<string, unknown>;
  validatedFields: GoldenValidatedField[];
  findings: GoldenFinding[];
  /** Expected failures for negative suite documents */
  expectedFailures?: ExpectedFailure[];
}

/**
 * Golden validated field
 */
export interface GoldenValidatedField {
  ruleId: string;
  field: string;
  status: 'passed' | 'failed' | 'skipped' | 'error';
  value: unknown;
  confidence: number;
  pageNumber?: number;
  severity: Severity;
  reasonCode?: CanonicalReasonCode;
  message?: string;
  evidence?: {
    snippet: string;
    boundingBox: unknown;
  };
}

/**
 * Golden finding
 */
export interface GoldenFinding {
  id: number | string;
  ruleId: string;
  field: string;
  severity: Severity;
  reasonCode?: CanonicalReasonCode;
  message: string;
  extractedValue?: string;
  expectedPattern?: string;
  pageNumber?: number;
  evidence?: {
    snippet: string;
    boundingBox: unknown;
  };
}

/**
 * Golden dataset (base structure)
 */
export interface GoldenDataset {
  version: string;
  schemaVersion: string;
  description: string;
  createdAt: string;
  documents: GoldenDocument[];
  rules?: GoldenRule[];
  reasonCodes?: Record<string, string>;
  canonicalReasonCodes?: CanonicalReasonCode[];
}

/**
 * Golden rule definition
 */
export interface GoldenRule {
  ruleId: string;
  field: string;
  description: string;
  severity: Severity;
  pattern?: string;
}

/**
 * Parity comparison result
 */
export type ParityStatus = 'same' | 'improved' | 'worse' | 'new' | 'missing';

/**
 * Field comparison result
 */
export interface FieldComparison {
  ruleId: string;
  field: string;
  status: ParityStatus;
  expected: GoldenValidatedField | null;
  actual: GoldenValidatedField | null;
  diff?: {
    statusChanged?: boolean;
    valueChanged?: boolean;
    confidenceChanged?: number;
    severityChanged?: boolean;
    reasonCodeChanged?: boolean;
  };
}

/**
 * Document comparison result
 */
export interface DocumentComparison {
  documentId: string;
  documentName: string;
  status: ParityStatus;
  expectedResult: 'pass' | 'fail';
  actualResult: 'pass' | 'fail' | null;
  fieldComparisons: FieldComparison[];
  findingsComparison: {
    expected: number;
    actual: number;
    matched: number;
    missing: number;
    extra: number;
  };
  summary: {
    same: number;
    improved: number;
    worse: number;
    new: number;
    missing: number;
  };
}

/**
 * Negative suite result for a single document
 */
export interface NegativeDocumentResult {
  documentId: string;
  documentName: string;
  status: 'pass' | 'fail';
  expectedFailures: ExpectedFailure[];
  detectedFailures: ExpectedFailure[];
  matchedFailures: ExpectedFailure[];
  missedFailures: ExpectedFailure[];
  unexpectedFailures: ExpectedFailure[];
}

/**
 * Parity report for positive suite
 */
export interface PositiveParityReport {
  version: string;
  runId: string;
  timestamp: string;
  goldenVersion: string;
  suiteType: 'positive';
  status: 'pass' | 'fail' | 'warning';
  summary: {
    totalDocuments: number;
    same: number;
    improved: number;
    worse: number;
    totalFields: number;
    fieldsSame: number;
    fieldsImproved: number;
    fieldsWorse: number;
  };
  documents: DocumentComparison[];
  thresholds: ParityThresholds;
  violations: string[];
}

/**
 * Parity report for negative suite
 */
export interface NegativeParityReport {
  version: string;
  runId: string;
  timestamp: string;
  goldenVersion: string;
  suiteType: 'negative';
  status: 'pass' | 'fail';
  summary: {
    totalDocuments: number;
    passed: number;
    failed: number;
    totalExpectedFailures: number;
    matchedFailures: number;
    missedFailures: number;
    unexpectedFailures: number;
  };
  documents: NegativeDocumentResult[];
  violations: string[];
}

/**
 * Combined parity report
 */
export interface CombinedParityReport {
  version: string;
  runId: string;
  timestamp: string;
  status: 'pass' | 'fail';
  positive: PositiveParityReport;
  negative: NegativeParityReport;
  violations: string[];
}

/**
 * Legacy parity report (for backwards compatibility)
 */
export interface ParityReport {
  version: string;
  runId: string;
  timestamp: string;
  goldenVersion: string;
  status: 'pass' | 'fail' | 'warning';
  summary: {
    totalDocuments: number;
    same: number;
    improved: number;
    worse: number;
    totalFields: number;
    fieldsSame: number;
    fieldsImproved: number;
    fieldsWorse: number;
  };
  documents: DocumentComparison[];
  thresholds: ParityThresholds;
  violations: string[];
}

/**
 * Parity thresholds for positive suite
 */
export interface ParityThresholds {
  maxWorseDocuments: number;
  maxWorseFields: number;
  maxMissingFields: number;
  minSamePercentage: number;
}

/**
 * Default thresholds for positive suite (strict - 100% pass required)
 */
export const DEFAULT_THRESHOLDS: ParityThresholds = {
  maxWorseDocuments: 0,
  maxWorseFields: 0,
  maxMissingFields: 0,
  minSamePercentage: 100,
};

/**
 * Validate that a reason code is canonical
 */
export function isCanonicalReasonCode(code: string): code is CanonicalReasonCode {
  return CANONICAL_REASON_CODES.includes(code as CanonicalReasonCode);
}

/**
 * Map legacy reason codes to canonical codes
 */
export function mapToCanonicalReasonCode(code: string): CanonicalReasonCode {
  const mapping: Record<string, CanonicalReasonCode> = {
    'OUT_OF_RANGE': 'OUT_OF_POLICY',
    'RANGE_ERROR': 'OUT_OF_POLICY',
    'POLICY_VIOLATION': 'OUT_OF_POLICY',
  };
  
  if (isCanonicalReasonCode(code)) {
    return code;
  }
  
  return mapping[code] || 'OUT_OF_POLICY';
}
