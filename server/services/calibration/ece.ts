/**
 * Expected Calibration Error (ECE) computation (Phase 3.3)
 */

import type { EceResult, PredictionSample } from "./types";

export function computeEce(
  samples: PredictionSample[],
  binCount = 10
): EceResult {
  if (samples.length === 0) {
    return {
      ece: null,
      bins: [],
      measurementReady: false,
      note: "No labelled samples; ECE cannot be measured.",
    };
  }

  const bins: EceResult["bins"] = [];
  let ece = 0;

  for (let i = 0; i < binCount; i++) {
    const lower = i / binCount;
    const upper = (i + 1) / binCount;
    const inBin = samples.filter(sample => {
      if (i === binCount - 1) {
        return sample.confidence >= lower && sample.confidence <= upper;
      }
      return sample.confidence >= lower && sample.confidence < upper;
    });

    const count = inBin.length;
    const avgConfidence =
      count > 0
        ? inBin.reduce((sum, sample) => sum + sample.confidence, 0) / count
        : 0;
    const accuracy =
      count > 0 ? inBin.filter(sample => sample.correct).length / count : 0;

    bins.push({ lower, upper, avgConfidence, accuracy, count });

    if (count > 0) {
      ece += (count / samples.length) * Math.abs(avgConfidence - accuracy);
    }
  }

  return { ece, bins, measurementReady: true };
}
