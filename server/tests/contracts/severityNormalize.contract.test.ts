/**
 * Severity Normalization Contract Tests (Phase 3.x)
 *
 * Fixtures only — no DB, documentProcessor, or live AI.
 * Verifies feature flag default and canonical severity mapping.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  FEATURE_FLAG,
  isSeverityNormalizeEnabled,
  normalizeSeverity,
  type CanonicalSeverity,
} from "../../services/severityNormalize";

describe("Severity Normalize Contract (Phase 3.x)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env[FEATURE_FLAG];
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("feature flag", () => {
    it("is disabled by default when FEATURE_SEVERITY_NORMALIZE unset", () => {
      expect(isSeverityNormalizeEnabled()).toBe(false);
    });

    it("is enabled only when FEATURE_SEVERITY_NORMALIZE=true", () => {
      process.env[FEATURE_FLAG] = "true";
      expect(isSeverityNormalizeEnabled()).toBe(true);
    });

    it("remains disabled for non-true values", () => {
      process.env[FEATURE_FLAG] = "1";
      expect(isSeverityNormalizeEnabled()).toBe(false);
      process.env[FEATURE_FLAG] = "false";
      expect(isSeverityNormalizeEnabled()).toBe(false);
    });
  });

  describe("normalizeSeverity", () => {
    const cases: Array<[string, CanonicalSeverity]> = [
      ["critical", "S0"],
      ["S0", "S0"],
      ["s0", "S0"],
      ["sev0", "S0"],
      ["high", "S1"],
      ["S1", "S1"],
      ["s1", "S1"],
      ["medium", "S2"],
      ["med", "S2"],
      ["S2", "S2"],
      ["s2", "S2"],
      ["low", "S3"],
      ["S3", "S3"],
      ["s3", "S3"],
      ["  CRITICAL  ", "S0"],
      [" High ", "S1"],
      ["info", "unknown"],
      ["", "unknown"],
      ["S4", "unknown"],
    ];

    it.each(cases)("maps %j to %s", (raw, expected) => {
      expect(normalizeSeverity(raw)).toBe(expected);
    });
  });
});
