/**
 * FinOps Stage Cost Rollup Contract Tests (Phase 3.x)
 *
 * Fixtures only — no live OCR, LLM, or network.
 * Verifies feature flag default-off, per-stage rollups, and averages.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  FEATURE_FLAG,
  isFinOpsEnabled,
  rollupStageCosts,
  type StageCostSample,
} from "../../services/finOps";

describe("FinOps Contract (Phase 3.x)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env[FEATURE_FLAG];
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("feature flag", () => {
    it("is disabled by default when FEATURE_FINOPS unset", () => {
      expect(isFinOpsEnabled()).toBe(false);
    });

    it("is enabled only when FEATURE_FINOPS=true", () => {
      process.env[FEATURE_FLAG] = "true";
      expect(isFinOpsEnabled()).toBe(true);
    });

    it("remains disabled for non-true values", () => {
      process.env[FEATURE_FLAG] = "1";
      expect(isFinOpsEnabled()).toBe(false);
      process.env[FEATURE_FLAG] = "false";
      expect(isFinOpsEnabled()).toBe(false);
    });
  });

  describe("rollupStageCosts", () => {
    it("returns empty array for empty input", () => {
      expect(rollupStageCosts([])).toEqual([]);
    });

    it("rolls up samples by stage with totals and averages", () => {
      const samples: StageCostSample[] = [
        { stage: "ocr", costUsd: 0.02, latencyMs: 1_000 },
        { stage: "ocr", costUsd: 0.04, latencyMs: 2_000 },
        { stage: "ensemble", costUsd: 0.1, latencyMs: 5_000 },
        { stage: "judgment", costUsd: 0.15 },
      ];

      const rollups = rollupStageCosts(samples);

      expect(rollups).toHaveLength(3);
      expect(rollups.map(r => r.stage)).toEqual([
        "ensemble",
        "judgment",
        "ocr",
      ]);

      const ocr = rollups.find(r => r.stage === "ocr");
      expect(ocr).toEqual({
        stage: "ocr",
        count: 2,
        totalCostUsd: 0.06,
        avgCostUsd: 0.03,
        avgLatencyMs: 1_500,
      });

      const ensemble = rollups.find(r => r.stage === "ensemble");
      expect(ensemble).toEqual({
        stage: "ensemble",
        count: 1,
        totalCostUsd: 0.1,
        avgCostUsd: 0.1,
        avgLatencyMs: 5_000,
      });

      const judgment = rollups.find(r => r.stage === "judgment");
      expect(judgment).toEqual({
        stage: "judgment",
        count: 1,
        totalCostUsd: 0.15,
        avgCostUsd: 0.15,
      });
      expect(judgment?.avgLatencyMs).toBeUndefined();
    });

    it("computes average latency only from samples that include latencyMs", () => {
      const samples: StageCostSample[] = [
        { stage: "vlm", costUsd: 0.2, latencyMs: 4_000 },
        { stage: "vlm", costUsd: 0.2 },
        { stage: "vlm", costUsd: 0.2, latencyMs: 8_000 },
      ];

      const [rollup] = rollupStageCosts(samples);

      expect(rollup.stage).toBe("vlm");
      expect(rollup.count).toBe(3);
      expect(rollup.totalCostUsd).toBeCloseTo(0.6);
      expect(rollup.avgCostUsd).toBeCloseTo(0.2);
      expect(rollup.avgLatencyMs).toBe(6_000);
    });

    it("handles a single sample per stage", () => {
      const samples: StageCostSample[] = [
        { stage: "ocr", costUsd: 0.05, latencyMs: 3_000 },
      ];

      expect(rollupStageCosts(samples)).toEqual([
        {
          stage: "ocr",
          count: 1,
          totalCostUsd: 0.05,
          avgCostUsd: 0.05,
          avgLatencyMs: 3_000,
        },
      ]);
    });
  });
});
