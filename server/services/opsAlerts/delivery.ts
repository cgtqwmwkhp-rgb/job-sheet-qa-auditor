import { formatAlertForChannel } from "./driftAlerts";
import type { DriftAlert } from "./types";

export const SLACK_WEBHOOK_URL_ENV = "OPS_ALERTS_SLACK_WEBHOOK_URL";
export const PAGERDUTY_ROUTING_KEY_ENV = "OPS_ALERTS_PAGERDUTY_ROUTING_KEY";
const PAGERDUTY_EVENTS_URL = "https://events.pagerduty.com/v2/enqueue";

type DeliveryChannel = "slack" | "pagerduty";

export interface AlertDeliveryResult {
  channel: DeliveryChannel;
  delivered: boolean;
  reason?: "not_configured" | "request_failed";
}

type Environment = NodeJS.ProcessEnv;

function logDeliveryFailure(
  alert: DriftAlert,
  channel: DeliveryChannel,
  reason: AlertDeliveryResult["reason"],
  error?: unknown
): void {
  console.error("[OpsAlerts] Delivery failed", {
    alertId: alert.id,
    channel,
    reason,
    ...(error
      ? { error: error instanceof Error ? error.message : String(error) }
      : {}),
  });
}

async function postAlert(
  alert: DriftAlert,
  channel: DeliveryChannel,
  url: string,
  body: string
): Promise<AlertDeliveryResult> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });

    if (!response.ok) {
      logDeliveryFailure(
        alert,
        channel,
        "request_failed",
        new Error(`HTTP ${response.status}`)
      );
      return { channel, delivered: false, reason: "request_failed" };
    }

    return { channel, delivered: true };
  } catch (error) {
    logDeliveryFailure(alert, channel, "request_failed", error);
    return { channel, delivered: false, reason: "request_failed" };
  }
}

/**
 * Deliver an alert to each configured external operations channel.
 *
 * Delivery failures are deliberately fail-soft for document processing, but
 * every skipped or failed channel is emitted as a structured error log.
 */
export async function deliverOpsAlert(
  alert: DriftAlert,
  env: Environment = process.env
): Promise<AlertDeliveryResult[]> {
  const slackWebhookUrl = env[SLACK_WEBHOOK_URL_ENV];
  const pagerDutyRoutingKey = env[PAGERDUTY_ROUTING_KEY_ENV];

  const slackDelivery = slackWebhookUrl
    ? postAlert(
        alert,
        "slack",
        slackWebhookUrl,
        formatAlertForChannel(alert, "slack")
      )
    : (() => {
        logDeliveryFailure(alert, "slack", "not_configured");
        return Promise.resolve({
          channel: "slack" as const,
          delivered: false,
          reason: "not_configured" as const,
        });
      })();

  const pagerDutyDelivery = pagerDutyRoutingKey
    ? postAlert(
        alert,
        "pagerduty",
        PAGERDUTY_EVENTS_URL,
        formatAlertForChannel(alert, "pagerduty", pagerDutyRoutingKey)
      )
    : (() => {
        logDeliveryFailure(alert, "pagerduty", "not_configured");
        return Promise.resolve({
          channel: "pagerduty" as const,
          delivered: false,
          reason: "not_configured" as const,
        });
      })();

  return Promise.all([slackDelivery, pagerDutyDelivery]);
}
