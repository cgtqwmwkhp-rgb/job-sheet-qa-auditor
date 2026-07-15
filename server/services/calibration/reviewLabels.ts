/**
 * Human review labels → PredictionSample for ECE calibration (Wave-4 A2).
 *
 * Reviewer outcomes (approve / override / waive / field correction) are the
 * ground-truth labels that accumulate toward a measurable ECE (N≥200).
 */

import type { PredictionSample } from "./types";

/** Minimum labelled samples before ECE is considered measurement-ready. */
export const ECE_MIN_SAMPLES = 200;

export type ReviewLabelOutcome = "agree" | "overturn" | "correction";

export interface ReviewLabelInput {
  /** Model confidence at prediction time, unit interval [0, 1]. */
  confidence: number;
  /** Human outcome relative to the model prediction. */
  outcome: ReviewLabelOutcome;
}

export interface ResolvedFindingLabel {
  /** Audit-level confidence (0–100 or 0–1). */
  confidenceScore: number | null | undefined;
  resolutionStatus: "waived" | "overridden" | "approved";
}

export function normalizeConfidence(
  value: number | null | undefined
): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const unit = value > 1 ? value / 100 : value;
  if (unit < 0 || unit > 1) return null;
  return unit;
}

/**
 * Map a single human review label to a prediction sample.
 * agree → correct; overturn / correction → incorrect.
 */
export function reviewLabelToPredictionSample(
  label: ReviewLabelInput
): PredictionSample {
  return {
    confidence: label.confidence,
    correct: label.outcome === "agree",
  };
}

export function reviewLabelsToPredictionSamples(
  labels: readonly ReviewLabelInput[]
): PredictionSample[] {
  return labels.map(reviewLabelToPredictionSample);
}

/**
 * Convert resolved findings (human truth) into ECE prediction samples.
 * Skips rows without a usable confidence score.
 */
export function resolvedFindingsToPredictionSamples(
  rows: readonly ResolvedFindingLabel[]
): PredictionSample[] {
  const samples: PredictionSample[] = [];
  for (const row of rows) {
    const confidence = normalizeConfidence(row.confidenceScore);
    if (confidence == null) continue;
    samples.push({
      confidence,
      correct: row.resolutionStatus === "approved",
    });
  }
  return samples;
}

/**
 * Map system_audit_log finding actions onto review labels.
 * Returns null when the action is not a trust/calibration decision.
 */
export function auditActionToReviewLabel(input: {
  action: string;
  confidenceScore: number | null | undefined;
}): ReviewLabelInput | null {
  const confidence = normalizeConfidence(input.confidenceScore);
  if (confidence == null) return null;

  switch (input.action) {
    case "FINDING_APPROVE":
      return { confidence, outcome: "agree" };
    case "FINDING_OVERRIDE":
    case "FINDING_WAIVE":
      return { confidence, outcome: "overturn" };
    case "FIELD_CORRECTION":
      return { confidence, outcome: "correction" };
    default:
      return null;
  }
}

export function auditActionsToPredictionSamples(
  entries: readonly {
    action: string;
    confidenceScore: number | null | undefined;
  }[]
): PredictionSample[] {
  const samples: PredictionSample[] = [];
  for (const entry of entries) {
    const label = auditActionToReviewLabel(entry);
    if (!label) continue;
    samples.push(reviewLabelToPredictionSample(label));
  }
  return samples;
}

/**
 * Load labelled samples via injected I/O (no DB import in pure calibration).
 */
export async function loadReviewLabelSamples(deps: {
  listReviewedFindings: () => Promise<ResolvedFindingLabel[]>;
}): Promise<PredictionSample[]> {
  const rows = await deps.listReviewedFindings();
  return resolvedFindingsToPredictionSamples(rows);
}
