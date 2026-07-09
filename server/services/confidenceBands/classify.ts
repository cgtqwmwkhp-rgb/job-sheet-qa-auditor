/**
 * Pure confidence band classification (Phase 3.x)
 */

import type { BandResult, BandThresholds } from "./types";

export const DEFAULT_BAND_THRESHOLDS: BandThresholds = {
  highMin: 0.9,
  mediumMin: 0.7,
};

function clampConfidence(confidence: number): number {
  if (confidence < 0) return 0;
  if (confidence > 1) return 1;
  return confidence;
}

function resolveThresholds(thresholds?: BandThresholds): BandThresholds {
  return {
    highMin: thresholds?.highMin ?? DEFAULT_BAND_THRESHOLDS.highMin,
    mediumMin: thresholds?.mediumMin ?? DEFAULT_BAND_THRESHOLDS.mediumMin,
  };
}

/**
 * Classify a confidence score into high / medium / low bands.
 * Confidence is clamped to [0, 1] before classification.
 */
export function classifyConfidence(
  confidence: number,
  thresholds?: BandThresholds
): BandResult {
  const clamped = clampConfidence(confidence);
  const resolved = resolveThresholds(thresholds);

  if (clamped >= resolved.highMin) {
    return { band: "high", confidence: clamped };
  }

  if (clamped >= resolved.mediumMin) {
    return { band: "medium", confidence: clamped };
  }

  return { band: "low", confidence: clamped };
}
