/**
 * Sign-off / VLM honesty (PX-104 companion).
 *
 * When ink verification did not run (`vlmUsed:false`), OCR cannot see
 * handwritten strokes — MAJOR "sign-off missing" findings are false positives.
 * Demote them to S3 / LOW_CONFIDENCE (or Present when a signature label exists).
 */

import type { Finding } from "../analyzer";

const SIGN_OFF_FIELD_RE =
  /signature|engineerSignOff|technicianSignature|sign[\s_-]?off/i;

const MISSING_SNIPPET_RE = /^(absent|missing|no|unsigned|not\s*present|none)$/i;

// PX-109 residual: the two canonical sign-off fields that DEF-C040 / WJ-C040
// / LOLER-R004 / PTO-R004 (TE, PTO, default families) all key off of.
// A GoldSpec/JSR re-emit for these exact fields can land at S2/LOW_CONFIDENCE
// (not just S0/S1 MISSING_FIELD) — still a false MAJOR-in-waiting once
// applyAuditPolicy's fieldName-alias match runs, so it must be demoted too.
const EXACT_SIGN_OFF_FIELDS = new Set(["engineerSignOff", "customerSignature"]);

export interface SignOffHonestyOptions {
  /** True only when Anthropic/mock VLM actually inspected ink. */
  vlmUsed: boolean;
  /** Document text shows a signature / sign-off label box. */
  signatureLabelPresent?: boolean;
}

function isMissingLikeSnippet(finding: Finding): boolean {
  const snippet = (
    finding.normalisedSnippet ||
    finding.rawSnippet ||
    ""
  ).trim();
  return MISSING_SNIPPET_RE.test(snippet);
}

function isIssueBand(severity: Finding["severity"]): boolean {
  return severity === "S0" || severity === "S1" || severity === "S2";
}

function isMajorSignOffMissing(finding: Finding): boolean {
  if (!SIGN_OFF_FIELD_RE.test(finding.fieldName || "")) return false;

  // S0/S1 are the product "MAJOR/Critical" band used for hold-queue routing —
  // the original honesty case (any sign-off-shaped field name).
  if (finding.severity === "S0" || finding.severity === "S1") {
    if (finding.reasonCode === "MISSING_FIELD") return true;
    if (isMissingLikeSnippet(finding)) return true;
  }

  // PX-109 residual: widen to S2/LOW_CONFIDENCE, but only for the exact
  // engineerSignOff/customerSignature field names so we don't over-broaden
  // the honesty exception to unrelated signature-shaped findings.
  if (
    EXACT_SIGN_OFF_FIELDS.has(finding.fieldName) &&
    isIssueBand(finding.severity)
  ) {
    if (finding.reasonCode === "MISSING_FIELD") return true;
    if (finding.reasonCode === "LOW_CONFIDENCE") return true;
    if (isMissingLikeSnippet(finding)) return true;
  }

  return false;
}

/**
 * Demote or skip MAJOR sign-off-missing findings when VLM ink was not used.
 * Pure — does not mutate input.
 */
export function demoteSignOffMissingWhenInkUnverified(
  findings: Finding[],
  options: SignOffHonestyOptions
): Finding[] {
  if (options.vlmUsed) return findings;
  if (!findings.length) return findings;

  return findings.map(f => {
    if (!isMajorSignOffMissing(f)) return f;

    if (options.signatureLabelPresent) {
      return {
        ...f,
        severity: "S3",
        reasonCode: "LOW_CONFIDENCE",
        normalisedSnippet: "Present",
        confidence: Math.max(f.confidence || 0, 70),
        whyItMatters:
          "Signature/sign-off label detected but ink verification was skipped (vlmUsed:false). Recorded as Present — confirm handwritten ink on the document.",
        suggestedFix:
          "Scroll to the sign-off box and confirm the handwritten signature is present.",
        // Locks classification informational — prevents applyAuditPolicy's
        // DEF-C040/WJ-C040 fieldName-alias match from undoing this demote.
        honestyDemoted: true,
      };
    }

    return {
      ...f,
      severity: "S3",
      reasonCode: "LOW_CONFIDENCE",
      whyItMatters:
        "Sign-off ink was not verified because the VLM ink stage did not run (vlmUsed:false). Do not treat this as a confirmed MAJOR missing sign-off — confirm on the document.",
      suggestedFix:
        "Inspect the technician/customer sign-off area on the PDF. Re-run with FEATURE_VLM_VERIFICATION enabled for grounded ink checks.",
      honestyDemoted: true,
    };
  });
}

/**
 * True when VLM ink verification produced a usable present/absent hint.
 */
export function wasVlmInkUsed(input: {
  ran?: boolean;
  vlmUsed?: boolean;
  imageQaVlmUsed?: boolean;
}): boolean {
  // `ran` alone is insufficient — require an explicit VLM-used flag.
  return input.vlmUsed === true || input.imageQaVlmUsed === true;
}
