/**
 * Pure provider retry/backoff policy (Phase 3.x)
 */

import type { RetryDecision, RetryPolicyOptions } from "./types";

export const DEFAULT_MAX_ATTEMPTS = 3;
export const DEFAULT_BASE_DELAY_MS = 250;
export const DEFAULT_MAX_DELAY_MS = 4000;

function resolveOptions(opts?: RetryPolicyOptions) {
  return {
    maxAttempts: opts?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
    baseDelayMs: opts?.baseDelayMs ?? DEFAULT_BASE_DELAY_MS,
    maxDelayMs: opts?.maxDelayMs ?? DEFAULT_MAX_DELAY_MS,
  };
}

function computeDelayMs(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number
): number {
  if (attempt < 1) {
    return 0;
  }

  return Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt - 1));
}

/**
 * Compute the next retry decision for a failed provider call.
 *
 * attempt is 1-based: attempt 1 is the first retry after initial failure.
 * shouldRetry is true when attempt < maxAttempts.
 */
export function nextRetry(
  attempt: number,
  opts?: RetryPolicyOptions
): RetryDecision {
  const { maxAttempts, baseDelayMs, maxDelayMs } = resolveOptions(opts);
  const shouldRetry = attempt < maxAttempts;
  const delayMs = computeDelayMs(attempt, baseDelayMs, maxDelayMs);

  return {
    shouldRetry,
    delayMs,
    attempt,
    reason: shouldRetry
      ? `retry scheduled (attempt ${attempt}/${maxAttempts - 1})`
      : `max attempts reached (${maxAttempts})`,
  };
}
