/**
 * Overturn cost estimator module (Phase 3.x)
 *
 * Pure helpers for estimating review cost from overturn events.
 * Feature-flagged via FEATURE_OVERTURN_COST (default OFF).
 */

export const FEATURE_FLAG = "FEATURE_OVERTURN_COST";

export * from "./types";
export * from "./estimate";

/**
 * Default: disabled when FEATURE_OVERTURN_COST unset.
 * Set FEATURE_OVERTURN_COST=true to enable.
 */
export function isOverturnCostEnabled(): boolean {
  return process.env[FEATURE_FLAG] === "true";
}
