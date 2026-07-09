/**
 * Provider retry/backoff policy types (Phase 3.x)
 */

export interface RetryDecision {
  shouldRetry: boolean;
  delayMs: number;
  attempt: number;
  reason: string;
}

export interface RetryPolicyOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}
