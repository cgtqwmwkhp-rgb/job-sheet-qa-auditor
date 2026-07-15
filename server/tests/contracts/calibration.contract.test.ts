/**
 * Confidence Calibration Contract Tests (Phase 3.3)
 *
 * Fixtures only — no live OCR, LLM, or network.
 * Verifies feature flag default-off, ECE computation, and threshold tuning.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { PredictionSample } from "../../services/calibration/types";

function perfectlyCalibratedSamples(totalPerBin = 40): PredictionSample[] {
  const samples: PredictionSample[] = [];

  // Each decile bin: avg confidence matches empirical accuracy
  const specs = [
    { confidence: 0.55, accuracy: 0.55 },
    { confidence: 0.65, accuracy: 0.65 },
    { confidence: 0.75, accuracy: 0.75 },
    { confidence: 0.85, accuracy: 0.85 },
    { confidence: 0.95, accuracy: 0.95 },
  ];

  for (const spec of specs) {
    const correct = Math.round(spec.accuracy * totalPerBin);
    for (let i = 0; i < totalPerBin; i++) {
      samples.push({
        confidence: spec.confidence,
        correct: i < correct,
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
      const { isCalibrationEnabled } =
        await import("../../services/calibration");
      expect(isCalibrationEnabled()).toBe(false);
    });

    it("is enabled when FEATURE_CALIBRATION=true", async () => {
      process.env.FEATURE_CALIBRATION = "true";
      const { isCalibrationEnabled } =
        await import("../../services/calibration");
      expect(isCalibrationEnabled()).toBe(true);
    });
  });

  describe("computeEce", () => {
    it("returns ECE≈0 for perfectly calibrated samples at N≥200", async () => {
      const { computeEce, ECE_MIN_SAMPLES } =
        await import("../../services/calibration");

      const samples = perfectlyCalibratedSamples(40); // 200 samples
      expect(samples.length).toBeGreaterThanOrEqual(ECE_MIN_SAMPLES);

      const result = computeEce(samples);
      expect(result.measurementReady).toBe(true);
      expect(result.ece).not.toBeNull();
      expect(result.ece!).toBeLessThan(0.05);
      expect(result.bins.length).toBe(10);
      expect(result.bins.some(bin => bin.count > 0)).toBe(true);
    });

    it("keeps ECE unready below N≥200 and exposes provisionalEce", async () => {
      const { computeEce, ECE_MIN_SAMPLES } =
        await import("../../services/calibration");

      const result = computeEce(miscalibratedSamples());
      expect(result.sampleCount).toBeLessThan(ECE_MIN_SAMPLES);
      expect(result.measurementReady).toBe(false);
      expect(result.ece).toBeNull();
      expect(result.provisionalEce).toBeGreaterThan(0.1);
      expect(result.bins.length).toBe(10);
      expect(result.note).toMatch(/Accumulating review labels/i);
    });

    it("does not report ECE=0 for empty samples (not perfect calibration)", async () => {
      const { computeEce } = await import("../../services/calibration");

      const result = computeEce([]);
      expect(result.ece).toBeNull();
      expect(result.measurementReady).toBe(false);
      expect(result.sampleCount).toBe(0);
      expect(result.bins).toEqual([]);
      expect(result.note).toMatch(/cannot be measured/i);
    });
  });

  describe("review labels → PredictionSample", () => {
    it("maps approve/override/correction into ECE samples", async () => {
      const {
        auditActionsToPredictionSamples,
        resolvedFindingsToPredictionSamples,
        computeEce,
        ECE_MIN_SAMPLES,
      } = await import("../../services/calibration");

      const fromActions = auditActionsToPredictionSamples([
        { action: "FINDING_APPROVE", confidenceScore: 90 },
        { action: "FINDING_OVERRIDE", confidenceScore: 0.85 },
        { action: "FIELD_CORRECTION", confidenceScore: 70 },
        { action: "FINDING_FLAG", confidenceScore: 0.5 },
      ]);
      expect(fromActions).toEqual([
        { confidence: 0.9, correct: true },
        { confidence: 0.85, correct: false },
        { confidence: 0.7, correct: false },
      ]);

      const labels = Array.from({ length: ECE_MIN_SAMPLES }, (_, i) => ({
        resolutionStatus: (i % 3 === 0 ? "approved" : "overridden") as
<<<<<<< HEAD
          | "approved"
          | "overridden",
=======
          "approved" | "overridden",
>>>>>>> fd854d7 (style: prettier format A2 changed files for CI lint gate)
        confidenceScore: 60 + (i % 40),
      }));
      const samples = resolvedFindingsToPredictionSamples(labels);
      expect(samples.length).toBe(ECE_MIN_SAMPLES);

      const ece = computeEce(samples);
      expect(ece.measurementReady).toBe(true);
      expect(ece.ece).not.toBeNull();
      expect(ece.ece).not.toBe(0);
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
      const { suggestThreshold, DEFAULT_CURRENT_THRESHOLD } =
        await import("../../services/calibration");

      const suggestion = suggestThreshold([]);
      expect(suggestion.currentThreshold).toBe(DEFAULT_CURRENT_THRESHOLD);
      expect(suggestion.suggestedThreshold).toBe(DEFAULT_CURRENT_THRESHOLD);
      expect(suggestion.estimatedAutoPassRate).toBe(0);
      expect(suggestion.estimatedOverturnRate).toBe(0);
    });
  });
});
