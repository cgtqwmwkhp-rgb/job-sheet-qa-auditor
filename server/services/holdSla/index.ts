/**
 * Hold-queue SLA clock module (Phase 3.x)
 *
 * Pure helpers for hold-item age and SLA breach evaluation.
 * Feature-flagged via FEATURE_HOLD_SLA (default OFF). No processor wiring yet.
 */

export const FEATURE_FLAG = "FEATURE_HOLD_SLA";

export * from "./types";
export { DEFAULT_SLA_BY_SEVERITY, evaluateHoldSla } from "./clock";

/**
 * Default: disabled when FEATURE_HOLD_SLA unset.
 * Set FEATURE_HOLD_SLA=true to enable downstream wiring.
 */
export function isHoldSlaEnabled(): boolean {
  return process.env[FEATURE_FLAG] === "true";
}
