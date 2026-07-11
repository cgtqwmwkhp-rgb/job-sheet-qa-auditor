/**
 * Evidence coherence — narrative claims vs photo pair axes.
 *
 * EVIDENCE-C010 Major — comments claim repair complete / fitted but photo axes fail
 */

import type { Finding } from "../analyzer";
import type { CommentQualitySignals } from "../commentQuality";
import type { PhotoPairCompareArtifact } from "../photoEvidence/pairCompare";
import type { FailurePathSignals } from "../jobSummaryConsistency";

export const EVIDENCE_COHERENCE_RULE_PREFIX = "EVIDENCE-C";

export interface EvidenceCoherenceResult {
  findings: Finding[];
  summary: string;
  contradicted: boolean;
}

const REPAIR_CLAIM_RE =
  /\b(fitted|replaced|repaired|fixed|completed|all\s+(?:works?\s+)?(?:done|complete)|part(?:s)?\s+fitted)\b/i;

/**
 * Detect when the written story claims repair done but photos contradict.
 */
export function evaluateEvidenceCoherence(input: {
  commentSnippet?: string | null;
  commentSignals?: CommentQualitySignals | null;
  failurePathSignals?: FailurePathSignals | null;
  pairCompare?: PhotoPairCompareArtifact | null;
  worksCompleteYes?: boolean;
}): EvidenceCoherenceResult {
  const findings: Finding[] = [];
  const snippet = input.commentSnippet || input.commentSignals?.snippet || "";
  const claimsRepair =
    REPAIR_CLAIM_RE.test(snippet) ||
    Boolean(input.worksCompleteYes) ||
    Boolean(input.failurePathSignals?.worksCompleteYes);

  const pairs = input.pairCompare?.pairs ?? [];
  const failingPairs = pairs.filter(p => {
    const high =
      p.confidenceBand === "high" ||
      (typeof p.confidence === "number" && p.confidence >= 0.8);
    if (!high) return false;
    return (
      p.axes.work_done === "fail" ||
      p.axes.repaired_properly === "fail" ||
      p.axes.residual_risk === "fail"
    );
  });

  if (claimsRepair && failingPairs.length > 0) {
    const p = failingPairs[0];
    findings.push({
      ruleId: `${EVIDENCE_COHERENCE_RULE_PREFIX}010`,
      fieldName: "Evidence Coherence",
      severity: "S1",
      reasonCode: "CONFLICT",
      rawSnippet: `${snippet.slice(0, 160)} || photo: ${p.reasoning.slice(0, 120)}`,
      normalisedSnippet:
        "Narrative claims repair complete / parts fitted but before/after photo compare failed.",
      confidence: Math.round((p.confidence ?? 0.85) * 100),
      pageNumber: p.afterPage ?? p.beforePage ?? 1,
      whyItMatters:
        "Comments saying fixed while photos show unfinished work is the highest-cost documentation lie — it ships unsafe or incomplete assets.",
      suggestedFix:
        "Align the story with the photos: either finish and re-photograph the repair, or update comments/Parts/works-complete to match the unfinished state.",
    });
  }

  // Safe=Yes + residual_risk fail → note (major)
  if (
    input.failurePathSignals?.safeYes &&
    pairs.some(
      p =>
        (p.confidenceBand === "high" || (p.confidence ?? 0) >= 0.8) &&
        p.axes.residual_risk === "fail"
    )
  ) {
    const p = pairs.find(x => x.axes.residual_risk === "fail")!;
    findings.push({
      ruleId: `${EVIDENCE_COHERENCE_RULE_PREFIX}010`,
      fieldName: "Evidence Coherence (Safe vs Photos)",
      severity: "S1",
      reasonCode: "CONFLICT",
      rawSnippet: p.reasoning.slice(0, 300),
      normalisedSnippet:
        "Asset marked Safe to Use Yes but photo residual_risk axis failed.",
      confidence: Math.round((p.confidence ?? 0.85) * 100),
      pageNumber: p.afterPage ?? 1,
      whyItMatters:
        "Safe-to-use Yes with visible residual hazard is a safety documentation conflict.",
      suggestedFix:
        "Set Safe to Use to No, or recapture after photos showing a safe finished state.",
    });
  }

  const contradicted = findings.length > 0;
  return {
    findings,
    contradicted,
    summary: contradicted
      ? `Evidence coherence: ${findings.length} contradiction(s) (EVIDENCE-C010).`
      : "Evidence coherence OK — narrative and photos do not contradict.",
  };
}
