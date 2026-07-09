/**
 * Stage cost/latency SLO module (Phase 3.7)
 *
 * Per-pipeline-stage budgets for OCR, ensemble, judgment, and VLM.
 * Feature-flagged (FEATURE_STAGE_SLO). Default OFF — no processor wiring yet.
 */

export const FEATURE_FLAG = "FEATURE_STAGE_SLO";

export * from "./types";
export * from "./budgets";
export * from "./stageSlo";

/**
 * Default: disabled when FEATURE_STAGE_SLO unset.
 * Set FEATURE_STAGE_SLO=true to enable.
 */
export function isStageSloEnabled(): boolean {
  return process.env[FEATURE_FLAG] === "true";
}
