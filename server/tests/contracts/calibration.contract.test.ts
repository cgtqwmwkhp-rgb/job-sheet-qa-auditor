/**
 * Confidence Calibration Contract Tests (Phase 3.3)
 *
 * Fixtures only — no live OCR, LLM, or network.
 * Verifies feature flag default-off, ECE computation, and threshold tuning.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { PredictionSample } from "../../services/calibration/types";

function perfectlyCalibratedSamples(): PredictionSample[] {
  const samples: PredictionSample[] = [];

  // Each decile bin: avg confidence matches empirical accuracy
  const specs = [
    { confidence: 0.55, total: 20, correct: 11 },
    { confidence: 0.65, total: 20, correct: 13 },
    { confidence: 0.75, total: 20, correct: 15 },
    { confidence: 0.85, total: 20, correct: 17 },
    { confidence: 0.95, total: 20, correct: 19 },
  ];

  for (const spec of specs) {
    for (let i = 0; i < spec.total; i++) {
      samples.push({
        confidence: spec.confidence,
        correct: i < spec.correct,
      });
    }
  }

  return samples;
}

function miscalibratedSamples(): PredictionSample[] {
  return [
    { confidence: 0.95, correct: false },
    { confidence: 0.92, correct: false },
    { confidence: 0.9, correct: false },
    { confidence: 0.88, correct: true },
    { confidence: 0.6, correct: true },
    { confidence: 0.55, correct: true },
    { confidence: 0.52, correct: false },
    { confidence: 0.51, correct: false },
  ];
}

function thresholdSweepSamples(): PredictionSample[] {
  return [
    { confidence: 0.99, correct: true },
    { confidence: 0.95, correct: true },
    { confidence: 0.9, correct: true },
    { confidence: 0.85, correct: false },
    { confidence: 0.8, correct: false },
    { confidence: 0.7, correct: true },
    { confidence: 0.6, correct: true },
    { confidence: 0.55, correct: false },
  ];
}

describe("Calibration Contract (Phase 3.3)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    delete process.env.FEATURE_CALIBRATION;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
    vi.resetModules();
  });

  describe("feature flag", () => {
    it("is disabled by default when FEATURE_CALIBRATION unset", async () => {
      const { isCalibrationEnabled } = await import(
        "../../services/calibration"
      );
      expect(isCalibrationEnabled()).toBe(false);
    });

    it("is enabled when FEATURE_CALIBRATION=true", async () => {
      process.env.FEATURE_CALIBRATION = "true";
      const { isCalibrationEnabled } = await import(
        "../../services/calibration"
      );
      expect(isCalibrationEnabled()).toBe(true);
    });
  });

  describe("computeEce", () => {
    it("returns ECE≈0 for perfectly calibrated samples", async () => {
      const { computeEce } = await import("../../services/calibration");

      const result = computeEce(perfectlyCalibratedSamples());
      expect(result.ece).toBeLessThan(0.05);
      expect(result.bins.length).toBe(10);
      expect(result.bins.some(bin => bin.count > 0)).toBe(true);
    });

    it("returns ECE>0 for miscalibrated samples", async () => {
      const { computeEce } = await import("../../services/calibration");

      const result = computeEce(miscalibratedSamples());
      expect(result.ece).toBeGreaterThan(0.1);
      expect(result.bins.length).toBe(10);
    });

    it("does not report ECE=0 for empty samples (not perfect calibration)", async () => {
      const { computeEce } = await import("../../services/calibration");

      const result = computeEce([]);
      expect(result.ece).toBeNull();
      expect(result.measurementReady).toBe(false);
      expect(result.bins).toEqual([]);
      expect(result.note).toMatch(/cannot be measured/i);
    });
  });

  describe("suggestThreshold", () => {
    it("shows monotonic-ish behavior: higher threshold lowers auto-pass rate", async () => {
      const { suggestThreshold } = await import("../../services/calibration");

      const samples = thresholdSweepSamples();
      const low = suggestThreshold(samples, { currentThreshold: 0.5 });
      const high = suggestThreshold(samples, { currentThreshold: 0.95 });

      expect(high.estimatedAutoPassRate).toBeLessThanOrEqual(
        low.estimatedAutoPassRate
      );
    });

    it("shows monotonic-ish behavior: higher threshold lowers overturn rate", async () => {
      const { suggestThreshold } = await import("../../services/calibration");

      const samples = thresholdSweepSamples();
      const atLow = suggestThreshold(samples, {
        currentThreshold: 0.5,
        targetOverturnRate: 1,
      });
      const atHigh = suggestThreshold(samples, {
        currentThreshold: 0.95,
        targetOverturnRate: 1,
      });

      expect(atHigh.estimatedOverturnRate).toBeLessThanOrEqual(
        atLow.estimatedOverturnRate
      );
    });

    it("respects target overturn rate and minimum auto-pass rate", async () => {
      const { suggestThreshold } = await import("../../services/calibration");

      const samples = thresholdSweepSamples();
      const suggestion = suggestThreshold(samples, {
        targetOverturnRate: 0,
        minAutoPassRate: 0.25,
      });

      expect(suggestion.estimatedOverturnRate).toBe(0);
      expect(suggestion.estimatedAutoPassRate).toBeGreaterThanOrEqual(0.25);
      expect(suggestion.suggestedThreshold).toBeGreaterThanOrEqual(0.5);
      expect(suggestion.suggestedThreshold).toBeLessThanOrEqual(0.99);
    });

    it("handles empty samples", async () => {
      const { suggestThreshold, DEFAULT_CURRENT_THRESHOLD } = await import(
        "../../services/calibration"
      );

      const suggestion = suggestThreshold([]);
      expect(suggestion.currentThreshold).toBe(DEFAULT_CURRENT_THRESHOLD);
      expect(suggestion.suggestedThreshold).toBe(DEFAULT_CURRENT_THRESHOLD);
      expect(suggestion.estimatedAutoPassRate).toBe(0);
      expect(suggestion.estimatedOverturnRate).toBe(0);
    });
  });
});
