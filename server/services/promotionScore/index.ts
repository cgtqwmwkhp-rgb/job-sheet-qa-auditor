/**
 * Promotion readiness score module (Phase 3.x)
 *
 * Pure promotion score helpers from calibration and release signals.
 * Feature-flagged via FEATURE_PROMOTION_SCORE (default OFF).
 */

export const FEATURE_FLAG = "FEATURE_PROMOTION_SCORE";

export * from "./types";
export { scorePromotion } from "./score";
export type { ScorePromotionOptions } from "./score";

/**
 * Default: disabled when FEATURE_PROMOTION_SCORE unset.
 * Set FEATURE_PROMOTION_SCORE=true to enable.
 */
export function isPromotionScoreEnabled(): boolean {
  return process.env[FEATURE_FLAG] === "true";
}
