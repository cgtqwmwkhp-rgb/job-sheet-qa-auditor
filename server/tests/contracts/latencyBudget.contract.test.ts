/**
 * End-to-end latency budget Contract Tests (Phase 3.x)
 *
 * Fixtures only — no live OCR, LLM, or network.
 * Verifies feature flag default-off, budget evaluation, and slowest stage.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { StageLatency } from "../../services/latencyBudget/types";

describe("Latency Budget Contract (Phase 3.x)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    delete process.env.FEATURE_LATENCY_BUDGET;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
    vi.resetModules();
  });

  describe("feature flag", () => {
    it("is disabled by default when FEATURE_LATENCY_BUDGET unset", async () => {
      const { isLatencyBudgetEnabled } = await import(
        "../../services/latencyBudget"
      );
      expect(isLatencyBudgetEnabled()).toBe(false);
    });

    it("is enabled when FEATURE_LATENCY_BUDGET=true", async () => {
      process.env.FEATURE_LATENCY_BUDGET = "true";
      const { isLatencyBudgetEnabled } = await import(
        "../../services/latencyBudget"
      );
      expect(isLatencyBudgetEnabled()).toBe(true);
    });
  });

  describe("DEFAULT_E2E_BUDGET_MS", () => {
    it("defines a 120s default end-to-end budget", async () => {
      const { DEFAULT_E2E_BUDGET_MS } = await import(
        "../../services/latencyBudget"
      );
      expect(DEFAULT_E2E_BUDGET_MS).toBe(120_000);
    });
  });

  describe("evaluateLatencyBudget", () => {
    it("reports within budget when total latency is under the limit", async () => {
      const { evaluateLatencyBudget } = await import(
        "../../services/latencyBudget"
      );

      const stages: StageLatency[] = [
        { stage: "ocr", latencyMs: 20_000 },
        { stage: "ensemble", latencyMs: 30_000 },
        { stage: "judgment", latencyMs: 40_000 },
      ];

      const result = evaluateLatencyBudget(stages, 120_000);

      expect(result.totalMs).toBe(90_000);
      expect(result.budgetMs).toBe(120_000);
      expect(result.withinBudget).toBe(true);
      expect(result.breaches).toEqual([]);
      expect(result.slowestStage).toBe("judgment");
    });

    it("reports over budget when total latency exceeds the limit", async () => {
      const { evaluateLatencyBudget } = await import(
        "../../services/latencyBudget"
      );

      const stages: StageLatency[] = [
        { stage: "ocr", latencyMs: 50_000 },
        { stage: "ensemble", latencyMs: 50_000 },
        { stage: "judgment", latencyMs: 50_000 },
      ];

      const result = evaluateLatencyBudget(stages, 120_000);

      expect(result.totalMs).toBe(150_000);
      expect(result.budgetMs).toBe(120_000);
      expect(result.withinBudget).toBe(false);
      expect(result.breaches).toHaveLength(1);
      expect(result.breaches[0]).toContain("total: 150000ms exceeds 120000ms");
      expect(result.slowestStage).toBe("ocr");
    });

    it("returns zero totals and within budget for empty stages", async () => {
      const { evaluateLatencyBudget } = await import(
        "../../services/latencyBudget"
      );

      const result = evaluateLatencyBudget([], 120_000);

      expect(result.totalMs).toBe(0);
      expect(result.budgetMs).toBe(120_000);
      expect(result.withinBudget).toBe(true);
      expect(result.breaches).toEqual([]);
      expect(result.slowestStage).toBeUndefined();
    });

    it("identifies the slowest stage by latency", async () => {
      const { evaluateLatencyBudget } = await import(
        "../../services/latencyBudget"
      );

      const stages: StageLatency[] = [
        { stage: "ocr", latencyMs: 10_000 },
        { stage: "vlm", latencyMs: 55_000 },
        { stage: "ensemble", latencyMs: 25_000 },
      ];

      const result = evaluateLatencyBudget(stages, 120_000);

      expect(result.slowestStage).toBe("vlm");
      expect(result.withinBudget).toBe(true);
    });
  });
});
