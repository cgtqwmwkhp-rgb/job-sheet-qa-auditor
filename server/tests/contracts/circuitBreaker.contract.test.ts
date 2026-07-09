/**
 * Provider Circuit Breaker Contract Tests (Phase 3.x)
 *
 * Fixtures only — no DB, documentProcessor, or live AI.
 * Verifies feature flag default-off and pure state transitions.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  FEATURE_FLAG,
  isCircuitBreakerEnabled,
  recordFailure,
  recordSuccess,
  canRequest,
  type CircuitSnapshot,
} from "../../services/circuitBreaker";

const CLOSED: CircuitSnapshot = { state: "closed", failures: 0 };

describe("Circuit Breaker Contract (Phase 3.x)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env[FEATURE_FLAG];
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("feature flag", () => {
    it("is disabled by default when FEATURE_CIRCUIT_BREAKER unset", () => {
      expect(isCircuitBreakerEnabled()).toBe(false);
    });

    it("is enabled only when FEATURE_CIRCUIT_BREAKER=true", () => {
      process.env[FEATURE_FLAG] = "true";
      expect(isCircuitBreakerEnabled()).toBe(true);
    });

    it("remains disabled for non-true values", () => {
      process.env[FEATURE_FLAG] = "1";
      expect(isCircuitBreakerEnabled()).toBe(false);
      process.env[FEATURE_FLAG] = "false";
      expect(isCircuitBreakerEnabled()).toBe(false);
    });
  });

  describe("recordFailure", () => {
    it("increments failures while remaining closed below threshold", () => {
      const snap = recordFailure(CLOSED, { now: 1000 });

      expect(snap.state).toBe("closed");
      expect(snap.failures).toBe(1);
      expect(snap.openedAt).toBeUndefined();
    });

    it("opens at default threshold of 5 failures", () => {
      let snap = CLOSED;
      for (let i = 0; i < 4; i++) {
        snap = recordFailure(snap, { now: 1000 });
      }
      expect(snap.state).toBe("closed");
      expect(snap.failures).toBe(4);

      snap = recordFailure(snap, { now: 2000 });
      expect(snap.state).toBe("open");
      expect(snap.failures).toBe(5);
      expect(snap.openedAt).toBe(2000);
    });

    it("respects custom threshold", () => {
      let snap = CLOSED;
      snap = recordFailure(snap, { threshold: 2, now: 500 });
      expect(snap.state).toBe("closed");
      snap = recordFailure(snap, { threshold: 2, now: 600 });
      expect(snap.state).toBe("open");
      expect(snap.failures).toBe(2);
      expect(snap.openedAt).toBe(600);
    });

    it("preserves openedAt when already open", () => {
      const open: CircuitSnapshot = {
        state: "open",
        failures: 5,
        openedAt: 1000,
      };

      const snap = recordFailure(open, { now: 5000 });

      expect(snap.state).toBe("open");
      expect(snap.failures).toBe(6);
      expect(snap.openedAt).toBe(1000);
    });
  });

  describe("recordSuccess", () => {
    it("resets closed circuit to zero failures", () => {
      const snap = recordSuccess({ state: "closed", failures: 3 });

      expect(snap).toEqual({ state: "closed", failures: 0 });
    });

    it("resets open circuit to closed", () => {
      const snap = recordSuccess({
        state: "open",
        failures: 10,
        openedAt: 1000,
      });

      expect(snap).toEqual({ state: "closed", failures: 0 });
    });

    it("resets half_open circuit to closed", () => {
      const snap = recordSuccess({ state: "half_open", failures: 1 });

      expect(snap).toEqual({ state: "closed", failures: 0 });
    });
  });

  describe("canRequest", () => {
    it("allows requests when closed", () => {
      expect(canRequest(CLOSED, { now: 1000 })).toBe(true);
    });

    it("allows requests when half_open", () => {
      expect(
        canRequest({ state: "half_open", failures: 0 }, { now: 1000 })
      ).toBe(true);
    });

    it("denies requests when open and within cooldown", () => {
      const open: CircuitSnapshot = {
        state: "open",
        failures: 5,
        openedAt: 10_000,
      };

      expect(canRequest(open, { cooldownMs: 30_000, now: 20_000 })).toBe(false);
    });

    it("allows requests when open and cooldown elapsed", () => {
      const open: CircuitSnapshot = {
        state: "open",
        failures: 5,
        openedAt: 10_000,
      };

      expect(canRequest(open, { cooldownMs: 30_000, now: 40_001 })).toBe(true);
    });

    it("allows requests when open without openedAt", () => {
      expect(canRequest({ state: "open", failures: 5 }, { now: 1000 })).toBe(
        true
      );
    });

    it("uses default cooldown of 30000ms", () => {
      const open: CircuitSnapshot = {
        state: "open",
        failures: 5,
        openedAt: 0,
      };

      expect(canRequest(open, { now: 29_999 })).toBe(false);
      expect(canRequest(open, { now: 30_000 })).toBe(true);
    });
  });
});
