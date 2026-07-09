/**
 * Drift alert builders and channel formatters (Phase 3.5)
 *
 * Pure helpers — no network I/O.
 */

import { createHash } from "crypto";
import type { AlertChannel, DriftAlert, DriftAlertInput } from "./types";

function slugifyMetric(metric: string): string {
  return metric
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildAlertId(metric: string, observedAt: string): string {
  const payload = `${metric}|${observedAt}`;
  const hash = createHash("sha256").update(payload).digest("hex");
  return `drift-${slugifyMetric(metric)}-${hash.slice(0, 8)}`;
}

/**
 * Build a drift alert from metric observation input.
 */
export function buildDriftAlert(input: DriftAlertInput): DriftAlert {
  const observedAt = input.observedAt ?? new Date().toISOString();

  return {
    id: buildAlertId(input.metric, observedAt),
    metric: input.metric,
    severity: input.severity,
    message: input.message,
    observedAt,
  };
}

/**
 * Format a drift alert payload for the target channel (no network I/O).
 */
export function formatAlertForChannel(
  alert: DriftAlert,
  channel: AlertChannel
): string {
  switch (channel) {
    case "slack":
      return JSON.stringify({
        text: `[${alert.severity.toUpperCase()}] ${alert.metric}: ${alert.message}`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*${alert.severity.toUpperCase()}* — \`${alert.metric}\`\n${alert.message}`,
            },
          },
        ],
        metadata: {
          alertId: alert.id,
          observedAt: alert.observedAt,
        },
      });
    case "pagerduty":
      return JSON.stringify({
        routing_key: "PLACEHOLDER",
        event_action: alert.severity === "critical" ? "trigger" : "acknowledge",
        dedup_key: alert.id,
        payload: {
          summary: `${alert.metric}: ${alert.message}`,
          severity: alert.severity === "critical" ? "critical" : "warning",
          source: "job-sheet-qa-auditor",
          custom_details: {
            metric: alert.metric,
            observedAt: alert.observedAt,
          },
        },
      });
    case "log":
      return `[ops-alert] id=${alert.id} severity=${alert.severity} metric=${alert.metric} observedAt=${alert.observedAt} message=${alert.message}`;
  }
}
