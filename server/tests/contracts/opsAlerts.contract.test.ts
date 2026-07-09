/**
 * Ops Alerts Contract Tests (Phase 3.5)
 *
 * Fixtures only — no Slack, PagerDuty, or network I/O.
 * Verifies feature flag default-off, attention ranking, drift alert
 * formatting per channel, and empty queue handling.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { AlertChannel, AttentionItem } from "../../services/opsAlerts/types";

const CHANNELS: AlertChannel[] = ["slack", "pagerduty", "log"];

describe("Ops Alerts Contract (Phase 3.5)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    delete process.env.FEATURE_OPS_ALERTS;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
    vi.resetModules();
  });

  describe("feature flag", () => {
    it("is disabled by default when FEATURE_OPS_ALERTS unset", async () => {
      const { isOpsAlertsEnabled } = await import("../../services/opsAlerts");
      expect(isOpsAlertsEnabled()).toBe(false);
    });

    it("is enabled when FEATURE_OPS_ALERTS=true", async () => {
      process.env.FEATURE_OPS_ALERTS = "true";
      const { isOpsAlertsEnabled } = await import("../../services/opsAlerts");
      expect(isOpsAlertsEnabled()).toBe(true);
    });
  });

  describe("rankAttention", () => {
    it("returns empty array for empty queue", async () => {
      const { rankAttention } = await import("../../services/opsAlerts");
      expect(rankAttention([])).toEqual([]);
    });

    it("sorts items by score descending", async () => {
      const { rankAttention } = await import("../../services/opsAlerts");

      const items: AttentionItem[] = [
        { jobSheetId: 101, score: 0.42, reasons: ["low confidence"] },
        { jobSheetId: 202, score: 0.91, reasons: ["drift spike"] },
        { jobSheetId: 303, score: 0.67, reasons: ["override trend"] },
      ];

      const ranked = rankAttention(items);

      expect(ranked.map(item => item.jobSheetId)).toEqual([202, 303, 101]);
      expect(ranked.map(item => item.score)).toEqual([0.91, 0.67, 0.42]);
    });

    it("respects limit and breaks score ties by jobSheetId", async () => {
      const { rankAttention } = await import("../../services/opsAlerts");

      const items: AttentionItem[] = [
        { jobSheetId: 50, score: 0.8, reasons: ["a"] },
        { jobSheetId: 10, score: 0.8, reasons: ["b"] },
        { jobSheetId: 30, score: 0.9, reasons: ["c"] },
      ];

      const ranked = rankAttention(items, 2);

      expect(ranked).toHaveLength(2);
      expect(ranked[0].jobSheetId).toBe(30);
      expect(ranked[1].jobSheetId).toBe(10);
    });
  });

  describe("buildDriftAlert", () => {
    it("builds alert with deterministic id from metric and observedAt", async () => {
      const { buildDriftAlert } = await import("../../services/opsAlerts");

      const alert = buildDriftAlert({
        metric: "ambiguity_rate",
        severity: "warn",
        message: "Ambiguity rate exceeded warning threshold",
        observedAt: "2026-07-09T12:00:00.000Z",
      });

      expect(alert).toEqual({
        id: "drift-ambiguity-rate-98c5ecf1",
        metric: "ambiguity_rate",
        severity: "warn",
        message: "Ambiguity rate exceeded warning threshold",
        observedAt: "2026-07-09T12:00:00.000Z",
      });
    });
  });

  describe("formatAlertForChannel", () => {
    it("formats alert payload for each channel", async () => {
      const { buildDriftAlert, formatAlertForChannel } = await import(
        "../../services/opsAlerts"
      );

      const alert = buildDriftAlert({
        metric: "field_accuracy",
        severity: "critical",
        message: "Field accuracy dropped below baseline",
        observedAt: "2026-07-09T15:30:00.000Z",
      });

      for (const channel of CHANNELS) {
        const payload = formatAlertForChannel(alert, channel);
        expect(typeof payload).toBe("string");
        expect(payload.length).toBeGreaterThan(0);
        expect(payload).toContain(alert.metric);
        expect(payload).toContain(alert.message);
      }
    });

    it("uses Slack JSON payload with severity and metadata", async () => {
      const { buildDriftAlert, formatAlertForChannel } = await import(
        "../../services/opsAlerts"
      );

      const alert = buildDriftAlert({
        metric: "override_rate",
        severity: "warn",
        message: "Override rate trending up",
        observedAt: "2026-07-09T10:00:00.000Z",
      });

      const payload = JSON.parse(formatAlertForChannel(alert, "slack"));

      expect(payload.text).toContain("[WARN]");
      expect(payload.text).toContain(alert.metric);
      expect(payload.metadata.alertId).toBe(alert.id);
      expect(payload.metadata.observedAt).toBe(alert.observedAt);
    });

    it("uses PagerDuty JSON payload with dedup key and severity mapping", async () => {
      const { buildDriftAlert, formatAlertForChannel } = await import(
        "../../services/opsAlerts"
      );

      const alert = buildDriftAlert({
        metric: "selection_accuracy",
        severity: "critical",
        message: "Selection accuracy breach",
        observedAt: "2026-07-09T11:00:00.000Z",
      });

      const payload = JSON.parse(formatAlertForChannel(alert, "pagerduty"));

      expect(payload.dedup_key).toBe(alert.id);
      expect(payload.event_action).toBe("trigger");
      expect(payload.payload.summary).toContain(alert.metric);
      expect(payload.payload.severity).toBe("critical");
    });

    it("uses plain log line for log channel", async () => {
      const { buildDriftAlert, formatAlertForChannel } = await import(
        "../../services/opsAlerts"
      );

      const alert = buildDriftAlert({
        metric: "fusion_disagreement",
        severity: "info",
        message: "Fusion disagreement within normal range",
        observedAt: "2026-07-09T09:00:00.000Z",
      });

      const payload = formatAlertForChannel(alert, "log");

      expect(payload).toMatch(/^\[ops-alert\]/);
      expect(payload).toContain(`id=${alert.id}`);
      expect(payload).toContain("severity=info");
      expect(payload).toContain(`metric=${alert.metric}`);
    });
  });
});
