/**
 * Shadow challenger pass-rate measurement (PR-AI-11)
 *
 * Computes champion vs challenger outcome rates and percentage-point (pp)
 * deltas from persisted shadow comparisons — the gate before canary.
 */

import type {
  AuditOutcome,
  PassRateMeasurement,
  ShadowComparison,
} from "./types";

/** Default minimum comparisons before claiming measurement readiness. */
export const DEFAULT_MEASUREMENT_MIN_SAMPLES = 30;

export function getMeasurementMinSamples(): number {
  const raw = process.env.SHADOW_MEASUREMENT_MIN_SAMPLES;
  if (raw === undefined || raw === "") return DEFAULT_MEASUREMENT_MIN_SAMPLES;
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_MEASUREMENT_MIN_SAMPLES;
  return Math.max(1, Math.min(10_000, Math.round(n)));
}

function ratePercent(count: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((count / total) * 10000) / 100;
}

function ppDelta(challengerRate: number, championRate: number): number {
  return Math.round((challengerRate - championRate) * 100) / 100;
}

function countOutcome(
  comparisons: ShadowComparison[],
  side: "champion" | "challenger",
  outcome: AuditOutcome
): number {
  return comparisons.filter(c => c[side].overallResult === outcome).length;
}

/**
 * Build comparable pass/fail/review rates and pp deltas.
 * Positive passRatePpDelta means the challenger PASSes more often than champion.
 */
export function buildPassRateMeasurement(
  comparisons: ShadowComparison[],
  minSamples?: number
): PassRateMeasurement {
  const sampleSize = comparisons.length;
  const minSamplesRequired = minSamples ?? getMeasurementMinSamples();

  const championPassRate = ratePercent(
    countOutcome(comparisons, "champion", "PASS"),
    sampleSize
  );
  const challengerPassRate = ratePercent(
    countOutcome(comparisons, "challenger", "PASS"),
    sampleSize
  );
  const championFailRate = ratePercent(
    countOutcome(comparisons, "champion", "FAIL"),
    sampleSize
  );
  const challengerFailRate = ratePercent(
    countOutcome(comparisons, "challenger", "FAIL"),
    sampleSize
  );
  const championReviewRate = ratePercent(
    countOutcome(comparisons, "champion", "REVIEW_QUEUE"),
    sampleSize
  );
  const challengerReviewRate = ratePercent(
    countOutcome(comparisons, "challenger", "REVIEW_QUEUE"),
    sampleSize
  );

  return {
    sampleSize,
    minSamplesRequired,
    measurementReady: sampleSize >= minSamplesRequired,
    advisoryOnly: comparisons.every(c => !c.canaryApplied),
    championPassRate,
    challengerPassRate,
    passRatePpDelta: ppDelta(challengerPassRate, championPassRate),
    championFailRate,
    challengerFailRate,
    failRatePpDelta: ppDelta(challengerFailRate, championFailRate),
    championReviewRate,
    challengerReviewRate,
    reviewRatePpDelta: ppDelta(challengerReviewRate, championReviewRate),
  };
}
