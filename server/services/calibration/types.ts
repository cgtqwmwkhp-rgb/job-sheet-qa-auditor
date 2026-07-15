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
  /** Null when unmeasurable or N below readiness threshold — never theater 0. */
  ece: number | null;
  bins: EceBin[];
  /** True only when labelled sample count ≥ ECE_MIN_SAMPLES (N≥200). */
  measurementReady: boolean;
  /** Number of labelled prediction samples contributing to this result. */
  sampleCount: number;
  /** Readiness threshold (default 200). */
  minSamplesRequired: number;
  /**
   * Computed ECE while still accumulating labels (measurementReady=false).
   * Must not be treated as an authoritative calibration score.
   */
  provisionalEce?: number;
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
