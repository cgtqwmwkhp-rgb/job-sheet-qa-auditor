/**
 * Grounded date gate (PR1 / PX-103).
 *
 * Never promote date / dateOfService at high confidence unless the value
 * appears in a text-layer or OCR source span near a Date label.
 * Abstain otherwise — identical wrong dates @100% must not land as fact.
 */

import { normalizeVoteValue } from "./voteField";
import type {
  EngineFieldCandidate,
  FieldVoteResult,
  VoteReasonCode,
} from "./types";

export const DATE_VOTE_FIELD_IDS = new Set([
  "date",
  "dateOfService",
  "expiryDate",
]);

export const UNGROUNDED_DATE_REASON: VoteReasonCode = "UNGROUNDED_DATE";

const DATE_TOKEN_RE = /\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{4}[./-]\d{1,2}[./-]\d{1,2}/g;

/**
 * Normalize date tokens for equality (slashes, case).
 */
export function normalizeDateToken(value: string): string {
  return value.trim().replace(/[./-]/g, "/").toLowerCase();
}

/**
 * True when `value` appears in `sourceText` as a date-like token.
 */
export function dateValueAppearsInText(
  value: string,
  sourceText: string
): boolean {
  if (!value?.trim() || !sourceText?.trim()) return false;
  const target = normalizeDateToken(value);
  const matches = sourceText.match(DATE_TOKEN_RE) ?? [];
  for (const m of matches) {
    if (normalizeDateToken(m) === target) return true;
  }
  // Also accept exact substring after light normalize
  const compactSrc = sourceText.replace(/[./-]/g, "/").toLowerCase();
  return compactSrc.includes(target);
}

/**
 * True when a Date label appears near the value in source text.
 * Rejects "Next Service Date" / "Expiry Date" windows unless field is expiry.
 */
export function dateLabelNearValue(
  value: string,
  sourceText: string,
  fieldId: string
): boolean {
  if (!value?.trim() || !sourceText?.trim()) return false;
  const target = normalizeDateToken(value);
  const text = sourceText;

  // Find all date token positions
  const re = new RegExp(DATE_TOKEN_RE.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (normalizeDateToken(m[0]) !== target) continue;
    const idx = m.index;
    const before = text.slice(Math.max(0, idx - 48), idx);
    const beforeLower = before.toLowerCase();

    if (fieldId === "expiryDate") {
      if (
        /expir(?:y|es|ation)|valid\s*(?:until|to)|next\s*service|due\s*date/i.test(
          before
        )
      ) {
        return true;
      }
      continue;
    }

    // Service / completion Date — require "Date" label, reject next-service window
    if (
      beforeLower.includes("next service") ||
      /next\s+service\s+date\s*[:.-]?\s*$/i.test(before) ||
      /expir(?:y|es|ation)\s*date\s*[:.-]?\s*$/i.test(before)
    ) {
      continue;
    }

    // Label-anchored: "Date:" or "Date " within the window (not only "update")
    if (/(?:^|[\n\r\s])date\s*[:.-]\s*$/i.test(before)) return true;
    if (/(?:completion\s*)?date\s*[:.-]?\s*$/i.test(before.trim())) return true;
    if (/date\s*[:.-]\s*$/i.test(before)) return true;
  }

  // Regex scrape evidence: "Date: <value>" or "date of service: <value>"
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const labelValue = new RegExp(
    `(?:^|[\\n\\r]|\\s)(?:date(?:\\s+of\\s+service)?|service\\s+date)\\s*[:.-]\\s*${escaped}`,
    "i"
  );
  if (fieldId !== "expiryDate" && labelValue.test(text)) {
    // Extra reject for next service
    const idx = text.search(labelValue);
    if (idx >= 0) {
      const window = text.slice(Math.max(0, idx - 20), idx).toLowerCase();
      if (!window.includes("next service") && !window.includes("expiry")) {
        return true;
      }
    }
  }

  if (fieldId === "expiryDate") {
    const expRe = new RegExp(
      `(?:expir(?:y|es|ation)|next\\s*service\\s*date|due\\s*date)\\s*[:.-]?\\s*${escaped}`,
      "i"
    );
    return expRe.test(text);
  }

  return false;
}

/**
 * A date candidate is grounded when its value appears near a Date label in
 * source text, OR the candidate already carries text_layer / strong crop
 * evidence that cites a label.
 */
export function isDateCandidateGrounded(
  fieldId: string,
  candidate: EngineFieldCandidate,
  sourceText: string
): boolean {
  const value = candidate.value;
  if (!value?.trim()) return false;

  if (
    candidate.engine === "text_layer" ||
    /text_layer|label_anchor|ocr_regex_date/i.test(candidate.evidence ?? "")
  ) {
    // Still require the value to exist in source when we have source text
    if (!sourceText.trim()) return true;
    return (
      dateValueAppearsInText(value, sourceText) &&
      (dateLabelNearValue(value, sourceText, fieldId) ||
        /text_layer|label_anchor|ocr_regex_date/i.test(candidate.evidence ?? ""))
    );
  }

  if (!sourceText.trim()) return false;
  return (
    dateValueAppearsInText(value, sourceText) &&
    dateLabelNearValue(value, sourceText, fieldId)
  );
}

export function isDateFieldId(fieldId: string): boolean {
  return DATE_VOTE_FIELD_IDS.has(fieldId);
}

/**
 * Filter date candidates to grounded ones only.
 */
export function filterGroundedDateCandidates(
  fieldId: string,
  candidates: EngineFieldCandidate[],
  sourceText: string
): EngineFieldCandidate[] {
  if (!isDateFieldId(fieldId)) return candidates;
  return candidates.filter(c => isDateCandidateGrounded(fieldId, c, sourceText));
}

/**
 * Apply grounded date gate to a completed vote. If the winning value is not
 * grounded, abstain (PX-103).
 */
export function applyGroundedDateGateToVote(
  vote: FieldVoteResult,
  sourceText: string
): FieldVoteResult {
  if (!isDateFieldId(vote.fieldId)) return vote;
  if (vote.abstained || !vote.value) return vote;

  const grounded = filterGroundedDateCandidates(
    vote.fieldId,
    vote.candidates,
    sourceText
  );
  const winnerGrounded = grounded.some(
    c =>
      normalizeVoteValue(vote.fieldId, c.value) ===
      normalizeVoteValue(vote.fieldId, vote.value)
  );

  // Also verify against source text directly (handles single-engine promotion)
  const textOk =
    dateValueAppearsInText(vote.value, sourceText) &&
    dateLabelNearValue(vote.value, sourceText, vote.fieldId);

  if (winnerGrounded || textOk) return vote;

  return {
    ...vote,
    value: null,
    confidence: Math.min(vote.confidence * 0.4, 0.4),
    decision: "abstain",
    reasonCode: UNGROUNDED_DATE_REASON,
    winningEngines: [],
    fallbackValue: vote.value,
    fallbackEngine: vote.winningEngines[0],
    abstained: true,
  };
}

/**
 * Convenience: gate a full batch of votes.
 */
export function gateDateVotes(
  fields: Record<string, FieldVoteResult>,
  sourceText: string
): Record<string, FieldVoteResult> {
  const out: Record<string, FieldVoteResult> = {};
  for (const [id, vote] of Object.entries(fields)) {
    out[id] = applyGroundedDateGateToVote(vote, sourceText);
  }
  return out;
}
