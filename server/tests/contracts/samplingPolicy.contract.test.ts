/**
 * Human Sampling Policy Contract Tests (Phase 3.x)
 *
 * Fixtures/mocks only — no DB, documentProcessor, or live AI.
 * Verifies feature flag default, confidence-tier rates, and deterministic sampling.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  FEATURE_FLAG,
  isSamplingPolicyEnabled,
  decideSampling,
  DEFAULT_BASE_RATE,
  DEFAULT_LOW_CONFIDENCE_RATE,
  DEFAULT_LOW_CONFIDENCE_THRESHOLD,
  type SamplingInput,
} from "../../services/samplingPolicy";

describe("Sampling Policy Contract (Phase 3.x)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env[FEATURE_FLAG];
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("feature flag", () => {
    it("is disabled by default when FEATURE_SAMPLING_POLICY unset", () => {
      expect(isSamplingPolicyEnabled()).toBe(false);
    });

    it("is enabled only when FEATURE_SAMPLING_POLICY=true", () => {
      process.env[FEATURE_FLAG] = "true";
      expect(isSamplingPolicyEnabled()).toBe(true);
    });

    it("remains disabled for non-true values", () => {
      process.env[FEATURE_FLAG] = "1";
      expect(isSamplingPolicyEnabled()).toBe(false);
      process.env[FEATURE_FLAG] = "false";
      expect(isSamplingPolicyEnabled()).toBe(false);
    });
  });

  describe("decideSampling confidence tiers", () => {
    const highConfidenceInput: SamplingInput = {
      confidence: 0.9,
      cohortKey: "site-a",
    };

    const lowConfidenceInput: SamplingInput = {
      confidence: 0.5,
      cohortKey: "site-a",
    };

    it("uses base rate at or above the low-confidence threshold", () => {
      const atThreshold = decideSampling({
        confidence: DEFAULT_LOW_CONFIDENCE_THRESHOLD,
      });
      const aboveThreshold = decideSampling(highConfidenceInput);

      expect(atThreshold.rate).toBe(DEFAULT_BASE_RATE);
      expect(aboveThreshold.rate).toBe(DEFAULT_BASE_RATE);
      expect(atThreshold.reason).toContain("at or above threshold");
      expect(aboveThreshold.reason).toContain("at or above threshold");
    });

    it("uses low-confidence rate below the threshold", () => {
      const result = decideSampling(lowConfidenceInput);

      expect(result.rate).toBe(DEFAULT_LOW_CONFIDENCE_RATE);
      expect(result.reason).toContain("below threshold");
    });

    it("respects custom rate and threshold overrides", () => {
      const custom = decideSampling(
        { confidence: 0.6 },
        {
          baseRate: 0.1,
          lowConfidenceRate: 0.4,
          lowConfidenceThreshold: 0.7,
        }
      );

      expect(custom.rate).toBe(0.4);
    });
  });

  describe("deterministic sampling", () => {
    it("returns the same decision for identical input", () => {
      const input: SamplingInput = {
        confidence: 0.82,
        cohortKey: "cohort-deterministic",
      };

      const first = decideSampling(input);
      const second = decideSampling(input);

      expect(first).toEqual(second);
    });

    it("may differ when cohortKey changes", () => {
      const base: SamplingInput = { confidence: 0.82, cohortKey: "a" };
      const variant: SamplingInput = { confidence: 0.82, cohortKey: "b" };

      const a = decideSampling(base);
      const b = decideSampling(variant);

      expect(a.rate).toBe(b.rate);
      expect(typeof a.sample).toBe("boolean");
      expect(typeof b.sample).toBe("boolean");
    });
  });
});
