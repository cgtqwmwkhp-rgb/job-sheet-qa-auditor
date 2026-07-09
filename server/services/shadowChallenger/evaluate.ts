/**
 * Shadow / champion-challenger evaluation (PR-21)
 *
 * Runs a challenger judgment in parallel without affecting canonical results
 * unless canary mode samples the request. Fail-soft: never throws into the
 * main pipeline.
 *
 * MOCKS ONLY overnight — challenger uses deterministic rule-based analysis
 * (no live OCR/LLM). Champion is the already-computed pipeline result.
 */

import {
  performRuleBasedAnalysis,
  type AnalysisResult,
  type GoldSpec,
} from "../analyzer";
import {
  getShadowChallengerConfig,
  shouldApplyCanary,
  type ShadowChallengerConfig,
} from "./config";
import { buildShadowComparison, toJudgmentSnapshot } from "./compare";
import type { ShadowComparison } from "./types";

export interface ShadowEvalInput {
  extractedText: string;
  goldSpec: GoldSpec;
  pageCount: number;
  /** Canonical (champion) analysis after thresholds / ensemble routing */
  champion: AnalysisResult;
  jobSheetId?: number;
  /** Stable key for canary sampling (defaults to jobSheetId) */
  sampleKey?: string | number;
  config?: ShadowChallengerConfig;
}

export interface ShadowEvalResult {
  comparison: ShadowComparison | null;
  /**
   * When canary applies, the analysis that should be served.
   * Otherwise null — caller must keep champion unchanged.
   */
  servedAnalysis: AnalysisResult | null;
  canaryApplied: boolean;
}

function runChallenger(
  strategy: ShadowChallengerConfig["strategy"],
  extractedText: string,
  goldSpec: GoldSpec,
  pageCount: number
): AnalysisResult {
  const start = Date.now();
  if (strategy === "rule_based") {
    const base = performRuleBasedAnalysis(extractedText, goldSpec, pageCount);
    return {
      ...base,
      processingTimeMs: Date.now() - start,
      model: "shadow-challenger-rule-based",
    };
  }
  // Exhaustive fallback — keep fail-soft
  const base = performRuleBasedAnalysis(extractedText, goldSpec, pageCount);
  return {
    ...base,
    processingTimeMs: Date.now() - start,
    model: "shadow-challenger-rule-based",
  };
}

/**
 * Evaluate challenger against champion. Never mutates champion.
 * Returns null comparison when disabled or on failure (fail-soft).
 */
export function evaluateShadowChallenger(
  input: ShadowEvalInput
): ShadowEvalResult {
  const empty: ShadowEvalResult = {
    comparison: null,
    servedAnalysis: null,
    canaryApplied: false,
  };

  try {
    const config = input.config ?? getShadowChallengerConfig();
    if (!config.enabled || config.mode === "off") {
      return empty;
    }

    const start = Date.now();
    const challenger = runChallenger(
      config.strategy,
      input.extractedText,
      input.goldSpec,
      input.pageCount
    );
    const latencyMs = Date.now() - start;

    const sampleKey = input.sampleKey ?? input.jobSheetId ?? "0";
    const sampled =
      config.mode === "canary"
        ? shouldApplyCanary(sampleKey, config.canaryPercent)
        : true;
    const canaryApplied = config.mode === "canary" && sampled;

    const comparison = buildShadowComparison({
      mode: config.mode,
      strategy: config.strategy,
      champion: toJudgmentSnapshot({
        overallResult: input.champion.overallResult,
        score: input.champion.score,
        model: input.champion.model,
        findings: input.champion.findings,
        extractedFields: input.champion.extractedFields,
      }),
      challenger: toJudgmentSnapshot({
        overallResult: challenger.overallResult,
        score: challenger.score,
        model: challenger.model,
        findings: challenger.findings,
        extractedFields: challenger.extractedFields,
      }),
      latencyMs,
      canaryApplied,
      sampled,
      jobSheetId: input.jobSheetId,
    });

    return {
      comparison,
      servedAnalysis: canaryApplied ? challenger : null,
      canaryApplied,
    };
  } catch (error) {
    console.warn("[ShadowChallenger] fail-soft:", error);
    return empty;
  }
}
