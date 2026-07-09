/**
 * Reviewer load balancer module (Phase 3.x)
 *
 * Pure helpers for least-loaded reviewer assignment.
 * Feature-flagged via FEATURE_REVIEW_LOAD (default OFF). No processor wiring yet.
 */

export const FEATURE_FLAG = "FEATURE_REVIEW_LOAD";

export * from "./types";
export { assignToLeastLoaded } from "./assign";

/**
 * Default: disabled when FEATURE_REVIEW_LOAD unset.
 * Set FEATURE_REVIEW_LOAD=true to enable downstream wiring.
 */
export function isReviewLoadEnabled(): boolean {
  return process.env[FEATURE_FLAG] === "true";
}
