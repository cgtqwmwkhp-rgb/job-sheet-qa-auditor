/**
 * FinOps Stage Cost Rollup Contract Tests (Phase 3.x)
 *
 * Fixtures only — no live OCR, LLM, or network.
 * Verifies feature flag default-off, per-stage rollups, and averages.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  FEATURE_FLAG,
  isFinOpsEnabled,
  rollupStageCosts,
  estimateTokenCostUsd,
  recordApiCost,
  clearApiCostLedger,
  summarizeApiCosts,
  hydrateApiCostLedgerFromDb,
  exportApiCostEvents,
  importApiCostEvents,
  getApiCostEventCount,
  type StageCostSample,
} from "../../services/finOps";

describe("FinOps Contract (Phase 3.x)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env[FEATURE_FLAG];
    clearApiCostLedger();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    clearApiCostLedger();
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

  describe("estimateTokenCostUsd", () => {
    it("estimates gemini flash costs from tokens", () => {
      const cost = estimateTokenCostUsd({
        provider: "gemini",
        model: "gemini-2.0-flash",
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
      });
      expect(cost).toBeCloseTo(0.75, 5);
    });

    it("estimates anthropic sonnet costs from tokens", () => {
      const cost = estimateTokenCostUsd({
        provider: "anthropic",
        model: "claude-sonnet-4-20250514",
        inputTokens: 1_000_000,
        outputTokens: 0,
      });
      expect(cost).toBeCloseTo(3, 5);
    });
  });

  describe("api cost ledger", () => {
    it("records and summarizes by provider/model/stage", () => {
      const now = new Date("2026-07-12T12:00:00.000Z");
      recordApiCost({
        provider: "gemini",
        model: "gemini-2.5-pro",
        stage: "judgment",
        jobSheetId: 87,
        inputTokens: 1000,
        outputTokens: 200,
        recordedAt: new Date("2026-07-12T11:00:00.000Z"),
      });
      recordApiCost({
        provider: "openai",
        model: "gpt-4o-mini",
        stage: "coaching",
        inputTokens: 500,
        outputTokens: 100,
        recordedAt: new Date("2026-07-12T11:30:00.000Z"),
      });

      const summary = summarizeApiCosts({
        windowHours: 24,
        recentLimit: 10,
        now,
      });

      expect(summary.totalCalls).toBe(2);
      expect(summary.totalCostUsd).toBeGreaterThan(0);
      expect(summary.avgCostPerCallUsd).toBeGreaterThan(0);
      expect(summary.jobSheetsReviewed).toBe(1);
      expect(summary.avgCostPerJobSheetUsd).toBeGreaterThan(0);
      expect(summary.byTool.map(b => b.key).sort()).toEqual([
        "gemini_judgment",
        "openai_coaching",
      ]);
      expect(summary.byTool[0].label).toBeTruthy();
      expect(summary.byJobSheet).toEqual([
        expect.objectContaining({
          jobSheetId: 87,
          callCount: 1,
          byTool: [
            expect.objectContaining({
              key: "gemini_judgment",
              label: "Gemini Judgment",
            }),
          ],
        }),
      ]);
      expect(summary.byProvider.map(b => b.key).sort()).toEqual([
        "gemini",
        "openai",
      ]);
      expect(summary.byStage.map(b => b.key).sort()).toEqual([
        "coaching",
        "judgment",
      ]);
      expect(summary.recentEvents).toHaveLength(2);
      expect(summary.retentionNote.length).toBeGreaterThan(20);
    });

    it("tracks Mistral OCR under ocr stage and mistral_ocr tool", () => {
      clearApiCostLedger();
      recordApiCost({
        provider: "mistral",
        model: "mistral-ocr-latest",
        stage: "ocr",
        tool: "mistral_ocr",
        jobSheetId: 42,
        inputTokens: 12_000,
        outputTokens: 0,
        latencyMs: 1800,
      });

      const summary = summarizeApiCosts({ windowHours: 24, recentLimit: 5 });
      expect(summary.byTool).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            key: "mistral_ocr",
            label: "Mistral OCR",
          }),
        ])
      );
      expect(summary.byStage).toEqual(
        expect.arrayContaining([expect.objectContaining({ key: "ocr" })])
      );
    });

    it("mistralAdapter records OCR spend into the FinOps ledger", () => {
      const content = fs.readFileSync(
        path.join(
          process.cwd(),
          "server/services/ocrAdapter/mistralAdapter.ts"
        ),
        "utf-8"
      );
      expect(content).toContain('tool: "mistral_ocr"');
      expect(content).toContain('stage: "ocr"');
      expect(content).toContain("recordApiCost");
    });

    it("anthropic VLM adapter records verification spend into the FinOps ledger", () => {
      const content = fs.readFileSync(
        path.join(
          process.cwd(),
          "server/services/vlmAdapter/anthropicAdapter.ts"
        ),
        "utf-8"
      );

      expect(content).toContain("recordApiCost");
      expect(content).toContain('stage: "vlm"');
      expect(content).toContain("json.usage?.input_tokens");
      expect(content).toContain("json.usage?.output_tokens");
      expect(content).toContain("latencyMs: Date.now() - start");
    });

    it("rolls up cost by day and month with tool breakdown", () => {
      const now = new Date("2026-07-12T12:00:00.000Z");
      recordApiCost({
        provider: "gemini",
        model: "gemini-2.5-pro",
        stage: "judgment",
        tool: "gemini_judgment",
        jobSheetId: 1,
        estimatedCostUsd: 0.03,
        recordedAt: new Date("2026-07-11T10:00:00.000Z"),
      });
      recordApiCost({
        provider: "anthropic",
        model: "claude-sonnet",
        stage: "coaching",
        tool: "anthropic_coaching",
        jobSheetId: 1,
        estimatedCostUsd: 0.05,
        recordedAt: new Date("2026-07-12T09:00:00.000Z"),
      });
      recordApiCost({
        provider: "gemini",
        model: "gemini-2.5-pro",
        stage: "judgment",
        tool: "gemini_judgment",
        jobSheetId: 2,
        estimatedCostUsd: 0.04,
        recordedAt: new Date("2026-07-12T10:00:00.000Z"),
      });

      const summary = summarizeApiCosts({ windowHours: 48, now });

      expect(summary.byDay.map(d => d.period)).toEqual([
        "2026-07-12",
        "2026-07-11",
      ]);
      expect(summary.byDay[0].totalCostUsd).toBeCloseTo(0.09);
      expect(summary.byDay[0].jobSheetsReviewed).toBe(2);
      expect(summary.byDay[0].avgCostPerJobSheetUsd).toBeCloseTo(0.045);
      expect(summary.byDay[0].byTool.map(t => t.key).sort()).toEqual([
        "anthropic_coaching",
        "gemini_judgment",
      ]);

      expect(summary.byMonth).toHaveLength(1);
      expect(summary.byMonth[0].period).toBe("2026-07");
      expect(summary.byMonth[0].totalCostUsd).toBeCloseTo(0.12);
      expect(summary.byMonth[0].jobSheetsReviewed).toBe(2);
    });

    it("averages cost across multiple job sheets", () => {
      const now = new Date("2026-07-12T12:00:00.000Z");
      recordApiCost({
        provider: "gemini",
        model: "gemini-2.0-flash",
        stage: "judgment",
        jobSheetId: 10,
        estimatedCostUsd: 0.04,
        recordedAt: new Date("2026-07-12T11:00:00.000Z"),
      });
      recordApiCost({
        provider: "gemini",
        model: "gemini-2.0-flash",
        stage: "judgment",
        jobSheetId: 11,
        estimatedCostUsd: 0.06,
        recordedAt: new Date("2026-07-12T11:10:00.000Z"),
      });
      recordApiCost({
        provider: "gemini",
        model: "gemini-2.0-flash",
        stage: "judgment",
        jobSheetId: 10,
        estimatedCostUsd: 0.02,
        recordedAt: new Date("2026-07-12T11:20:00.000Z"),
      });

      const summary = summarizeApiCosts({ windowHours: 48, now });
      expect(summary.jobSheetsReviewed).toBe(2);
      // Job 10 = 0.06, job 11 = 0.06 → avg 0.06
      expect(summary.avgCostPerJobSheetUsd).toBeCloseTo(0.06);
      expect(summary.avgCostPerCallUsd).toBeCloseTo(0.04);
      expect(
        summary.byJobSheet.find(j => j.jobSheetId === 10)?.totalCostUsd
      ).toBeCloseTo(0.06);
    });

    it("filters events outside the lookback window", () => {
      const now = new Date("2026-07-12T12:00:00.000Z");
      recordApiCost({
        provider: "gemini",
        model: "gemini-2.0-flash",
        stage: "judgment",
        inputTokens: 100,
        outputTokens: 10,
        estimatedCostUsd: 0.01,
        recordedAt: new Date("2026-07-10T12:00:00.000Z"),
      });
      recordApiCost({
        provider: "gemini",
        model: "gemini-2.0-flash",
        stage: "judgment",
        inputTokens: 100,
        outputTokens: 10,
        estimatedCostUsd: 0.02,
        recordedAt: new Date("2026-07-12T11:00:00.000Z"),
      });

      const summary = summarizeApiCosts({ windowHours: 24, now });
      expect(summary.totalCalls).toBe(1);
      expect(summary.totalCostUsd).toBeCloseTo(0.02);
    });

    it("survives in-memory clear via export/import (restart restore path)", () => {
      const now = new Date("2026-07-12T12:00:00.000Z");
      recordApiCost({
        provider: "gemini",
        model: "gemini-2.0-flash",
        stage: "judgment",
        jobSheetId: 42,
        estimatedCostUsd: 0.07,
        recordedAt: new Date("2026-07-12T11:00:00.000Z"),
      });
      recordApiCost({
        provider: "anthropic",
        model: "claude-sonnet",
        stage: "coaching",
        estimatedCostUsd: 0.03,
        recordedAt: new Date("2026-07-12T11:30:00.000Z"),
      });

      const snapshot = exportApiCostEvents();
      expect(snapshot).toHaveLength(2);

      // Simulate process restart wiping the in-memory ring buffer
      clearApiCostLedger();
      expect(getApiCostEventCount()).toBe(0);
      expect(summarizeApiCosts({ windowHours: 24, now }).totalCalls).toBe(0);

      // Restore from durable snapshot (same path hydrate uses after DB read)
      const imported = importApiCostEvents(snapshot);
      expect(imported).toBe(2);
      expect(getApiCostEventCount()).toBe(2);

      const summary = summarizeApiCosts({ windowHours: 24, now });
      expect(summary.totalCalls).toBe(2);
      expect(summary.totalCostUsd).toBeCloseTo(0.1);
      expect(summary.jobSheetsReviewed).toBe(1);
      expect(summary.retentionNote).toMatch(/api_cost_events/);
    });

    it("hydrateApiCostLedgerFromDb is fail-safe when getDb returns null", async () => {
      await expect(hydrateApiCostLedgerFromDb()).resolves.toBe(0);
    });
  });

  describe("FX conversion", () => {
    it("converts USD to GBP with the given rate", async () => {
      const { convertUsdToDisplay, clearUsdGbpRateCache } = await import(
        "../../services/finOps"
      );
      clearUsdGbpRateCache();
      expect(convertUsdToDisplay(1, "USD", 0.75)).toBe(1);
      expect(convertUsdToDisplay(1, "GBP", 0.746)).toBeCloseTo(0.746);
      expect(convertUsdToDisplay(10, "GBP", 0.75)).toBeCloseTo(7.5);
    });

    it("uses FINOPS_USD_TO_GBP env override when set", async () => {
      const { getUsdToGbpRate, clearUsdGbpRateCache } = await import(
        "../../services/finOps"
      );
      clearUsdGbpRateCache();
      process.env.FINOPS_USD_TO_GBP = "0.8";
      const rate = await getUsdToGbpRate({ forceRefresh: true });
      expect(rate.source).toBe("env");
      expect(rate.usdToGbp).toBe(0.8);
      delete process.env.FINOPS_USD_TO_GBP;
      clearUsdGbpRateCache();
    });
  });
});
