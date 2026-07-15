/**
 * PASS sample miss-rate ops report (Wave-6 P5)
 *
 * Aggregates human review outcomes for sampled AUTO_PASS sheets and feeds
 * evaluatePassSampleMissRate — the measurement gate before release bar use.
 */

import {
  evaluatePassSampleMissRate,
  DEFAULT_MAX_PASS_SAMPLE_MISS_RATE,
  DEFAULT_PASS_SAMPLE_MIN_SAMPLES,
} from "./policy";
import type {
  PassSampleMissRateOptions,
  PassSampleMissRateResult,
  PassSampleReviewOutcome,
} from "./types";

export type PassModelResult = "PASS" | "FAIL" | "REVIEW_QUEUE";

export interface PassSampleReviewRow {
  modelResult: PassModelResult | Lowercase<PassModelResult>;
  humanSampleRequested: boolean;
  humanFoundDefect?: boolean;
}

export interface PassSampleMissRateArtifact extends PassSampleMissRateResult {
  asOf: string;
}

const HUMAN_DEFECT_RESOLUTIONS = new Set(["overridden", "waived", "flagged"]);

function normalizeModelResult(
  value: string | null | undefined
): PassModelResult | null {
  if (!value) return null;
  const upper = value.toUpperCase();
  if (upper === "PASS" || upper === "FAIL" || upper === "REVIEW_QUEUE") {
    return upper;
  }
  return null;
}

export function reviewRowToPassSampleOutcome(
  row: PassSampleReviewRow
): PassSampleReviewOutcome | null {
  const modelResult = normalizeModelResult(row.modelResult);
  if (modelResult !== "PASS") return null;

  if (!row.humanSampleRequested) {
    return { sampled: false, humanFoundDefect: false };
  }

  return {
    sampled: true,
    humanFoundDefect: row.humanFoundDefect === true,
  };
}

export function derivePassSampleOutcomes(
  rows: readonly PassSampleReviewRow[]
): PassSampleReviewOutcome[] {
  const outcomes: PassSampleReviewOutcome[] = [];
  for (const row of rows) {
    const outcome = reviewRowToPassSampleOutcome(row);
    if (outcome) outcomes.push(outcome);
  }
  return outcomes;
}

export function extractPassSampleRowFromReport(
  reportJson: unknown
): PassSampleReviewRow | null {
  if (!reportJson || typeof reportJson !== "object") return null;
  const report = reportJson as Record<string, unknown>;
  const artifacts = report.featureFlagArtifacts;
  if (!artifacts || typeof artifacts !== "object") return null;

  const samplingPolicy = (artifacts as Record<string, unknown>).samplingPolicy;
  if (!samplingPolicy || typeof samplingPolicy !== "object") return null;

  const sampling = samplingPolicy as Record<string, unknown>;
  const humanSampleRequested = sampling.humanSampleRequested === true;
  const modelResult =
    normalizeModelResult(
      typeof sampling.overallResult === "string"
        ? sampling.overallResult
        : undefined
    ) ?? "PASS";

  return {
    modelResult,
    humanSampleRequested,
  };
}

export function humanFoundDefectFromFindingStatuses(
  statuses: readonly (string | null | undefined)[]
): boolean {
  return statuses.some(
    status =>
      status != null && HUMAN_DEFECT_RESOLUTIONS.has(status.toLowerCase())
  );
}

export function buildPassSampleMissRateArtifact(
  outcomes: readonly PassSampleReviewOutcome[],
  opts?: PassSampleMissRateOptions & { asOf?: string }
): PassSampleMissRateArtifact {
  const { asOf, ...gateOpts } = opts ?? {};
  const result = evaluatePassSampleMissRate([...outcomes], {
    maxMissRate: gateOpts.maxMissRate ?? DEFAULT_MAX_PASS_SAMPLE_MISS_RATE,
    minSamplesRequired:
      gateOpts.minSamplesRequired ?? DEFAULT_PASS_SAMPLE_MIN_SAMPLES,
  });

  return {
    ...result,
    asOf: asOf ?? new Date().toISOString(),
  };
}

export async function loadPassSampleOutcomes(deps: {
  listPassSampleReviewRows: () => Promise<readonly PassSampleReviewRow[]>;
}): Promise<PassSampleReviewOutcome[]> {
  const rows = await deps.listPassSampleReviewRows();
  return derivePassSampleOutcomes(rows);
}
