/**
 * Confidence calibration module (Phase 3.3)
 *
 * ECE baselines and threshold tuning helpers for auto-pass / overturn rates.
 * Human review labels feed PredictionSample[] toward N≥200 readiness.
 * Feature-flagged (FEATURE_CALIBRATION). Default OFF.
 */

export const FEATURE_FLAG = "FEATURE_CALIBRATION";

export * from "./types";
export * from "./ece";
export * from "./thresholds";
export * from "./reviewLabels";

/**
 * Default: disabled when FEATURE_CALIBRATION unset.
 * Set FEATURE_CALIBRATION=true to enable.
 */
export function isCalibrationEnabled(): boolean {
  return process.env[FEATURE_FLAG] === "true";
}
