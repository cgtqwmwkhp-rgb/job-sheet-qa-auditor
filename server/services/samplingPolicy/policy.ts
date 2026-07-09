/**
 * Pure human sampling policy (Phase 3.x)
 *
 * Deterministic sampling from confidence tier — not wired into documentProcessor yet.
 */

import { createHash } from "crypto";
import type {
  SamplingDecision,
  SamplingInput,
  SamplingPolicyOptions,
} from "./types";

export const DEFAULT_BASE_RATE = 0.05;
export const DEFAULT_LOW_CONFIDENCE_RATE = 0.25;
export const DEFAULT_LOW_CONFIDENCE_THRESHOLD = 0.75;

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
  const lowConfidenceRate = opts.lowConfidenceRate ?? DEFAULT_LOW_CONFIDENCE_RATE;
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
