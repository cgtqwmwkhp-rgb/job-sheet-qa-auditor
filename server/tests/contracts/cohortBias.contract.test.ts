/**
 * Cohort Bias Monitoring Contract Tests (Phase 3.2)
 *
 * Fixtures only — no DB, shadowChallenger, or live AI.
 * Verifies feature flag default-off, cohort grouping, and rate computation.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  FEATURE_FLAG,
  isCohortBiasEnabled,
  computeCohortBias,
  type DisagreementSample,
} from "../../services/cohortBias";

describe("Cohort Bias Contract (Phase 3.2)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env[FEATURE_FLAG];
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("feature flag", () => {
    it("is disabled by default when FEATURE_COHORT_BIAS unset", () => {
      expect(isCohortBiasEnabled()).toBe(false);
    });

    it("is enabled only when FEATURE_COHORT_BIAS=true", () => {
      process.env[FEATURE_FLAG] = "true";
      expect(isCohortBiasEnabled()).toBe(true);
    });

    it("remains disabled for non-true values", () => {
      process.env[FEATURE_FLAG] = "1";
      expect(isCohortBiasEnabled()).toBe(false);
      process.env[FEATURE_FLAG] = "false";
      expect(isCohortBiasEnabled()).toBe(false);
    });
  });

  describe("computeCohortBias", () => {
    it("returns empty array for empty input", () => {
      expect(computeCohortBias([])).toEqual([]);
    });

    it("groups samples by cohortKey", () => {
      const samples: DisagreementSample[] = [
        {
          cohortKey: "engineer:bob",
          championLabel: "pass",
          challengerLabel: "pass",
        },
        {
          cohortKey: "engineer:alice",
          championLabel: "pass",
          challengerLabel: "fail",
        },
        {
          cohortKey: "engineer:alice",
          championLabel: "fail",
          challengerLabel: "fail",
        },
        {
          cohortKey: "asset:generator",
          championLabel: "pass",
          challengerLabel: "fail",
          overturned: true,
        },
      ];

      const stats = computeCohortBias(samples);

      expect(stats).toHaveLength(3);
      expect(stats.map(s => s.cohortKey)).toEqual([
        "asset:generator",
        "engineer:alice",
        "engineer:bob",
      ]);
    });

    it("computes agreement and overturn rates per cohort", () => {
      const samples: DisagreementSample[] = [
        {
          cohortKey: "engineer:alice",
          championLabel: "pass",
          challengerLabel: "pass",
        },
        {
          cohortKey: "engineer:alice",
          championLabel: "pass",
          challengerLabel: "fail",
          overturned: true,
        },
        {
          cohortKey: "engineer:alice",
          championLabel: "fail",
          challengerLabel: "pass",
          overturned: false,
        },
        {
          cohortKey: "engineer:bob",
          championLabel: "pass",
          challengerLabel: "pass",
        },
        {
          cohortKey: "engineer:bob",
          championLabel: "pass",
          challengerLabel: "pass",
        },
      ];

      const stats = computeCohortBias(samples);
      const alice = stats.find(s => s.cohortKey === "engineer:alice");
      const bob = stats.find(s => s.cohortKey === "engineer:bob");

      expect(alice).toEqual({
        cohortKey: "engineer:alice",
        disagreements: 2,
        agreementRate: 1 / 3,
        overturnRate: 0.5,
      });

      expect(bob).toEqual({
        cohortKey: "engineer:bob",
        disagreements: 0,
        agreementRate: 1,
        overturnRate: 0,
      });
    });

    it("treats missing overturned as not overturned", () => {
      const samples: DisagreementSample[] = [
        {
          cohortKey: "asset:lift",
          championLabel: "pass",
          challengerLabel: "fail",
        },
        {
          cohortKey: "asset:lift",
          championLabel: "fail",
          challengerLabel: "pass",
          overturned: true,
        },
      ];

      const [stat] = computeCohortBias(samples);

      expect(stat.disagreements).toBe(2);
      expect(stat.overturnRate).toBe(0.5);
    });
  });
});
