/**
 * Field exact-match F1 measurement (Wave-4 A3)
 *
 * Pure helpers — no DB, OCR, or network. Callers must check
 * measurementReady before treating f1 as authoritative.
 */

import {
  FIELD_F1_MIN_SAMPLES,
  type FieldF1Metrics,
  type FieldObservation,
} from "./types";

function normalizeValue(
  value: string | number | boolean | null
): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  const trimmed = value.trim().toLowerCase();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * Exact-match micro F1 over labelled field observations.
 *
 * - predicted positive: normalised predicted is non-null
 * - labelled positive: normalised expected is non-null
 * - true positive: both non-null and equal
 */
export function measureFieldExactMatchF1(
  observations: FieldObservation[],
  minSamplesRequired = FIELD_F1_MIN_SAMPLES
): FieldF1Metrics {
  if (observations.length === 0) {
    return {
      sampleCount: 0,
      minSamplesRequired,
      measurementReady: false,
      f1: null,
      precision: null,
      recall: null,
      truePositives: 0,
      predictedPositive: 0,
      labelledPositive: 0,
      exactMatches: 0,
      note: "No labelled field observations; field-F1 cannot be measured.",
    };
  }

  let truePositives = 0;
  let predictedPositive = 0;
  let labelledPositive = 0;
  let exactMatches = 0;

  for (const obs of observations) {
    const expected = normalizeValue(obs.expected);
    const predicted = normalizeValue(obs.predicted);

    if (predicted !== null) predictedPositive++;
    if (expected !== null) labelledPositive++;

    if (expected !== null && predicted !== null && expected === predicted) {
      truePositives++;
      exactMatches++;
    } else if (expected === null && predicted === null) {
      // Both absent — exact agreement on absence (counts as match, not TP)
      exactMatches++;
    }
  }

  const precision =
    predictedPositive === 0 ? 0 : truePositives / predictedPositive;
  const recall = labelledPositive === 0 ? 0 : truePositives / labelledPositive;
  const f1 =
    precision + recall === 0
      ? 0
      : (2 * precision * recall) / (precision + recall);

  const measurementReady = observations.length >= minSamplesRequired;

  if (!measurementReady) {
    return {
      sampleCount: observations.length,
      minSamplesRequired,
      measurementReady: false,
      f1: null,
      precision: null,
      recall: null,
      provisionalF1: f1,
      truePositives,
      predictedPositive,
      labelledPositive,
      exactMatches,
      note: `Accumulating labelled fields toward field-F1 readiness (${observations.length}/${minSamplesRequired}).`,
    };
  }

  return {
    sampleCount: observations.length,
    minSamplesRequired,
    measurementReady: true,
    f1,
    precision,
    recall,
    truePositives,
    predictedPositive,
    labelledPositive,
    exactMatches,
  };
}
