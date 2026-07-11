/**
 * Documentation quality score (0–100) for a single job sheet audit.
 *
 * This is the engineer-facing mark — not LLM self-confidence.
 * Deducts by failClass weights from Audit Policy (Major/Minor).
 * Falls back to legacy S0/S1/S2 penalties when failClass is absent.
 */

import type { Finding } from "../analyzer";
import type { FailClass, AuditPolicyWeights } from "../auditPolicy/types";
import { DEFAULT_AUDIT_POLICY } from "../auditPolicy/defaults";

const LEGACY_PENALTY = {
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
  penalties: Array<{
    ruleId: string;
    fieldName: string;
    severity: string;
    failClass?: FailClass;
    points: number;
  }>;
  summary: string;
}

type ScoredFinding = Finding & { failClass?: FailClass };

function pointsForFinding(
  f: ScoredFinding,
  weights: AuditPolicyWeights
): number {
  if (f.failClass) {
    if (f.failClass === "informational") return 0;
    return weights[f.failClass] ?? 0;
  }

  // Legacy path (pre-policy findings)
  const points = LEGACY_PENALTY[f.severity] ?? 0;
  if (points <= 0) return 0;
  if (
    f.severity === "S2" &&
    (f.reasonCode === "LOW_CONFIDENCE" || /ocr\s*confidence/i.test(f.fieldName))
  ) {
    return 0;
  }
  return points;
}

/**
 * Compute documentation quality from final findings after hygiene + consistency + policy.
 */
export function computeDocumentationQualityScore(
  findings: ScoredFinding[],
  options: {
    llmConfidence?: number | null;
    overallResult?: "PASS" | "FAIL" | "REVIEW_QUEUE";
    weights?: AuditPolicyWeights;
  } = {}
): DocumentationQualityResult {
  const llmConfidence =
    options.llmConfidence == null || !Number.isFinite(options.llmConfidence)
      ? null
      : Math.max(0, Math.min(100, Math.round(options.llmConfidence)));

  const weights = options.weights ?? DEFAULT_AUDIT_POLICY.weights;
  const penalties: DocumentationQualityResult["penalties"] = [];
  let deducted = 0;

  for (const f of findings) {
    const points = pointsForFinding(f, weights);
    if (points <= 0) continue;
    deducted += points;
    penalties.push({
      ruleId: f.ruleId,
      fieldName: f.fieldName,
      severity: f.severity,
      failClass: f.failClass,
      points,
    });
  }

  const score = Math.max(0, Math.min(100, 100 - deducted));
  const issueCount = penalties.length;
  const summary =
    issueCount === 0
      ? "Documentation quality 100 — no deducting issues."
      : `Documentation quality ${score} — ${issueCount} issue(s) deducted ${deducted} pts (major=${weights.major}, minor=${weights.minor}).`;

  return { score, llmConfidence, penalties, summary };
}
