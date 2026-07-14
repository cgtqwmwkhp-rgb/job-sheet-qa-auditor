/**
 * Shadow / champion-challenger evaluation (PR-21 / PR-AI-11)
 *
 * Runs a challenger judgment in parallel without affecting canonical results
 * unless canary mode samples the request. Fail-soft: never throws into the
 * main pipeline.
 *
 * Default path uses deterministic rule-based analysis. FEATURE_SHADOW_REAL_MODEL
 * enables a shadow-only alternate model adapter. In advisory shadow mode,
 * real-model failures fall back to rule_based so pp-delta measurement continues.
 * In canary mode, real-model failures stay fail-soft (no serve).
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
import { runShadowRealModelAnalysis } from "./modelAdapter";
import type { ChallengerStrategy, ShadowComparison } from "./types";

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

function runRuleBasedChallenger(
  extractedText: string,
  goldSpec: GoldSpec,
  pageCount: number
): AnalysisResult {
  const start = Date.now();
  const base = performRuleBasedAnalysis(extractedText, goldSpec, pageCount);
  return {
    ...base,
    processingTimeMs: Date.now() - start,
    model: "shadow-challenger-rule-based",
  };
}

async function runChallenger(
  config: ShadowChallengerConfig,
  extractedText: string,
  goldSpec: GoldSpec,
  pageCount: number
): Promise<{ analysis: AnalysisResult; strategyUsed: ChallengerStrategy }> {
  if (config.strategy === "real_model") {
    try {
      const analysis = await runShadowRealModelAnalysis({
        extractedText,
        goldSpec,
        pageCount,
        modelId: config.realModelId,
      });
      return { analysis, strategyUsed: "real_model" };
    } catch (error) {
      // Advisory shadow: keep measuring with coded challenger.
      // Canary: rethrow so evaluate fail-softs and never serves a fallback.
      if (config.mode === "canary") {
        throw error;
      }
      console.warn(
        "[ShadowChallenger] real_model unavailable; falling back to rule_based for advisory measurement:",
        error instanceof Error ? error.message : error
      );
      return {
        analysis: runRuleBasedChallenger(extractedText, goldSpec, pageCount),
        strategyUsed: "rule_based",
      };
    }
  }

  return {
    analysis: runRuleBasedChallenger(extractedText, goldSpec, pageCount),
    strategyUsed: "rule_based",
  };
}

/**
 * Evaluate challenger against champion. Never mutates champion.
 * Returns null comparison when disabled or on failure (fail-soft).
 */
export async function evaluateShadowChallenger(
  input: ShadowEvalInput
): Promise<ShadowEvalResult> {
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
    const { analysis: challenger, strategyUsed } = await runChallenger(
      config,
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
    // Shadow mode is advisory-only: never serve challenger.
    const canaryApplied = config.mode === "canary" && sampled;

    const comparison = buildShadowComparison({
      mode: config.mode,
      strategy: strategyUsed,
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
