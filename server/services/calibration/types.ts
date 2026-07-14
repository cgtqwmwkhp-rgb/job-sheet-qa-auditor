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
  /** Null when no labelled samples — never report 0 as perfect calibration. */
  ece: number | null;
  bins: EceBin[];
  /** True only when sample count supports a meaningful ECE measurement. */
  measurementReady: boolean;
  note?: string;
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
