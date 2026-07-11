/**
 * Photo evidence consistency scaffold.
 *
 * When Parts Used or Repairs Required has substantive content the engineer
 * should have attached before/after photo evidence. Until real vision
 * verification is wired (image CV), this rule emits an informational /
 * Minor advisory that photo evidence was not programmatically verified.
 *
 * Rule: PHOTO-C010 — seeded as Minor in auditPolicy defaults (job-summary-v1).
 */

import type { Finding } from "../analyzer";
import {
  extractNamedSection,
  sectionHasContent,
} from "../jobSummaryConsistency";

export const PHOTO_EVIDENCE_RULE_PREFIX = "PHOTO-C";

export interface PhotoEvidenceResult {
  findings: Finding[];
  hasPartsOrRepairs: boolean;
  partsUsedPresent: boolean;
  repairsRequiredPresent: boolean;
  summary: string;
}

/**
 * Evaluate whether photo evidence should be expected based on
 * Parts Used / Repairs Required content, and emit a scaffold finding.
 *
 * This is a scaffold — it never inspects actual images. A future
 * vision stage will replace the advisory with real CV verification.
 */
export function evaluatePhotoEvidenceConsistency(
  text: string
): PhotoEvidenceResult {
  const partsUsedBody = extractNamedSection(text, "Parts Used");
  const repairsBody = extractNamedSection(text, "Repairs Required");

  const partsUsed = sectionHasContent(partsUsedBody);
  const repairs = sectionHasContent(repairsBody);

  const hasPartsOrRepairs = partsUsed.present || repairs.present;

  if (!hasPartsOrRepairs) {
    return {
      findings: [],
      hasPartsOrRepairs: false,
      partsUsedPresent: false,
      repairsRequiredPresent: false,
      summary: "No parts/repairs content; photo evidence check skipped.",
    };
  }

  const triggers: string[] = [];
  if (partsUsed.present) triggers.push(`Parts Used: ${partsUsed.snippet}`);
  if (repairs.present) triggers.push(`Repairs Required: ${repairs.snippet}`);
  const raw = triggers.join(" | ");

  const finding: Finding = {
    ruleId: `${PHOTO_EVIDENCE_RULE_PREFIX}010`,
    fieldName: "Photo Evidence",
    severity: "S2",
    reasonCode: "INCOMPLETE_EVIDENCE",
    rawSnippet: raw.slice(0, 300),
    normalisedSnippet:
      "Parts or repairs recorded but before/after photo evidence was not verified.",
    confidence: 70,
    pageNumber: 1,
    whyItMatters:
      "Before/after photos corroborate parts fitted and repairs completed. " +
      "Without photo verification the audit relies solely on text evidence.",
    suggestedFix:
      "Attach before/after photos of the repair area, or confirm photos are present in the evidence pack.",
  };

  return {
    findings: [finding],
    hasPartsOrRepairs: true,
    partsUsedPresent: partsUsed.present,
    repairsRequiredPresent: repairs.present,
    summary: `Photo evidence advisory raised: ${triggers.length} trigger(s).`,
  };
}
