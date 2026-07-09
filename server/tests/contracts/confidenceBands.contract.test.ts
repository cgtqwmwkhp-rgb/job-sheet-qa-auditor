/**
 * Confidence Band Classifier Contract Tests (Phase 3.x)
 *
 * Fixtures only — no DB, documentProcessor, or live AI.
 * Verifies feature flag default-off, band classification, custom thresholds, and clamping.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("Confidence Bands Contract (Phase 3.x)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    delete process.env.FEATURE_CONFIDENCE_BANDS;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
    vi.resetModules();
  });

  describe("feature flag", () => {
    it("is disabled by default when FEATURE_CONFIDENCE_BANDS unset", async () => {
      const { isConfidenceBandsEnabled } = await import(
        "../../services/confidenceBands"
      );
      expect(isConfidenceBandsEnabled()).toBe(false);
    });

    it("is enabled when FEATURE_CONFIDENCE_BANDS=true", async () => {
      process.env.FEATURE_CONFIDENCE_BANDS = "true";
      const { isConfidenceBandsEnabled } = await import(
        "../../services/confidenceBands"
      );
      expect(isConfidenceBandsEnabled()).toBe(true);
    });

    it("remains disabled for non-true values", async () => {
      process.env.FEATURE_CONFIDENCE_BANDS = "1";
      const { isConfidenceBandsEnabled: enabledForOne } = await import(
        "../../services/confidenceBands"
      );
      expect(enabledForOne()).toBe(false);

      vi.resetModules();
      process.env.FEATURE_CONFIDENCE_BANDS = "false";
      const { isConfidenceBandsEnabled: enabledForFalse } = await import(
        "../../services/confidenceBands"
      );
      expect(enabledForFalse()).toBe(false);
    });
  });

  describe("classifyConfidence", () => {
    it("classifies high band at default highMin threshold", async () => {
      const { classifyConfidence } = await import(
        "../../services/confidenceBands"
      );

      expect(classifyConfidence(0.95)).toEqual({
        band: "high",
        confidence: 0.95,
      });
      expect(classifyConfidence(0.9)).toEqual({
        band: "high",
        confidence: 0.9,
      });
    });

    it("classifies medium band between mediumMin and highMin", async () => {
      const { classifyConfidence } = await import(
        "../../services/confidenceBands"
      );

      expect(classifyConfidence(0.89)).toEqual({
        band: "medium",
        confidence: 0.89,
      });
      expect(classifyConfidence(0.7)).toEqual({
        band: "medium",
        confidence: 0.7,
      });
    });

    it("classifies low band below mediumMin", async () => {
      const { classifyConfidence } = await import(
        "../../services/confidenceBands"
      );

      expect(classifyConfidence(0.69)).toEqual({
        band: "low",
        confidence: 0.69,
      });
      expect(classifyConfidence(0)).toEqual({
        band: "low",
        confidence: 0,
      });
    });

    it("respects custom thresholds", async () => {
      const { classifyConfidence } = await import(
        "../../services/confidenceBands"
      );

      const thresholds = { highMin: 0.95, mediumMin: 0.8 };

      expect(classifyConfidence(0.96, thresholds)).toEqual({
        band: "high",
        confidence: 0.96,
      });
      expect(classifyConfidence(0.85, thresholds)).toEqual({
        band: "medium",
        confidence: 0.85,
      });
      expect(classifyConfidence(0.75, thresholds)).toEqual({
        band: "low",
        confidence: 0.75,
      });
    });

    it("clamps confidence below 0 and above 1", async () => {
      const { classifyConfidence } = await import(
        "../../services/confidenceBands"
      );

      expect(classifyConfidence(-0.5)).toEqual({
        band: "low",
        confidence: 0,
      });
      expect(classifyConfidence(1.5)).toEqual({
        band: "high",
        confidence: 1,
      });
    });
  });
});
