/**
 * Stage cost/latency SLO Contract Tests (Phase 3.7)
 *
 * Fixtures only — no live OCR, LLM, or network.
 * Verifies feature flag default-off, per-stage budgets, and breach detection.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { StageName } from "../../services/slo/types";

const STAGES: StageName[] = ["ocr", "ensemble", "judgment", "vlm"];

describe("Stage SLO Contract (Phase 3.7)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    delete process.env.FEATURE_STAGE_SLO;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
    vi.resetModules();
  });

  describe("feature flag", () => {
    it("is disabled by default when FEATURE_STAGE_SLO unset", async () => {
      const { isStageSloEnabled } = await import("../../services/slo");
      expect(isStageSloEnabled()).toBe(false);
    });

    it("is enabled when FEATURE_STAGE_SLO=true", async () => {
      process.env.FEATURE_STAGE_SLO = "true";
      const { isStageSloEnabled } = await import("../../services/slo");
      expect(isStageSloEnabled()).toBe(true);
    });
  });

  describe("DEFAULT_STAGE_BUDGETS", () => {
    it("defines sensible defaults for all pipeline stages", async () => {
      const { DEFAULT_STAGE_BUDGETS } = await import("../../services/slo");

      expect(DEFAULT_STAGE_BUDGETS.ocr).toEqual({
        maxLatencyMs: 30_000,
        maxCostUsd: 0.05,
      });
      expect(DEFAULT_STAGE_BUDGETS.ensemble).toEqual({
        maxLatencyMs: 45_000,
        maxCostUsd: 0.1,
      });
      expect(DEFAULT_STAGE_BUDGETS.judgment).toEqual({
        maxLatencyMs: 60_000,
        maxCostUsd: 0.15,
      });
      expect(DEFAULT_STAGE_BUDGETS.vlm).toEqual({
        maxLatencyMs: 45_000,
        maxCostUsd: 0.2,
      });
    });
  });

  describe("evaluateStageSlo", () => {
    it("reports within budget when latency and cost are under limits", async () => {
      const { evaluateStageSlo } = await import("../../services/slo");

      for (const stage of STAGES) {
        const result = evaluateStageSlo({
          stage,
          latencyMs: 1_000,
          costUsd: 0.01,
          ok: true,
        });

        expect(result.stage).toBe(stage);
        expect(result.withinLatency).toBe(true);
        expect(result.withinCost).toBe(true);
        expect(result.withinBudget).toBe(true);
        expect(result.breaches).toEqual([]);
      }
    });

    it("treats missing cost as within cost budget", async () => {
      const { evaluateStageSlo } = await import("../../services/slo");

      const result = evaluateStageSlo({
        stage: "ocr",
        latencyMs: 5_000,
        ok: true,
      });

      expect(result.withinCost).toBe(true);
      expect(result.withinBudget).toBe(true);
      expect(result.breaches).toEqual([]);
    });

    it("detects latency breach for each stage", async () => {
      const { evaluateStageSlo, DEFAULT_STAGE_BUDGETS } = await import(
        "../../services/slo"
      );

      for (const stage of STAGES) {
        const budget = DEFAULT_STAGE_BUDGETS[stage];
        const result = evaluateStageSlo({
          stage,
          latencyMs: budget.maxLatencyMs + 1,
          costUsd: 0.01,
          ok: false,
        });

        expect(result.withinLatency).toBe(false);
        expect(result.withinCost).toBe(true);
        expect(result.withinBudget).toBe(false);
        expect(result.breaches).toHaveLength(1);
        expect(result.breaches[0]).toContain("latency");
      }
    });

    it("detects cost breach for each stage", async () => {
      const { evaluateStageSlo, DEFAULT_STAGE_BUDGETS } = await import(
        "../../services/slo"
      );

      for (const stage of STAGES) {
        const budget = DEFAULT_STAGE_BUDGETS[stage];
        const result = evaluateStageSlo({
          stage,
          latencyMs: 1_000,
          costUsd: budget.maxCostUsd + 0.01,
          ok: true,
        });

        expect(result.withinLatency).toBe(true);
        expect(result.withinCost).toBe(false);
        expect(result.withinBudget).toBe(false);
        expect(result.breaches).toHaveLength(1);
        expect(result.breaches[0]).toContain("cost");
      }
    });

    it("reports both breaches when latency and cost exceed limits", async () => {
      const { evaluateStageSlo } = await import("../../services/slo");

      const result = evaluateStageSlo({
        stage: "judgment",
        latencyMs: 90_000,
        costUsd: 0.5,
        ok: false,
      });

      expect(result.withinLatency).toBe(false);
      expect(result.withinCost).toBe(false);
      expect(result.withinBudget).toBe(false);
      expect(result.breaches).toHaveLength(2);
      expect(result.breaches.some(b => b.includes("latency"))).toBe(true);
      expect(result.breaches.some(b => b.includes("cost"))).toBe(true);
    });

    it("accepts custom budget overrides", async () => {
      const { evaluateStageSlo } = await import("../../services/slo");

      const result = evaluateStageSlo(
        {
          stage: "ocr",
          latencyMs: 5_000,
          costUsd: 0.02,
          ok: true,
        },
        {
          ocr: { maxLatencyMs: 10_000, maxCostUsd: 0.03 },
          ensemble: { maxLatencyMs: 45_000, maxCostUsd: 0.1 },
          judgment: { maxLatencyMs: 60_000, maxCostUsd: 0.15 },
          vlm: { maxLatencyMs: 45_000, maxCostUsd: 0.2 },
        }
      );

      expect(result.withinBudget).toBe(true);
      expect(result.breaches).toEqual([]);
    });
  });
});
