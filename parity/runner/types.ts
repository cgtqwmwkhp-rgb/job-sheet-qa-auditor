/**
 * Parity Runner Types - Stage 8
 * 
 * Types for parity testing and comparison.
 */

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
  severity: 'critical' | 'major' | 'minor' | 'info';
  message?: string;
}

/**
 * Golden finding
 */
export interface GoldenFinding {
  id: number;
  ruleId: string;
  field: string;
  severity: 'critical' | 'major' | 'minor' | 'info';
  message: string;
  extractedValue?: string;
  expectedPattern?: string;
  pageNumber?: number;
}

/**
 * Golden dataset
 */
export interface GoldenDataset {
  version: string;
  description: string;
  createdAt: string;
  documents: GoldenDocument[];
  rules: GoldenRule[];
}

/**
 * Golden rule definition
 */
export interface GoldenRule {
  ruleId: string;
  field: string;
  description: string;
  severity: 'critical' | 'major' | 'minor' | 'info';
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
 * Parity report
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
 * Parity thresholds
 */
export interface ParityThresholds {
  maxWorseDocuments: number;
  maxWorseFields: number;
  maxMissingFields: number;
  minSamePercentage: number;
}

/**
 * Default thresholds
 */
export const DEFAULT_THRESHOLDS: ParityThresholds = {
  maxWorseDocuments: 0,
  maxWorseFields: 0,
  maxMissingFields: 0,
  minSamePercentage: 95,
};
