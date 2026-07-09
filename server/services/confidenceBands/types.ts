/**
 * Confidence band types (Phase 3.x)
 */

export type ConfidenceBand = "high" | "medium" | "low";

export interface BandThresholds {
  highMin: number;
  mediumMin: number;
}

export interface BandResult {
  band: ConfidenceBand;
  confidence: number;
}
