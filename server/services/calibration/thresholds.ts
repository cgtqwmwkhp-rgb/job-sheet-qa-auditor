/**
 * Threshold tuning helpers for auto-pass / overturn baselines (Phase 3.3)
 */

import type {
  PredictionSample,
  ThresholdOptions,
  ThresholdSuggestion,
} from "./types";

export const DEFAULT_CURRENT_THRESHOLD = 0.85;
const THRESHOLD_MIN = 0.5;
const THRESHOLD_MAX = 0.99;
const THRESHOLD_STEP = 0.01;

function buildThresholdSweep(): number[] {
  const thresholds: number[] = [];
  for (
    let value = THRESHOLD_MIN;
    value <= THRESHOLD_MAX + 1e-9;
    value += THRESHOLD_STEP
  ) {
    thresholds.push(Math.round(value * 100) / 100);
  }
  return thresholds;
}

function metricsAt(
  samples: PredictionSample[],
  threshold: number
): { autoPassRate: number; overturnRate: number } {
  if (samples.length === 0) {
    return { autoPassRate: 0, overturnRate: 0 };
  }

  const autoPass = samples.filter(sample => sample.confidence >= threshold);
  const autoPassRate = autoPass.length / samples.length;
  const overturnRate =
    autoPass.length > 0
      ? autoPass.filter(sample => !sample.correct).length / autoPass.length
      : 0;

  return { autoPassRate, overturnRate };
}

export function suggestThreshold(
  samples: PredictionSample[],
  options: ThresholdOptions = {}
): ThresholdSuggestion {
  const currentThreshold =
    options.currentThreshold ?? DEFAULT_CURRENT_THRESHOLD;

  if (samples.length === 0) {
    return {
      currentThreshold,
      suggestedThreshold: currentThreshold,
      estimatedAutoPassRate: 0,
      estimatedOverturnRate: 0,
    };
  }

  const thresholds = buildThresholdSweep();
  const { targetOverturnRate, minAutoPassRate } = options;

  let suggested = currentThreshold;
  const hasConstraints =
    targetOverturnRate !== undefined || minAutoPassRate !== undefined;

  if (hasConstraints) {
    const qualifying = thresholds.filter(threshold => {
      const metrics = metricsAt(samples, threshold);
      const meetsOverturn =
        targetOverturnRate === undefined ||
        metrics.overturnRate <= targetOverturnRate;
      const meetsAutoPass =
        minAutoPassRate === undefined ||
        metrics.autoPassRate >= minAutoPassRate;
      return meetsOverturn && meetsAutoPass;
    });

    if (qualifying.length > 0) {
      suggested = qualifying[qualifying.length - 1];
    } else {
      suggested = thresholds[0];
    }
  }

  const suggestedMetrics = metricsAt(samples, suggested);

  return {
    currentThreshold,
    suggestedThreshold: suggested,
    estimatedAutoPassRate: suggestedMetrics.autoPassRate,
    estimatedOverturnRate: suggestedMetrics.overturnRate,
  };
}
