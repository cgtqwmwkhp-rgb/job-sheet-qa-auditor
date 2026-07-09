/**
 * Provider Retry/Backoff Policy Contract Tests (Phase 3.x)
 *
 * Fixtures only — no live provider calls or network I/O.
 * Verifies feature flag default-off, exponential backoff, and max attempts.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("Retry Policy Contract (Phase 3.x)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    delete process.env.FEATURE_RETRY_POLICY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
    vi.resetModules();
  });

  describe("feature flag", () => {
    it("is disabled by default when FEATURE_RETRY_POLICY unset", async () => {
      const { isRetryPolicyEnabled } = await import(
        "../../services/retryPolicy"
      );
      expect(isRetryPolicyEnabled()).toBe(false);
    });

    it("is enabled when FEATURE_RETRY_POLICY=true", async () => {
      process.env.FEATURE_RETRY_POLICY = "true";
      const { isRetryPolicyEnabled } = await import(
        "../../services/retryPolicy"
      );
      expect(isRetryPolicyEnabled()).toBe(true);
    });
  });

  describe("defaults", () => {
    it("exposes default policy constants", async () => {
      const {
        DEFAULT_MAX_ATTEMPTS,
        DEFAULT_BASE_DELAY_MS,
        DEFAULT_MAX_DELAY_MS,
      } = await import("../../services/retryPolicy");

      expect(DEFAULT_MAX_ATTEMPTS).toBe(3);
      expect(DEFAULT_BASE_DELAY_MS).toBe(250);
      expect(DEFAULT_MAX_DELAY_MS).toBe(4000);
    });
  });

  describe("nextRetry", () => {
    it("schedules exponential backoff for early attempts", async () => {
      const { nextRetry } = await import("../../services/retryPolicy");

      expect(nextRetry(1)).toEqual({
        shouldRetry: true,
        delayMs: 250,
        attempt: 1,
        reason: "retry scheduled (attempt 1/2)",
      });

      expect(nextRetry(2)).toEqual({
        shouldRetry: true,
        delayMs: 500,
        attempt: 2,
        reason: "retry scheduled (attempt 2/2)",
      });
    });

    it("stops retrying once max attempts is reached", async () => {
      const { nextRetry } = await import("../../services/retryPolicy");

      const decision = nextRetry(3);

      expect(decision.shouldRetry).toBe(false);
      expect(decision.delayMs).toBe(1000);
      expect(decision.attempt).toBe(3);
      expect(decision.reason).toBe("max attempts reached (3)");
    });

    it("caps delay at maxDelayMs for high attempts", async () => {
      const { nextRetry } = await import("../../services/retryPolicy");

      const decision = nextRetry(5);

      expect(decision.shouldRetry).toBe(false);
      expect(decision.delayMs).toBe(4000);
      expect(decision.reason).toBe("max attempts reached (3)");
    });

    it("returns zero delay for attempt < 1", async () => {
      const { nextRetry } = await import("../../services/retryPolicy");

      const decision = nextRetry(0);

      expect(decision.shouldRetry).toBe(true);
      expect(decision.delayMs).toBe(0);
      expect(decision.attempt).toBe(0);
    });

    it("respects custom policy options", async () => {
      const { nextRetry } = await import("../../services/retryPolicy");

      const decision = nextRetry(2, {
        maxAttempts: 5,
        baseDelayMs: 100,
        maxDelayMs: 300,
      });

      expect(decision).toEqual({
        shouldRetry: true,
        delayMs: 200,
        attempt: 2,
        reason: "retry scheduled (attempt 2/4)",
      });
    });

    it("uses custom maxDelayMs to cap exponential growth", async () => {
      const { nextRetry } = await import("../../services/retryPolicy");

      const decision = nextRetry(4, {
        maxAttempts: 6,
        baseDelayMs: 250,
        maxDelayMs: 1000,
      });

      expect(decision.shouldRetry).toBe(true);
      expect(decision.delayMs).toBe(1000);
      expect(decision.attempt).toBe(4);
    });
  });
});
