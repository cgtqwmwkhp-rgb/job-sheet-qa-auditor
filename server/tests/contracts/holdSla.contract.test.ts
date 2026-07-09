/**
 * Hold-queue SLA Clock Contract Tests (Phase 3.x)
 *
 * Fixtures only — no DB, routers, or live queue I/O.
 * Verifies feature flag default-off, severity deadlines, and breach detection.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  FEATURE_FLAG,
  isHoldSlaEnabled,
  evaluateHoldSla,
  DEFAULT_SLA_BY_SEVERITY,
} from "../../services/holdSla";

const HOUR_MS = 60 * 60 * 1000;

describe("Hold SLA Contract (Phase 3.x)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env[FEATURE_FLAG];
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("feature flag", () => {
    it("is disabled by default when FEATURE_HOLD_SLA unset", () => {
      expect(isHoldSlaEnabled()).toBe(false);
    });

    it("is enabled only when FEATURE_HOLD_SLA=true", () => {
      process.env[FEATURE_FLAG] = "true";
      expect(isHoldSlaEnabled()).toBe(true);
    });

    it("remains disabled for non-true values", () => {
      process.env[FEATURE_FLAG] = "1";
      expect(isHoldSlaEnabled()).toBe(false);
      process.env[FEATURE_FLAG] = "false";
      expect(isHoldSlaEnabled()).toBe(false);
    });
  });

  describe("DEFAULT_SLA_BY_SEVERITY", () => {
    it("defines sensible defaults for all severities", () => {
      expect(DEFAULT_SLA_BY_SEVERITY.S0).toBe(4 * HOUR_MS);
      expect(DEFAULT_SLA_BY_SEVERITY.S1).toBe(8 * HOUR_MS);
      expect(DEFAULT_SLA_BY_SEVERITY.S2).toBe(24 * HOUR_MS);
      expect(DEFAULT_SLA_BY_SEVERITY.S3).toBe(72 * HOUR_MS);
      expect(DEFAULT_SLA_BY_SEVERITY.unknown).toBe(48 * HOUR_MS);
    });
  });

  describe("evaluateHoldSla", () => {
    const now = new Date("2026-07-09T12:00:00.000Z");

    it("reports within SLA when age is under the severity deadline", () => {
      const openedAt = new Date(now.getTime() - 2 * HOUR_MS);

      const result = evaluateHoldSla(
        { id: "hold-1", openedAt, severity: "S0" },
        { now }
      );

      expect(result).toEqual({
        id: "hold-1",
        ageMs: 2 * HOUR_MS,
        breached: false,
        deadlineMs: 4 * HOUR_MS,
      });
    });

    it("accepts openedAt as ISO string", () => {
      const openedAt = new Date(now.getTime() - 3 * HOUR_MS).toISOString();

      const result = evaluateHoldSla(
        { id: "hold-2", openedAt, severity: "S1" },
        { now }
      );

      expect(result.ageMs).toBe(3 * HOUR_MS);
      expect(result.deadlineMs).toBe(8 * HOUR_MS);
      expect(result.breached).toBe(false);
    });

    it("detects breach when age exceeds the severity deadline", () => {
      const openedAt = new Date(now.getTime() - (4 * HOUR_MS + 1));

      const result = evaluateHoldSla(
        { id: "hold-3", openedAt, severity: "S0" },
        { now }
      );

      expect(result.breached).toBe(true);
      expect(result.ageMs).toBe(4 * HOUR_MS + 1);
      expect(result.deadlineMs).toBe(4 * HOUR_MS);
    });

    it("uses unknown deadline when severity is missing", () => {
      const openedAt = new Date(now.getTime() - 40 * HOUR_MS);

      const result = evaluateHoldSla({ id: "hold-4", openedAt }, { now });

      expect(result.deadlineMs).toBe(48 * HOUR_MS);
      expect(result.breached).toBe(false);
    });

    it("uses unknown deadline for unrecognized severity", () => {
      const openedAt = new Date(now.getTime() - 50 * HOUR_MS);

      const result = evaluateHoldSla(
        { id: "hold-5", openedAt, severity: "S9" },
        { now }
      );

      expect(result.deadlineMs).toBe(48 * HOUR_MS);
      expect(result.breached).toBe(true);
    });

    it("evaluates each default severity deadline", () => {
      const cases = [
        { severity: "S0", hours: 4 },
        { severity: "S1", hours: 8 },
        { severity: "S2", hours: 24 },
        { severity: "S3", hours: 72 },
      ] as const;

      for (const { severity, hours } of cases) {
        const openedAt = new Date(now.getTime() - (hours * HOUR_MS - 1));

        const result = evaluateHoldSla(
          { id: `hold-${severity}`, openedAt, severity },
          { now }
        );

        expect(result.deadlineMs).toBe(hours * HOUR_MS);
        expect(result.breached).toBe(false);
      }
    });

    it("accepts custom slaBySeverity overrides", () => {
      const openedAt = new Date(now.getTime() - 90 * 60 * 1000);

      const result = evaluateHoldSla(
        { id: "hold-custom", openedAt, severity: "S0" },
        {
          now,
          slaBySeverity: {
            S0: 60 * 60 * 1000,
            unknown: 2 * HOUR_MS,
          },
        }
      );

      expect(result.deadlineMs).toBe(60 * 60 * 1000);
      expect(result.breached).toBe(true);
    });

    it("clamps negative age to zero when openedAt is in the future", () => {
      const openedAt = new Date(now.getTime() + 5 * HOUR_MS);

      const result = evaluateHoldSla(
        { id: "hold-future", openedAt, severity: "S2" },
        { now }
      );

      expect(result.ageMs).toBe(0);
      expect(result.breached).toBe(false);
    });
  });
});
