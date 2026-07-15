/**
 * Ops alerts module (Phase 3.5)
 *
 * Drift alert delivery and predictive attention queue helpers.
 * Feature-flagged via FEATURE_OPS_ALERTS (default OFF).
 */

export const FEATURE_FLAG = "FEATURE_OPS_ALERTS";

export * from "./types";
export { rankAttention } from "./attentionQueue";
export { buildDriftAlert, formatAlertForChannel } from "./driftAlerts";
export {
  deliverOpsAlert,
  PAGERDUTY_ROUTING_KEY_ENV,
  SLACK_WEBHOOK_URL_ENV,
} from "./delivery";

/**
 * Default: disabled when FEATURE_OPS_ALERTS unset.
 * Set FEATURE_OPS_ALERTS=true to enable.
 */
export function isOpsAlertsEnabled(): boolean {
  return process.env[FEATURE_FLAG] === "true";
}
