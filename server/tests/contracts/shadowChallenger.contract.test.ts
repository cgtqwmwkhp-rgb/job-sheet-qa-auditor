/**
 * Shadow / champion-challenger Contract Tests (PR-21 / PR-AI-11)
 *
 * Fixtures/mocks only — no live OCR, LLM, or DB.
 * Verifies feature flags, comparison metrics, canary sampling,
 * fail-soft evaluation, disagreement reporting, and pass-rate pp deltas.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { AnalysisResult, GoldSpec } from "../../services/analyzer";
import {
  FEATURE_FLAG,
  REAL_MODEL_FEATURE_FLAG,
  isShadowChallengerEnabled,
  isShadowRealModelEnabled,
  isShadowAdvisoryMode,
  getShadowChallengerConfig,
  shouldApplyCanary,
  DEFAULT_SHADOW_CONFIG,
  FLAGOPS_SHADOW_MEASUREMENT_ENV,
  evaluateShadowChallenger,
  buildShadowComparison,
  buildDisagreementReport,
  buildShadowChallengerSummary,
  buildPassRateMeasurement,
  DEFAULT_MEASUREMENT_MIN_SAMPLES,
  toJudgmentSnapshot,
  compareExtractedFields,
  extractShadowComparisonsFromReports,
  SHADOW_COMPARISON_SCHEMA_VERSION,
  type ShadowComparison,
} from "../../services/shadowChallenger";

const SAMPLE_SPEC: GoldSpec = {
  name: "Shadow Test Spec",
  version: "1.0.0",
  rules: [
    {
      id: "R1",
      field: "Job Number",
      type: "presence",
      required: true,
      description: "Job number required",
    },
    {
      id: "R2",
      field: "Customer",
      type: "presence",
      required: true,
      description: "Customer required",
    },
  ],
};

const RICH_TEXT = `
--- Page 1 ---
Job Number: JS-12345
Customer: Acme Corp
Engineer: Jane Doe
Date: 2026-07-08
Work completed successfully with signature present.
Additional notes about the site visit and asset condition.
`.repeat(2);

function championPass(): AnalysisResult {
  return {
    success: true,
    overallResult: "PASS",
    score: 92,
    findings: [],
    extractedFields: {
      "Job Number": { value: "JS-12345", confidence: 95, pageNumber: 1 },
      Customer: { value: "Acme Corp", confidence: 90, pageNumber: 1 },
    },
    summary: "Champion pass",
    processingTimeMs: 10,
    model: "gemini-3.1-pro",
  };
}

function championFail(): AnalysisResult {
  return {
    success: true,
    overallResult: "FAIL",
    score: 20,
    findings: [
      {
        ruleId: "R1",
        fieldName: "Job Number",
        severity: "S1",
        reasonCode: "MISSING_FIELD",
        rawSnippet: "",
        normalisedSnippet: "",
        confidence: 100,
        pageNumber: 1,
        whyItMatters: "Missing",
        suggestedFix: "Add job number",
      },
    ],
    extractedFields: {},
    summary: "Champion fail",
    processingTimeMs: 10,
    model: "gemini-3.1-pro",
  };
}

describe("Shadow Challenger Contract Tests (PR-21)", () => {
  const prevFlag = process.env[FEATURE_FLAG];
  const prevMode = process.env.SHADOW_MODE;
  const prevCanary = process.env.SHADOW_CANARY_PERCENT;
  const prevStrategy = process.env.SHADOW_CHALLENGER_STRATEGY;
  const prevRealModelFlag = process.env[REAL_MODEL_FEATURE_FLAG];
  const prevRealModelId = process.env.SHADOW_REAL_MODEL_ID;
  const prevLlmProvider = process.env.LLM_PROVIDER;
  const prevGeminiApiKey = process.env.GEMINI_API_KEY;
  const prevMinSamples = process.env.SHADOW_MEASUREMENT_MIN_SAMPLES;

  beforeEach(() => {
    delete process.env[FEATURE_FLAG];
    delete process.env.SHADOW_MODE;
    delete process.env.SHADOW_CANARY_PERCENT;
    delete process.env.SHADOW_CHALLENGER_STRATEGY;
    delete process.env[REAL_MODEL_FEATURE_FLAG];
    delete process.env.SHADOW_REAL_MODEL_ID;
    delete process.env.LLM_PROVIDER;
    delete process.env.GEMINI_API_KEY;
    delete process.env.SHADOW_MEASUREMENT_MIN_SAMPLES;
  });

  afterEach(() => {
    if (prevFlag === undefined) delete process.env[FEATURE_FLAG];
    else process.env[FEATURE_FLAG] = prevFlag;
    if (prevMode === undefined) delete process.env.SHADOW_MODE;
    else process.env.SHADOW_MODE = prevMode;
    if (prevCanary === undefined) delete process.env.SHADOW_CANARY_PERCENT;
    else process.env.SHADOW_CANARY_PERCENT = prevCanary;
    if (prevStrategy === undefined)
      delete process.env.SHADOW_CHALLENGER_STRATEGY;
    else process.env.SHADOW_CHALLENGER_STRATEGY = prevStrategy;
    if (prevRealModelFlag === undefined)
      delete process.env[REAL_MODEL_FEATURE_FLAG];
    else process.env[REAL_MODEL_FEATURE_FLAG] = prevRealModelFlag;
    if (prevRealModelId === undefined) delete process.env.SHADOW_REAL_MODEL_ID;
    else process.env.SHADOW_REAL_MODEL_ID = prevRealModelId;
    if (prevLlmProvider === undefined) delete process.env.LLM_PROVIDER;
    else process.env.LLM_PROVIDER = prevLlmProvider;
    if (prevGeminiApiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = prevGeminiApiKey;
    if (prevMinSamples === undefined)
      delete process.env.SHADOW_MEASUREMENT_MIN_SAMPLES;
    else process.env.SHADOW_MEASUREMENT_MIN_SAMPLES = prevMinSamples;
  });

  describe("feature flag", () => {
    it("defaults to disabled when FEATURE_SHADOW_CHALLENGER is unset", () => {
      expect(isShadowChallengerEnabled()).toBe(false);
      expect(getShadowChallengerConfig()).toEqual(DEFAULT_SHADOW_CONFIG);
    });

    it("refuses to enable an always-PASS rule-based challenger", () => {
      process.env[FEATURE_FLAG] = "true";
      const cfg = getShadowChallengerConfig();
      expect(cfg.enabled).toBe(false);
      expect(cfg.mode).toBe("off");
      expect(cfg.strategy).toBe("rule_based");
      expect(cfg.realModelEnabled).toBe(false);
      expect(isShadowRealModelEnabled()).toBe(false);
    });

    it("uses real-model strategy only when FEATURE_SHADOW_REAL_MODEL=true", () => {
      process.env[FEATURE_FLAG] = "true";
      process.env[REAL_MODEL_FEATURE_FLAG] = "true";
      process.env.SHADOW_REAL_MODEL_ID = "gemini-test-shadow";
      const cfg = getShadowChallengerConfig();
      expect(cfg.enabled).toBe(true);
      expect(cfg.strategy).toBe("real_model");
      expect(cfg.realModelEnabled).toBe(true);
      expect(cfg.realModelId).toBe("gemini-test-shadow");
      expect(isShadowRealModelEnabled()).toBe(true);
    });

    it("respects SHADOW_MODE=canary and canary percent", () => {
      process.env[FEATURE_FLAG] = "true";
      process.env[REAL_MODEL_FEATURE_FLAG] = "true";
      process.env.SHADOW_MODE = "canary";
      process.env.SHADOW_CANARY_PERCENT = "25";
      const cfg = getShadowChallengerConfig();
      expect(cfg.enabled).toBe(true);
      expect(cfg.mode).toBe("canary");
      expect(cfg.canaryPercent).toBe(25);
    });

    it("treats SHADOW_MODE=off as disabled even when flag is true", () => {
      process.env[FEATURE_FLAG] = "true";
      process.env.SHADOW_MODE = "off";
      const cfg = getShadowChallengerConfig();
      expect(cfg.enabled).toBe(false);
      expect(cfg.mode).toBe("off");
    });

    it("exposes FlagOps measurement env constants for advisory rollout", () => {
      expect(FLAGOPS_SHADOW_MEASUREMENT_ENV).toEqual({
        FEATURE_SHADOW_CHALLENGER: "true",
        SHADOW_MODE: "shadow",
        SHADOW_CANARY_PERCENT: "0",
      });
    });

    it("reports advisory mode only when enabled in shadow", () => {
      expect(isShadowAdvisoryMode()).toBe(false);
      process.env[FEATURE_FLAG] = "true";
      process.env[REAL_MODEL_FEATURE_FLAG] = "true";
      process.env.SHADOW_MODE = "shadow";
      expect(isShadowAdvisoryMode()).toBe(true);
      process.env.SHADOW_MODE = "canary";
      expect(isShadowAdvisoryMode()).toBe(false);
    });
  });

  describe("canary sampling", () => {
    it("is deterministic for the same key", () => {
      const a = shouldApplyCanary("job-42", 50);
      const b = shouldApplyCanary("job-42", 50);
      expect(a).toBe(b);
    });

    it("never applies at 0% and always at 100%", () => {
      expect(shouldApplyCanary("anything", 0)).toBe(false);
      expect(shouldApplyCanary("anything", 100)).toBe(true);
    });
  });

  describe("comparison metrics", () => {
    it("detects result agreement and field mismatches", () => {
      const champion = toJudgmentSnapshot({
        overallResult: "PASS",
        score: 90,
        model: "champion",
        findings: [],
        extractedFields: {
          jobNumber: { value: "A-1", confidence: 90, pageNumber: 1 },
        },
      });
      const challenger = toJudgmentSnapshot({
        overallResult: "PASS",
        score: 80,
        model: "challenger",
        findings: [],
        extractedFields: {
          jobNumber: { value: "B-2", confidence: 70, pageNumber: 1 },
        },
      });
      const comparison = buildShadowComparison({
        mode: "shadow",
        strategy: "rule_based",
        champion,
        challenger,
        latencyMs: 5,
        canaryApplied: false,
        sampled: true,
        jobSheetId: 1,
        createdAt: "2026-07-09T00:00:00.000Z",
      });
      expect(comparison.schemaVersion).toBe(SHADOW_COMPARISON_SCHEMA_VERSION);
      expect(comparison.resultAgreed).toBe(true);
      expect(comparison.hasDisagreement).toBe(true);
      expect(comparison.fieldDisagreements).toHaveLength(1);
      expect(comparison.fieldDisagreements[0].kind).toBe("value_mismatch");
      expect(comparison.scoreDelta).toBe(-10);
    });

    it("classifies only_champion / only_challenger field kinds", () => {
      const disagreements = compareExtractedFields(
        { a: { value: "1", confidence: 1, pageNumber: 1 } },
        { b: { value: "2", confidence: 1, pageNumber: 1 } }
      );
      expect(disagreements.map(d => d.kind).sort()).toEqual([
        "only_challenger",
        "only_champion",
      ]);
    });

    it("builds disagreement report rates from fixtures", () => {
      const mk = (agreed: boolean, createdAt: string): ShadowComparison =>
        buildShadowComparison({
          mode: "shadow",
          strategy: "rule_based",
          champion: toJudgmentSnapshot({
            overallResult: "PASS",
            score: 90,
            model: "c",
            findings: [],
            extractedFields: {},
          }),
          challenger: toJudgmentSnapshot({
            overallResult: agreed ? "PASS" : "FAIL",
            score: agreed ? 90 : 10,
            model: "t",
            findings: [],
            extractedFields: {},
          }),
          latencyMs: 1,
          canaryApplied: false,
          sampled: true,
          createdAt,
        });

      const report = buildDisagreementReport([
        mk(true, "2026-07-01T00:00:00.000Z"),
        mk(false, "2026-07-02T00:00:00.000Z"),
        mk(false, "2026-07-03T00:00:00.000Z"),
      ]);
      expect(report.totalComparisons).toBe(3);
      expect(report.disagreementCount).toBe(2);
      expect(report.disagreementRate).toBeCloseTo(2 / 3, 5);
      expect(report.resultDisagreementCount).toBe(2);
      expect(report.byOutcomePair["PASS->FAIL"]).toBe(2);
      expect(report.byOutcomePair["PASS->PASS"]).toBe(1);
      expect(report.passRate.championPassRate).toBe(100);
      expect(report.passRate.challengerPassRate).toBeCloseTo(33.33, 2);
      expect(report.passRate.passRatePpDelta).toBeCloseTo(-66.67, 2);
      expect(report.passRate.advisoryOnly).toBe(true);
    });
  });

  describe("pass-rate pp delta measurement", () => {
    function mkOutcome(
      champion: "PASS" | "FAIL" | "REVIEW_QUEUE",
      challenger: "PASS" | "FAIL" | "REVIEW_QUEUE",
      createdAt: string
    ): ShadowComparison {
      return buildShadowComparison({
        mode: "shadow",
        strategy: "rule_based",
        champion: toJudgmentSnapshot({
          overallResult: champion,
          score: champion === "PASS" ? 90 : 20,
          model: "c",
          findings: [],
          extractedFields: {},
        }),
        challenger: toJudgmentSnapshot({
          overallResult: challenger,
          score: challenger === "PASS" ? 90 : 20,
          model: "t",
          findings: [],
          extractedFields: {},
        }),
        latencyMs: 1,
        canaryApplied: false,
        sampled: true,
        createdAt,
      });
    }

    it("computes champion vs challenger pass-rate pp deltas", () => {
      process.env.SHADOW_MEASUREMENT_MIN_SAMPLES = "4";
      const comparisons = [
        mkOutcome("PASS", "PASS", "2026-07-01T00:00:00.000Z"),
        mkOutcome("PASS", "FAIL", "2026-07-02T00:00:00.000Z"),
        mkOutcome("FAIL", "PASS", "2026-07-03T00:00:00.000Z"),
        mkOutcome("FAIL", "PASS", "2026-07-04T00:00:00.000Z"),
      ];
      const passRate = buildPassRateMeasurement(comparisons);
      expect(passRate.sampleSize).toBe(4);
      expect(passRate.minSamplesRequired).toBe(4);
      expect(passRate.measurementReady).toBe(true);
      expect(passRate.championPassRate).toBe(50);
      expect(passRate.challengerPassRate).toBe(75);
      expect(passRate.passRatePpDelta).toBe(25);
      expect(passRate.championFailRate).toBe(50);
      expect(passRate.challengerFailRate).toBe(25);
      expect(passRate.failRatePpDelta).toBe(-25);
      expect(passRate.advisoryOnly).toBe(true);
    });

    it("marks measurement not ready below min sample size", () => {
      const comparisons = [
        mkOutcome("PASS", "PASS", "2026-07-01T00:00:00.000Z"),
      ];
      const passRate = buildPassRateMeasurement(comparisons);
      expect(passRate.minSamplesRequired).toBe(DEFAULT_MEASUREMENT_MIN_SAMPLES);
      expect(passRate.measurementReady).toBe(false);
      expect(passRate.passRatePpDelta).toBe(0);
    });
  });

  describe("evaluateShadowChallenger", () => {
    it("returns null when feature flag disabled", async () => {
      const result = await evaluateShadowChallenger({
        extractedText: RICH_TEXT,
        goldSpec: SAMPLE_SPEC,
        pageCount: 1,
        champion: championPass(),
        jobSheetId: 1,
      });
      expect(result.comparison).toBeNull();
      expect(result.servedAnalysis).toBeNull();
      expect(result.canaryApplied).toBe(false);
    });

    it("does not run an always-PASS rule-based challenger in shadow mode", async () => {
      process.env[FEATURE_FLAG] = "true";
      process.env.SHADOW_MODE = "shadow";
      const champion = championFail();
      const result = await evaluateShadowChallenger({
        extractedText: RICH_TEXT,
        goldSpec: SAMPLE_SPEC,
        pageCount: 1,
        champion,
        jobSheetId: 7,
      });
      expect(result.comparison).toBeNull();
      expect(result.canaryApplied).toBe(false);
      expect(result.servedAnalysis).toBeNull();
      expect(champion.overallResult).toBe("FAIL");
    });

    it("cannot serve rule-based challenger even if an unsafe config is injected", async () => {
      process.env[FEATURE_FLAG] = "true";
      const result = await evaluateShadowChallenger({
        extractedText: RICH_TEXT,
        goldSpec: SAMPLE_SPEC,
        pageCount: 1,
        champion: championFail(),
        jobSheetId: 99,
        sampleKey: "always",
        config: {
          enabled: true,
          mode: "canary",
          canaryPercent: 100,
          strategy: "rule_based",
          realModelEnabled: false,
          realModelId: "unused",
        },
      });
      expect(result.comparison).toBeNull();
      expect(result.canaryApplied).toBe(false);
      expect(result.servedAnalysis).toBeNull();
    });

    it("serves an eligible real-model challenger when sampled at 100%", async () => {
      process.env[FEATURE_FLAG] = "true";
      process.env[REAL_MODEL_FEATURE_FLAG] = "true";
      process.env.LLM_PROVIDER = "mock";
      process.env.SHADOW_MODE = "canary";
      process.env.SHADOW_CANARY_PERCENT = "100";
      const result = await evaluateShadowChallenger({
        extractedText: RICH_TEXT,
        goldSpec: SAMPLE_SPEC,
        pageCount: 1,
        champion: championFail(),
        jobSheetId: 99,
        sampleKey: "always",
      });
      expect(result.canaryApplied).toBe(true);
      expect(result.servedAnalysis?.model).toBe(
        "gemini-2.0-flash"
      );
      expect(result.comparison?.strategy).toBe("real_model");
      expect(result.comparison?.canaryApplied).toBe(true);
    });

    it("never applies canary at 0%", async () => {
      process.env[FEATURE_FLAG] = "true";
      process.env[REAL_MODEL_FEATURE_FLAG] = "true";
      process.env.LLM_PROVIDER = "mock";
      process.env.SHADOW_MODE = "canary";
      process.env.SHADOW_CANARY_PERCENT = "0";
      const result = await evaluateShadowChallenger({
        extractedText: RICH_TEXT,
        goldSpec: SAMPLE_SPEC,
        pageCount: 1,
        champion: championPass(),
        jobSheetId: 1,
      });
      expect(result.canaryApplied).toBe(false);
      expect(result.servedAnalysis).toBeNull();
      expect(result.comparison).not.toBeNull();
    });

    it("runs mock alternate model when real-model flag is enabled", async () => {
      process.env[FEATURE_FLAG] = "true";
      process.env[REAL_MODEL_FEATURE_FLAG] = "true";
      process.env.LLM_PROVIDER = "mock";
      process.env.SHADOW_REAL_MODEL_ID = "gemini-shadow-mock";
      const champion = championFail();
      const result = await evaluateShadowChallenger({
        extractedText: RICH_TEXT,
        goldSpec: SAMPLE_SPEC,
        pageCount: 1,
        champion,
        jobSheetId: 26,
      });
      expect(result.comparison).not.toBeNull();
      expect(result.comparison!.strategy).toBe("real_model");
      expect(result.comparison!.challenger.model).toBe("gemini-shadow-mock");
      expect(result.comparison!.challenger.overallResult).toBe("PASS");
      expect(result.comparison!.resultDisagreement).toBe(true);
      expect(result.servedAnalysis).toBeNull();
      expect(champion.overallResult).toBe("FAIL");
    });

    it("does not fall back to rule_based when real model has no credentials", async () => {
      process.env[FEATURE_FLAG] = "true";
      process.env.SHADOW_MODE = "shadow";
      process.env[REAL_MODEL_FEATURE_FLAG] = "true";
      const champion = championPass();
      const result = await evaluateShadowChallenger({
        extractedText: RICH_TEXT,
        goldSpec: SAMPLE_SPEC,
        pageCount: 1,
        champion,
        jobSheetId: 27,
      });
      expect(result.comparison).toBeNull();
      expect(result.servedAnalysis).toBeNull();
      expect(result.canaryApplied).toBe(false);
      expect(champion.overallResult).toBe("PASS");
    });

    it("fail-softs (no comparison) in canary mode when real model has no credentials", async () => {
      process.env[FEATURE_FLAG] = "true";
      process.env.SHADOW_MODE = "canary";
      process.env.SHADOW_CANARY_PERCENT = "100";
      process.env[REAL_MODEL_FEATURE_FLAG] = "true";
      const champion = championPass();
      const result = await evaluateShadowChallenger({
        extractedText: RICH_TEXT,
        goldSpec: SAMPLE_SPEC,
        pageCount: 1,
        champion,
        jobSheetId: 28,
      });
      expect(result.comparison).toBeNull();
      expect(result.servedAnalysis).toBeNull();
      expect(result.canaryApplied).toBe(false);
      expect(champion.overallResult).toBe("PASS");
    });
  });

  describe("persistence extraction + summary", () => {
    it("extracts shadowComparison from reportJson fixtures", () => {
      process.env[FEATURE_FLAG] = "true";
      process.env[REAL_MODEL_FEATURE_FLAG] = "true";
      const comparison = buildShadowComparison({
        mode: "shadow",
        strategy: "rule_based",
        champion: toJudgmentSnapshot({
          overallResult: "PASS",
          score: 90,
          model: "c",
          findings: [],
          extractedFields: {},
        }),
        challenger: toJudgmentSnapshot({
          overallResult: "FAIL",
          score: 10,
          model: "t",
          findings: [],
          extractedFields: {},
        }),
        latencyMs: 2,
        canaryApplied: false,
        sampled: true,
        createdAt: "2026-07-09T01:00:00.000Z",
      });
      const extracted = extractShadowComparisonsFromReports([
        { summary: "no shadow" },
        { shadowComparison: comparison },
        null,
        { shadowComparison: { schemaVersion: "0.0.1" } },
      ]);
      expect(extracted).toHaveLength(1);
      expect(extracted[0].resultDisagreement).toBe(true);

      const summary = buildShadowChallengerSummary({
        comparisons: extracted,
        asOf: "2026-07-09T02:00:00.000Z",
      });
      expect(summary.enabled).toBe(true);
      expect(summary.mode).toBe("shadow");
      expect(summary.report.totalComparisons).toBe(1);
      expect(summary.report.disagreementCount).toBe(1);
      expect(summary.asOf).toBe("2026-07-09T02:00:00.000Z");
      expect(summary.passRate).toEqual(summary.report.passRate);
      expect(summary.passRate.championPassRate).toBe(100);
      expect(summary.passRate.challengerPassRate).toBe(0);
      expect(summary.passRate.passRatePpDelta).toBe(-100);
      expect(summary.strategy).toBe("real_model");
    });
  });
});
