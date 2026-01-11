/**
 * Evaluation Harness Types
 * 
 * OCRBench-style metrics for document processing accuracy.
 * Used for continuous evaluation of:
 * - Template selection accuracy
 * - Critical field extraction accuracy
 * - OCR + Image QA fusion agreement
 * - Pass-2 (escalation) trigger rates
 */

/**
 * Evaluation document source
 */
export type EvalDocumentSource = 'fixture' | 'sampled_production' | 'synthetic';

/**
 * Evaluation document metadata
 */
export interface EvalDocument {
  id: string;
  name: string;
  source: EvalDocumentSource;
  templateId: string;
  assetType: string;
  customerId?: string;
  expectedTemplateId: string;
  expectedResult: 'pass' | 'fail';
  fields: EvalField[];
  fusionExpectations?: FusionExpectation[];
}

/**
 * Individual field for evaluation
 */
export interface EvalField {
  fieldId: string;
  fieldName: string;
  expectedValue: unknown;
  actualValue?: unknown;
  extractionConfidence?: number;
  isCorrect?: boolean;
  severity: 'S0' | 'S1' | 'S2' | 'S3';
  isCritical: boolean;
}

/**
 * Fusion expectation for OCR + Image QA agreement
 */
export interface FusionExpectation {
  fieldId: string;
  ocrValue?: unknown;
  imageQaValue?: unknown;
  expectedAgreement: boolean;
  actualAgreement?: boolean;
  fusionDecision?: 'ocr' | 'image_qa' | 'merged' | 'conflict';
}

/**
 * Selection accuracy metrics
 */
export interface SelectionMetrics {
  totalDocuments: number;
  correctSelections: number;
  incorrectSelections: number;
  ambiguousSelections: number;
  accuracy: number;
  ambiguityRate: number;
  byTemplateId: Record<string, {
    total: number;
    correct: number;
    accuracy: number;
  }>;
  byAssetType: Record<string, {
    total: number;
    correct: number;
    accuracy: number;
  }>;
}

/**
 * Critical field accuracy metrics
 */
export interface CriticalFieldMetrics {
  totalFields: number;
  correctFields: number;
  incorrectFields: number;
  missingFields: number;
  accuracy: number;
  bySeverity: Record<'S0' | 'S1' | 'S2' | 'S3', {
    total: number;
    correct: number;
    accuracy: number;
  }>;
  byField: Record<string, {
    total: number;
    correct: number;
    accuracy: number;
  }>;
  criticalOnlyAccuracy: number;
}

/**
 * OCR + Image QA fusion metrics
 */
export interface FusionMetrics {
  totalComparisons: number;
  agreements: number;
  disagreements: number;
  agreementRate: number;
  ocrPreferred: number;
  imageQaPreferred: number;
  mergedDecisions: number;
  conflictResolutions: number;
  byField: Record<string, {
    total: number;
    agreements: number;
    agreementRate: number;
  }>;
}

/**
 * Pass-2 trigger metrics (escalation to interpreter)
 */
export interface Pass2Metrics {
  totalDocuments: number;
  pass2Triggered: number;
  pass2Rate: number;
  triggerReasons: Record<string, number>;
  byTemplateId: Record<string, {
    total: number;
    triggered: number;
    rate: number;
  }>;
  interpreterUsage: {
    gemini: number;
    claude: number;
    escalatedToClaude: number;
  };
}

/**
 * Trend delta for comparison with previous run
 */
export interface TrendDelta {
  metric: string;
  previous: number;
  current: number;
  delta: number;
  deltaPercent: number;
  trend: 'improving' | 'stable' | 'degrading';
}

/**
 * Complete evaluation report
 */
export interface EvalReport {
  version: string;
  runId: string;
  timestamp: string;
  environment: 'local' | 'staging' | 'production';
  
  // Document summary
  documentSummary: {
    total: number;
    fixtures: number;
    sampledProduction: number;
    synthetic: number;
  };
  
  // Core metrics
  selectionMetrics: SelectionMetrics;
  criticalFieldMetrics: CriticalFieldMetrics;
  fusionMetrics: FusionMetrics;
  pass2Metrics: Pass2Metrics;
  
  // Overall score (weighted average)
  overallScore: number;
  
  // Trend comparisons
  trends: TrendDelta[];
  
  // Individual document results (for drill-down)
  documentResults: EvalDocumentResult[];
  
  // Metadata
  metadata: {
    goldenDatasetVersion: string;
    evaluatorVersion: string;
    configHash: string;
  };
}

/**
 * Individual document evaluation result
 */
export interface EvalDocumentResult {
  documentId: string;
  documentName: string;
  source: EvalDocumentSource;
  
  // Selection result
  selection: {
    expectedTemplateId: string;
    actualTemplateId: string | null;
    isCorrect: boolean;
    confidence: number;
    runnerUpDelta: number;
    isAmbiguous: boolean;
  };
  
  // Field results
  fields: {
    fieldId: string;
    fieldName: string;
    expectedValue: unknown;
    actualValue: unknown;
    isCorrect: boolean;
    confidence: number;
    severity: 'S0' | 'S1' | 'S2' | 'S3';
  }[];
  
  // Fusion results
  fusionResults: {
    fieldId: string;
    ocrValue: unknown;
    imageQaValue: unknown;
    agreed: boolean;
    decision: 'ocr' | 'image_qa' | 'merged' | 'conflict';
  }[];
  
  // Pass-2 info
  pass2: {
    triggered: boolean;
    reason?: string;
    interpreter?: 'gemini' | 'claude';
    escalated?: boolean;
  };
  
  // Overall result
  overallResult: 'pass' | 'fail';
  expectedResult: 'pass' | 'fail';
  matchesExpectation: boolean;
}

/**
 * Evaluation configuration
 */
export interface EvalConfig {
  // Sources to include
  includeSources: EvalDocumentSource[];
  
  // Sampling configuration for production docs
  productionSampling: {
    enabled: boolean;
    sampleSize: number;
    stratifyBy: 'templateId' | 'assetType' | 'customerId';
  };
  
  // Metric weights for overall score
  weights: {
    selectionAccuracy: number;
    criticalFieldAccuracy: number;
    fusionAgreement: number;
    pass2Rate: number;
  };
  
  // Thresholds for alerts
  alertThresholds: {
    selectionAccuracyMin: number;
    criticalFieldAccuracyMin: number;
    fusionAgreementMin: number;
    pass2RateMax: number;
  };
  
  // Previous run for trend comparison
  previousRunId?: string;
}

/**
 * Default evaluation configuration
 */
export const DEFAULT_EVAL_CONFIG: EvalConfig = {
  includeSources: ['fixture', 'sampled_production'],
  productionSampling: {
    enabled: false,
    sampleSize: 100,
    stratifyBy: 'templateId',
  },
  weights: {
    selectionAccuracy: 0.30,
    criticalFieldAccuracy: 0.40,
    fusionAgreement: 0.20,
    pass2Rate: 0.10,
  },
  alertThresholds: {
    selectionAccuracyMin: 0.95,
    criticalFieldAccuracyMin: 0.90,
    fusionAgreementMin: 0.85,
    pass2RateMax: 0.15,
  },
};
