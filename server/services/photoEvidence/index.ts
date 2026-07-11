/**
 * Photo evidence consistency scaffold.
 *
 * When Parts Used or Repairs Required has substantive content the engineer
 * should have attached before/after photo evidence. Until real vision
 * verification is wired (image CV), this rule emits an informational /
 * Minor advisory that photo evidence was not programmatically verified.
 *
 * Rules:
 *   PHOTO-C010 — Parts/repairs present but no photo-label evidence found (Minor).
 *   PHOTO-C011 — Photo evidence labels detected in OCR text (Passed S3 info).
 */

import type { Finding } from "../analyzer";
import {
  extractNamedSection,
  sectionHasContent,
} from "../jobSummaryConsistency";

export const PHOTO_EVIDENCE_RULE_PREFIX = "PHOTO-C";

/**
 * Patterns that indicate before/after photo labelling in OCR text.
 * Case-insensitive. Anchored to word boundaries where practical.
 */
const PHOTO_LABEL_PATTERNS: RegExp[] = [
  /\bbefore\b/i,
  /\bafter\b/i,
  /\bphoto\s*[1-9]\b/i,
  /\bimage\s*[1-9]\b/i,
  /\bpre[\s-]?repair\b/i,
  /\bpost[\s-]?repair\b/i,
  /\bbefore\s*photo\b/i,
  /\bafter\s*photo\b/i,
  /\bphotographic\s*evidence\b/i,
  /\bevidence\s*photo/i,
];

export interface PhotoEvidenceResult {
  findings: Finding[];
  hasPartsOrRepairs: boolean;
  partsUsedPresent: boolean;
  repairsRequiredPresent: boolean;
  photoLabelsDetected: boolean;
  matchedLabels: string[];
  summary: string;
}

/**
 * Scan document text for OCR/text hints of before/after photo labels.
 * Returns distinct matched label strings (case-normalised) across all patterns.
 */
export function detectPhotoLabels(text: string): string[] {
  const seenLower = new Set<string>();
  const results: string[] = [];
  for (const pattern of PHOTO_LABEL_PATTERNS) {
    const global = new RegExp(pattern.source, pattern.flags + "g");
    for (const m of Array.from(text.matchAll(global))) {
      const key = m[0].toLowerCase();
      if (!seenLower.has(key)) {
        seenLower.add(key);
        results.push(m[0]);
      }
    }
  }
  return results;
}

/**
 * Evaluate whether photo evidence should be expected based on
 * Parts Used / Repairs Required content, and emit a scaffold finding.
 *
 * When photo-label text hints are found alongside parts/repairs, emits a
 * Passed S3 PHOTO-C011 instead of (or in addition to) the advisory C010.
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
      photoLabelsDetected: false,
      matchedLabels: [],
      summary: "No parts/repairs content; photo evidence check skipped.",
    };
  }

  const triggers: string[] = [];
  if (partsUsed.present) triggers.push(`Parts Used: ${partsUsed.snippet}`);
  if (repairs.present) triggers.push(`Repairs Required: ${repairs.snippet}`);
  const raw = triggers.join(" | ");

  const matchedLabels = detectPhotoLabels(text);
  const photoLabelsDetected = matchedLabels.length >= 2;

  const findings: Finding[] = [];

  if (photoLabelsDetected) {
    findings.push({
      ruleId: `${PHOTO_EVIDENCE_RULE_PREFIX}011`,
      fieldName: "Photo Evidence",
      severity: "S3",
      reasonCode: "INCOMPLETE_EVIDENCE",
      rawSnippet: matchedLabels.join(", ").slice(0, 300),
      normalisedSnippet:
        "Photo evidence labels present (visual QA not verified).",
      confidence: 65,
      pageNumber: 1,
      whyItMatters:
        "Before/after photo labels detected in document text suggest photo evidence " +
        "accompanies the parts/repair record. Visual verification is not yet automated.",
      suggestedFix:
        "No action required — photo labels found. Full visual QA pending CV integration.",
    });
  } else {
    findings.push({
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
    });
  }

  const summaryTag = photoLabelsDetected
    ? `Photo labels detected (${matchedLabels.length} hint(s)); PHOTO-C011 passed.`
    : `Photo evidence advisory raised: ${triggers.length} trigger(s).`;

  return {
    findings,
    hasPartsOrRepairs: true,
    partsUsedPresent: partsUsed.present,
    repairsRequiredPresent: repairs.present,
    photoLabelsDetected,
    matchedLabels,
    summary: summaryTag,
  };
}
