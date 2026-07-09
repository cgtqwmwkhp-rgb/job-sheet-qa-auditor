/**
 * End-to-end latency budget module (Phase 3.x)
 *
 * Pure helpers for evaluating total pipeline latency against an E2E budget.
 * Feature-flagged via FEATURE_LATENCY_BUDGET (default OFF).
 */

export const FEATURE_FLAG = "FEATURE_LATENCY_BUDGET";

export const DEFAULT_E2E_BUDGET_MS = 120_000;

export * from "./types";
export * from "./budget";

/**
 * Default: disabled when FEATURE_LATENCY_BUDGET unset.
 * Set FEATURE_LATENCY_BUDGET=true to enable.
 */
export function isLatencyBudgetEnabled(): boolean {
  return process.env[FEATURE_FLAG] === "true";
}
