/**
 * Ops alerts module (Phase 3.5)
 *
 * Drift alert stubs and predictive attention queue helpers.
 * Feature-flagged via FEATURE_OPS_ALERTS (default OFF).
 */

export const FEATURE_FLAG = "FEATURE_OPS_ALERTS";

export * from "./types";
export { rankAttention } from "./attentionQueue";
export { buildDriftAlert, formatAlertForChannel } from "./driftAlerts";

/**
 * Default: disabled when FEATURE_OPS_ALERTS unset.
 * Set FEATURE_OPS_ALERTS=true to enable.
 */
export function isOpsAlertsEnabled(): boolean {
  return process.env[FEATURE_FLAG] === "true";
}
