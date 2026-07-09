/**
 * Release bar module (Phase 3.6)
 *
 * Smoke checklist and quarantine exit criteria helpers.
 * Feature-flagged via FEATURE_RELEASE_BAR (default OFF).
 */

import type { QuarantineCriteria } from "./types";

export const FEATURE_FLAG = "FEATURE_RELEASE_BAR";

export const DEFAULT_CRITERIA: QuarantineCriteria = {
  maxOpenSev1: 0,
  maxFailingSmoke: 0,
  requireE2E: true,
};

export * from "./types";
export { evaluateReleaseBar } from "./evaluate";
export type { EvaluateReleaseBarOptions } from "./evaluate";

/**
 * Default: disabled when FEATURE_RELEASE_BAR unset.
 * Set FEATURE_RELEASE_BAR=true to enable.
 */
export function isReleaseBarEnabled(): boolean {
  return process.env[FEATURE_FLAG] === "true";
}
