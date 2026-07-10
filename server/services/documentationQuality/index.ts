/**
 * Documentation quality score (0–100) for a single job sheet audit.
 *
 * This is the engineer-facing mark — not LLM self-confidence.
 * Deducts for Issues (S0/S1/S2); Passed/informational S3 findings do not penalise.
 */

import type { Finding } from "../analyzer";

const PENALTY = {
  S0: 25,
  S1: 15,
  S2: 5,
  S3: 0,
} as const;

export interface DocumentationQualityResult {
  /** Engineer documentation quality 0–100 for this sheet. */
  score: number;
  /** LLM / analyzer confidence if known (separate from quality). */
  llmConfidence: number | null;
  penalties: Array<{ fieldName: string; severity: string; points: number }>;
  summary: string;
}

/**
 * Compute documentation quality from final findings after hygiene + consistency.
 */
export function computeDocumentationQualityScore(
  findings: Finding[],
  options: {
    llmConfidence?: number | null;
    overallResult?: "PASS" | "FAIL" | "REVIEW_QUEUE";
  } = {}
): DocumentationQualityResult {
  const llmConfidence =
    options.llmConfidence == null || !Number.isFinite(options.llmConfidence)
      ? null
      : Math.max(0, Math.min(100, Math.round(options.llmConfidence)));

  const penalties: DocumentationQualityResult["penalties"] = [];
  let deducted = 0;

  for (const f of findings) {
    const points = PENALTY[f.severity] ?? 0;
    if (points <= 0) continue;
    // Soft OCR / system noise should not tank the engineer mark
    if (
      f.severity === "S2" &&
      (f.reasonCode === "LOW_CONFIDENCE" ||
        /ocr\s*confidence/i.test(f.fieldName))
    ) {
      continue;
    }
    deducted += points;
    penalties.push({
      fieldName: f.fieldName,
      severity: f.severity,
      points,
    });
  }

  const score = Math.max(0, Math.min(100, 100 - deducted));
  const issueCount = penalties.length;
  const summary =
    issueCount === 0
      ? "Documentation quality 100 — no deducting issues."
      : `Documentation quality ${score} — ${issueCount} issue(s) deducted ${deducted} pts (S0=${PENALTY.S0}, S1=${PENALTY.S1}, S2=${PENALTY.S2}).`;

  return { score, llmConfidence, penalties, summary };
}
