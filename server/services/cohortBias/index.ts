/**
 * Cohort bias monitoring module (Phase 3.2)
 *
 * Shadow disagreement stats by cohort. Feature-flagged via
 * FEATURE_COHORT_BIAS (default OFF). No shadowChallenger wiring yet.
 */

export const FEATURE_FLAG = "FEATURE_COHORT_BIAS";

export * from "./types";
export { computeCohortBias } from "./stats";

/**
 * Default: disabled when FEATURE_COHORT_BIAS unset.
 * Set FEATURE_COHORT_BIAS=true to enable downstream wiring.
 */
export function isCohortBiasEnabled(): boolean {
  return process.env[FEATURE_FLAG] === "true";
}
