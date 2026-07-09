/**
 * Ops alerts types (Phase 3.5)
 *
 * Drift alert stubs and predictive attention queue helpers.
 */

export type AlertChannel = "slack" | "pagerduty" | "log";

export type DriftSeverity = "info" | "warn" | "critical";

export interface DriftAlert {
  id: string;
  metric: string;
  severity: DriftSeverity;
  message: string;
  observedAt: string;
}

export interface DriftAlertInput {
  metric: string;
  severity: DriftSeverity;
  message: string;
  observedAt?: string;
}

export interface AttentionItem {
  jobSheetId: number;
  score: number;
  reasons: string[];
}
