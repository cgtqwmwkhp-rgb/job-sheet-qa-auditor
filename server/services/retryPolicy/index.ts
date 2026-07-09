/**
 * Provider retry/backoff policy module (Phase 3.x)
 *
 * Pure helpers for exponential backoff before provider retries.
 * Feature-flagged via FEATURE_RETRY_POLICY (default OFF).
 */

export const FEATURE_FLAG = "FEATURE_RETRY_POLICY";

export * from "./types";
export {
  nextRetry,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_BASE_DELAY_MS,
  DEFAULT_MAX_DELAY_MS,
} from "./policy";

/**
 * Default: disabled when FEATURE_RETRY_POLICY unset.
 * Set FEATURE_RETRY_POLICY=true to enable.
 */
export function isRetryPolicyEnabled(): boolean {
  return process.env[FEATURE_FLAG] === "true";
}
