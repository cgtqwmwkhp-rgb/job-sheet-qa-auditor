/**
 * Confidence calibration types (Phase 3.3)
 */

export interface PredictionSample {
  confidence: number;
  correct: boolean;
}

export interface EceBin {
  lower: number;
  upper: number;
  avgConfidence: number;
  accuracy: number;
  count: number;
}

export interface EceResult {
  ece: number;
  bins: EceBin[];
}

export interface ThresholdSuggestion {
  currentThreshold: number;
  suggestedThreshold: number;
  estimatedAutoPassRate: number;
  estimatedOverturnRate: number;
}

export interface ThresholdOptions {
  targetOverturnRate?: number;
  minAutoPassRate?: number;
  currentThreshold?: number;
}
