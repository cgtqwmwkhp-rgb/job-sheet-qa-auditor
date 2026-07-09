/**
 * Golden-set growth from corrections (Phase 2.8)
 *
 * Converts reviewer corrections (normalisedSnippet + correctedValue)
 * into eval fixture candidates. Feature-flagged via FEATURE_GOLDEN_GROWTH.
 */

import { createHash } from "crypto";
import type { CorrectionInput, GoldenFixtureCandidate } from "./types";

export const FEATURE_FLAG = "FEATURE_GOLDEN_GROWTH";

export class GoldenGrowthValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoldenGrowthValidationError";
  }
}

/**
 * Default: disabled when FEATURE_GOLDEN_GROWTH unset.
 * Set FEATURE_GOLDEN_GROWTH=true to enable.
 */
export function isGoldenGrowthEnabled(): boolean {
  return process.env[FEATURE_FLAG] === "true";
}

function computeFixtureId(
  jobSheetId: string,
  fieldKey: string,
  snippet: string
): string {
  const payload = `${jobSheetId}|${fieldKey}|${snippet}`;
  const hash = createHash("sha256").update(payload).digest("hex");
  return `golden-${hash.slice(0, 16)}`;
}

function deterministicCreatedAt(id: string): string {
  const hash = createHash("sha256").update(id).digest("hex");
  const epochMs = parseInt(hash.slice(0, 8), 16) * 1000;
  return new Date(epochMs).toISOString();
}

/**
 * Pure transform: correction → golden fixture candidate.
 * Id is deterministic from jobSheetId + fieldKey + normalisedSnippet.
 */
export function toGoldenFixture(
  correction: CorrectionInput
): GoldenFixtureCandidate {
  const snippet = correction.normalisedSnippet.trim();

  if (!snippet) {
    throw new GoldenGrowthValidationError(
      "normalisedSnippet must be non-empty to grow a golden fixture"
    );
  }

  const id = computeFixtureId(
    correction.jobSheetId,
    correction.fieldKey,
    snippet
  );

  return {
    id,
    sourceJobSheetId: correction.jobSheetId,
    fieldKey: correction.fieldKey,
    expectedValue: correction.correctedValue,
    snippet,
    createdAt: deterministicCreatedAt(id),
  };
}
