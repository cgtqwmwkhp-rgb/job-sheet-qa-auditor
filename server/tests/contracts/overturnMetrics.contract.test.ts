/**
 * Overturn Metrics Contract Tests
 *
 * Fixtures only — no live DB, OCR, or network.
 * Verifies feature flag default-off, overturn rate math,
 * breakdown categories, and before/after snapshot diff.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { AuditActionLogEntry } from "../../services/overturnMetrics/types";

describe("Overturn Metrics Contract", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    delete process.env.FEATURE_OVERTURN_METRICS;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
    vi.resetModules();
  });

  describe("feature flag", () => {
    it("is disabled by default when FEATURE_OVERTURN_METRICS unset", async () => {
      const { isOverturnMetricsEnabled } = await import(
        "../../services/overturnMetrics"
      );
      expect(isOverturnMetricsEnabled()).toBe(false);
    });

    it("is enabled when FEATURE_OVERTURN_METRICS=true", async () => {
      process.env.FEATURE_OVERTURN_METRICS = "true";
      const { isOverturnMetricsEnabled } = await import(
        "../../services/overturnMetrics"
      );
      expect(isOverturnMetricsEnabled()).toBe(true);
    });
  });

  describe("computeOverturnMetrics", () => {
    function entry(
      action: string,
      details: AuditActionLogEntry["details"] = {}
    ): AuditActionLogEntry {
      return {
        action,
        entityType: "audit_finding",
        entityId: 1,
        userId: 42,
        timestamp: new Date().toISOString(),
        details,
      };
    }

    it("returns zeroes for empty input", async () => {
      const { computeOverturnMetrics } = await import(
        "../../services/overturnMetrics"
      );
      const result = computeOverturnMetrics([]);

      expect(result.totalActions).toBe(0);
      expect(result.agreements).toBe(0);
      expect(result.overturns).toBe(0);
      expect(result.fieldCorrections).toBe(0);
      expect(result.overturnRate).toBe(0);
      expect(result.correctionRate).toBe(0);
      expect(result.agreementRate).toBe(0);
      expect(result.breakdown).toEqual([]);
    });

    it("counts approvals as agreements", async () => {
      const { computeOverturnMetrics } = await import(
        "../../services/overturnMetrics"
      );

      const result = computeOverturnMetrics([
        entry("FINDING_APPROVE"),
        entry("FINDING_APPROVE"),
        entry("FINDING_APPROVE"),
      ]);

      expect(result.totalActions).toBe(3);
      expect(result.agreements).toBe(3);
      expect(result.overturns).toBe(0);
      expect(result.agreementRate).toBe(1);
      expect(result.overturnRate).toBe(0);
    });

    it("counts overrides and waives as overturns", async () => {
      const { computeOverturnMetrics } = await import(
        "../../services/overturnMetrics"
      );

      const result = computeOverturnMetrics([
        entry("FINDING_OVERRIDE"),
        entry("FINDING_WAIVE"),
        entry("FINDING_APPROVE"),
      ]);

      expect(result.totalActions).toBe(3);
      expect(result.overturns).toBe(2);
      expect(result.agreements).toBe(1);
      expect(result.overturnRate).toBeCloseTo(2 / 3);
      expect(result.agreementRate).toBeCloseTo(1 / 3);
    });

    it("PX-065: counts FINDING_BULK_* the same as single-finding actions", async () => {
      const { computeOverturnMetrics } = await import(
        "../../services/overturnMetrics"
      );

      const result = computeOverturnMetrics([
        entry("FINDING_BULK_OVERRIDE"),
        entry("FINDING_BULK_WAIVE"),
        entry("FINDING_BULK_APPROVE"),
      ]);

      expect(result.totalActions).toBe(3);
      expect(result.overturns).toBe(2);
      expect(result.agreements).toBe(1);
      expect(result.overturnRate).toBeCloseTo(2 / 3);
    });

    it("counts FIELD_CORRECTION separately", async () => {
      const { computeOverturnMetrics } = await import(
        "../../services/overturnMetrics"
      );

      const result = computeOverturnMetrics([
        entry("FINDING_APPROVE"),
        entry("FIELD_CORRECTION", {
          fieldName: "vin",
          correctedValue: "ABC123",
        }),
      ]);

      expect(result.totalActions).toBe(2);
      expect(result.agreements).toBe(1);
      expect(result.fieldCorrections).toBe(1);
      expect(result.correctionRate).toBe(0.5);
    });

    it("excludes undo and flag actions from totals", async () => {
      const { computeOverturnMetrics } = await import(
        "../../services/overturnMetrics"
      );

      const result = computeOverturnMetrics([
        entry("FINDING_APPROVE"),
        entry("FINDING_OVERRIDE"),
        entry("FINDING_UNDO"),
        entry("FINDING_FLAG"),
        entry("JOB_SHEET_APPROVE"),
      ]);

      expect(result.totalActions).toBe(2);
      expect(result.agreements).toBe(1);
      expect(result.overturns).toBe(1);
    });

    it("provides per-category breakdown", async () => {
      const { computeOverturnMetrics } = await import(
        "../../services/overturnMetrics"
      );

      const result = computeOverturnMetrics([
        entry("FINDING_OVERRIDE"),
        entry("FINDING_OVERRIDE"),
        entry("FINDING_WAIVE"),
        entry("FIELD_CORRECTION"),
        entry("FINDING_APPROVE"),
      ]);

      expect(result.totalActions).toBe(5);

      const overrideBucket = result.breakdown.find(
        b => b.category === "override"
      );
      const waiveBucket = result.breakdown.find(b => b.category === "waive");
      const corrBucket = result.breakdown.find(
        b => b.category === "field_correction"
      );

      expect(overrideBucket).toEqual({
        category: "override",
        count: 2,
        rate: 2 / 5,
      });
      expect(waiveBucket).toEqual({
        category: "waive",
        count: 1,
        rate: 1 / 5,
      });
      expect(corrBucket).toEqual({
        category: "field_correction",
        count: 1,
        rate: 1 / 5,
      });
    });

    it("handles all-overturns scenario (0% trust)", async () => {
      const { computeOverturnMetrics } = await import(
        "../../services/overturnMetrics"
      );

      const result = computeOverturnMetrics([
        entry("FINDING_OVERRIDE"),
        entry("FINDING_WAIVE"),
        entry("FINDING_OVERRIDE"),
      ]);

      expect(result.overturnRate).toBe(1);
      expect(result.agreementRate).toBe(0);
    });
  });

  describe("computeOverturnRate (snapshot diff)", () => {
    it("returns zeroes for empty before set", async () => {
      const { computeOverturnRate } = await import(
        "../../services/overturnMetrics"
      );

      const result = computeOverturnRate([], [1, 2, 3]);
      expect(result.removedCount).toBe(0);
      expect(result.addedCount).toBe(3);
      expect(result.unchangedCount).toBe(0);
      expect(result.overturnRate).toBe(0);
    });

    it("returns zeroes for two empty sets", async () => {
      const { computeOverturnRate } = await import(
        "../../services/overturnMetrics"
      );

      const result = computeOverturnRate([], []);
      expect(result.overturnRate).toBe(0);
    });

    it("computes removed/added/unchanged correctly", async () => {
      const { computeOverturnRate } = await import(
        "../../services/overturnMetrics"
      );

      const result = computeOverturnRate([1, 2, 3, 4], [2, 4, 5]);

      expect(result.removedCount).toBe(2);
      expect(result.addedCount).toBe(1);
      expect(result.unchangedCount).toBe(2);
      expect(result.overturnRate).toBe(0.5);
    });

    it("100% overturn when all findings removed", async () => {
      const { computeOverturnRate } = await import(
        "../../services/overturnMetrics"
      );

      const result = computeOverturnRate([10, 20, 30], []);

      expect(result.removedCount).toBe(3);
      expect(result.addedCount).toBe(0);
      expect(result.unchangedCount).toBe(0);
      expect(result.overturnRate).toBe(1);
    });

    it("0% overturn when all findings unchanged", async () => {
      const { computeOverturnRate } = await import(
        "../../services/overturnMetrics"
      );

      const result = computeOverturnRate([1, 2, 3], [1, 2, 3]);

      expect(result.removedCount).toBe(0);
      expect(result.addedCount).toBe(0);
      expect(result.unchangedCount).toBe(3);
      expect(result.overturnRate).toBe(0);
    });
  });
});
