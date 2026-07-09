/**
 * Overturn cost estimator Contract Tests (Phase 3.x)
 *
 * Fixtures only — no live DB, OCR, or network.
 * Verifies feature flag default-off, rate/cost math, and empty events.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { OverturnEvent } from "../../services/overturnCost/types";

describe("Overturn Cost Contract (Phase 3.x)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    delete process.env.FEATURE_OVERTURN_COST;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
    vi.resetModules();
  });

  describe("feature flag", () => {
    it("is disabled by default when FEATURE_OVERTURN_COST unset", async () => {
      const { isOverturnCostEnabled } = await import(
        "../../services/overturnCost"
      );
      expect(isOverturnCostEnabled()).toBe(false);
    });

    it("is enabled when FEATURE_OVERTURN_COST=true", async () => {
      process.env.FEATURE_OVERTURN_COST = "true";
      const { isOverturnCostEnabled } = await import(
        "../../services/overturnCost"
      );
      expect(isOverturnCostEnabled()).toBe(true);
    });
  });

  describe("estimateOverturnCost", () => {
    it("computes overturn rate and cost with default options", async () => {
      const { estimateOverturnCost } = await import(
        "../../services/overturnCost"
      );

      const events: OverturnEvent[] = [
        { overturned: true },
        { overturned: false },
        { overturned: true },
        { overturned: false },
        { overturned: true },
      ];

      const estimate = estimateOverturnCost(events);

      expect(estimate.overturnRate).toBe(0.6);
      expect(estimate.estimatedMinutes).toBe(24);
      expect(estimate.estimatedCostUsd).toBe(36);
    });

    it("accepts custom minutesPerOverturn and usdPerMinute", async () => {
      const { estimateOverturnCost } = await import(
        "../../services/overturnCost"
      );

      const events: OverturnEvent[] = [
        { overturned: true },
        { overturned: true },
        { overturned: false },
        { overturned: false },
      ];

      const estimate = estimateOverturnCost(events, {
        minutesPerOverturn: 10,
        usdPerMinute: 2,
      });

      expect(estimate.overturnRate).toBe(0.5);
      expect(estimate.estimatedMinutes).toBe(20);
      expect(estimate.estimatedCostUsd).toBe(40);
    });

    it("returns zero estimates for empty events", async () => {
      const { estimateOverturnCost } = await import(
        "../../services/overturnCost"
      );

      const estimate = estimateOverturnCost([]);

      expect(estimate.overturnRate).toBe(0);
      expect(estimate.estimatedMinutes).toBe(0);
      expect(estimate.estimatedCostUsd).toBe(0);
    });
  });
});
