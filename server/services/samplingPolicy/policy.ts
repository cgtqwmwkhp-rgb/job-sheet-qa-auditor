/**
 * Pure human sampling policy (Phase 3.x / Wave-4 A3)
 *
 * Deterministic sampling from confidence tier.
 * PASS human-sampling is wired via decidePassSampling + processor artifacts.
 */

import { createHash } from "crypto";
import type {
  PassSampleMissRateOptions,
  PassSampleMissRateResult,
  PassSampleReviewOutcome,
  SamplingDecision,
  SamplingInput,
  SamplingPolicyOptions,
} from "./types";

export const DEFAULT_BASE_RATE = 0.05;
export const DEFAULT_LOW_CONFIDENCE_RATE = 0.25;
export const DEFAULT_LOW_CONFIDENCE_THRESHOLD = 0.75;
/** Default fraction of PASS sheets pulled for human audit. */
export const DEFAULT_PASS_SAMPLE_RATE = 0.05;
/** Default max miss rate on sampled PASS sheets (5%). */
export const DEFAULT_MAX_PASS_SAMPLE_MISS_RATE = 0.05;
/** Default minimum sampled PASS reviews before miss-rate is ready. */
export const DEFAULT_PASS_SAMPLE_MIN_SAMPLES = 30;

function hashInputBucket(input: SamplingInput): number {
  const payload = JSON.stringify(input);
  const digest = createHash("sha256").update(payload).digest("hex");
  return parseInt(digest.slice(0, 8), 16) % 10000;
}

export function decideSampling(
  input: SamplingInput,
  opts: SamplingPolicyOptions = {}
): SamplingDecision {
  const baseRate = opts.baseRate ?? DEFAULT_BASE_RATE;
  const lowConfidenceRate =
    opts.lowConfidenceRate ?? DEFAULT_LOW_CONFIDENCE_RATE;
  const lowConfidenceThreshold =
    opts.lowConfidenceThreshold ?? DEFAULT_LOW_CONFIDENCE_THRESHOLD;

  const isLowConfidence = input.confidence < lowConfidenceThreshold;
  const rate = isLowConfidence ? lowConfidenceRate : baseRate;
  const bucket = hashInputBucket(input);
  const sample = bucket / 10000 < rate;
  const reason = isLowConfidence
    ? `confidence ${input.confidence} below threshold ${lowConfidenceThreshold}; rate=${rate}`
    : `confidence ${input.confidence} at or above threshold ${lowConfidenceThreshold}; rate=${rate}`;

  return { sample, rate, reason };
}

/**
 * Human-sample decision for PASS sheets only.
 * Non-PASS outcomes never sample (miss-rate denominator is PASS audits).
 */
export function decidePassSampling(
  input: SamplingInput,
  opts: SamplingPolicyOptions = {}
): SamplingDecision {
  if (input.overallResult !== "PASS") {
    return {
      sample: false,
      rate: 0,
      passSample: false,
      reason: `overallResult=${input.overallResult ?? "unknown"}; PASS sampling skipped`,
    };
  }

  const passSampleRate = opts.passSampleRate ?? DEFAULT_PASS_SAMPLE_RATE;
  const decision = decideSampling(
    {
      confidence: input.confidence,
      cohortKey: input.cohortKey ?? "pass",
      subjectId: input.subjectId,
      overallResult: "PASS",
    },
    {
      ...opts,
      baseRate: passSampleRate,
      lowConfidenceRate: Math.max(
        passSampleRate,
        opts.lowConfidenceRate ?? DEFAULT_LOW_CONFIDENCE_RATE
      ),
    }
  );

  return {
    ...decision,
    passSample: decision.sample,
    reason: decision.sample
      ? `PASS human sample selected; ${decision.reason}`
      : `PASS not sampled; ${decision.reason}`,
  };
}

/**
 * PASS sample miss-rate gate.
 * Miss = sampled PASS later found defective by a human reviewer.
 * Unavailable (not fail) when sampled N is insufficient.
 */
export function evaluatePassSampleMissRate(
  outcomes: PassSampleReviewOutcome[],
  opts: PassSampleMissRateOptions = {}
): PassSampleMissRateResult {
  const maxMissRate = opts.maxMissRate ?? DEFAULT_MAX_PASS_SAMPLE_MISS_RATE;
  const minSamplesRequired =
    opts.minSamplesRequired ?? DEFAULT_PASS_SAMPLE_MIN_SAMPLES;

  const sampled = outcomes.filter(o => o.sampled);
  const missCount = sampled.filter(o => o.humanFoundDefect).length;
  const sampledCount = sampled.length;
  const missRate = sampledCount === 0 ? 0 : missCount / sampledCount;
  const measurementReady = sampledCount >= minSamplesRequired;

  if (!measurementReady) {
    return {
      status: "unavailable",
      metrics: {
        sampledCount,
        missCount,
        missRate: null,
        minSamplesRequired,
        measurementReady: false,
        provisionalMissRate: missRate,
        note:
          sampledCount === 0
            ? "No PASS human samples; miss-rate cannot be measured."
            : `Accumulating PASS samples toward miss-rate readiness (${sampledCount}/${minSamplesRequired}).`,
      },
      maxMissRate,
      blockers: [
        sampledCount === 0
          ? "PASS sample miss-rate unavailable: no sampled PASS reviews."
          : `PASS sample miss-rate unavailable: need ≥${minSamplesRequired} samples (have ${sampledCount}).`,
      ],
    };
  }

  if (missRate - 1e-12 > maxMissRate) {
    return {
      status: "fail",
      metrics: {
        sampledCount,
        missCount,
        missRate,
        minSamplesRequired,
        measurementReady: true,
      },
      maxMissRate,
      blockers: [
        `PASS sample miss-rate ${(missRate * 100).toFixed(2)}% exceeds max ${(maxMissRate * 100).toFixed(2)}%.`,
      ],
    };
  }

  return {
    status: "pass",
    metrics: {
      sampledCount,
      missCount,
      missRate,
      minSamplesRequired,
      measurementReady: true,
    },
    maxMissRate,
    blockers: [],
  };
}
