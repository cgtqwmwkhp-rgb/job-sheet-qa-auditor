/**
 * Pure review evidence pack builder (Phase 3.x)
 *
 * No DB, routers, or riskRouting — safe to unit/contract test in isolation.
 */

import type { FindingSummary, ReviewEvidencePack } from "./types";

export interface BuildEvidencePackInput {
  jobSheetId: string;
  confidence: number;
  findings: FindingSummary[];
  reasons?: string[];
}

/**
 * Build a structured review evidence pack from routing/review inputs.
 */
export function buildEvidencePack(
  input: BuildEvidencePackInput,
  now: Date = new Date()
): ReviewEvidencePack {
  return {
    jobSheetId: input.jobSheetId,
    confidence: input.confidence,
    findings: [...input.findings],
    reasons: input.reasons ? [...input.reasons] : [],
    generatedAt: now.toISOString(),
  };
}
