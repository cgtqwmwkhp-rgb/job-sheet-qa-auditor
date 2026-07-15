/**
 * Shadow / champion-challenger evaluation (PR-21 / PR-AI-11)
 *
 * Runs a challenger judgment in parallel without affecting canonical results
 * unless canary mode samples the request. Fail-soft: never throws into the
 * main pipeline.
 *
 * Only a real-model challenger is eligible. The rule-based analyzer
 * unconditionally PASSes sufficiently long content and must never create
 * shadow/canary theater or be served to users.
 */

import type { AnalysisResult, GoldSpec } from "../analyzer";
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

async function runChallenger(
  config: ShadowChallengerConfig,
  extractedText: string,
  goldSpec: GoldSpec,
  pageCount: number
): Promise<{ analysis: AnalysisResult; strategyUsed: ChallengerStrategy }> {
  if (config.strategy === "real_model") {
    const analysis = await runShadowRealModelAnalysis({
      extractedText,
      goldSpec,
      pageCount,
      modelId: config.realModelId,
    });
    return { analysis, strategyUsed: "real_model" };
  }

  throw new Error("Rule-based analysis is not eligible as a shadow challenger");
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
    if (
      !config.enabled ||
      config.mode === "off" ||
      config.strategy === "rule_based"
    ) {
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
