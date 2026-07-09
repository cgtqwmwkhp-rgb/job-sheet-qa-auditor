/**
 * FinOps stage cost rollup module (Phase 3.x)
 *
 * Pure helpers for aggregating per-stage cost and latency observations.
 * Feature-flagged via FEATURE_FINOPS (default OFF). No processor wiring yet.
 */

export const FEATURE_FLAG = "FEATURE_FINOPS";

export * from "./types";
export { rollupStageCosts } from "./rollup";

/**
 * Default: disabled when FEATURE_FINOPS unset.
 * Set FEATURE_FINOPS=true to enable downstream wiring.
 */
export function isFinOpsEnabled(): boolean {
  return process.env[FEATURE_FLAG] === "true";
}
