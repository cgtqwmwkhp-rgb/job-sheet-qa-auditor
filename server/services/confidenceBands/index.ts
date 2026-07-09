/**
 * Confidence band classifier module (Phase 3.x)
 *
 * Pure helpers for high / medium / low confidence bands.
 * Feature-flagged (FEATURE_CONFIDENCE_BANDS). Default OFF — no processor wiring yet.
 */

export const FEATURE_FLAG = "FEATURE_CONFIDENCE_BANDS";

export * from "./types";
export { classifyConfidence, DEFAULT_BAND_THRESHOLDS } from "./classify";

/**
 * Default: disabled when FEATURE_CONFIDENCE_BANDS unset.
 * Set FEATURE_CONFIDENCE_BANDS=true to enable.
 */
export function isConfidenceBandsEnabled(): boolean {
  return process.env[FEATURE_FLAG] === "true";
}
