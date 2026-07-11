/**
 * Checklist completeness checks for compliance checklists (PlantExpand trailer,
 * moveable-plant, general job-summary forms).
 *
 * When a compliance checklist field still shows the placeholder value
 * "Please select" (or equivalent dropdown-default text), it means the
 * engineer never chose a real value.  This is an incomplete checklist —
 * not a substantive field failure (e.g. tread-depth out-of-range).
 *
 * Rule:
 *   CHECK-C010  Checklist Incomplete (Minor / S2)
 */

import type { Finding } from "../analyzer";

export const CHECK_RULE_PREFIX = "CHECK-C";

/**
 * Regex matching "Please select" placeholder values on checklist lines.
 * Captures the field label (group 1) and the placeholder text (group 2).
 *
 * Handles OCR artifacts: optional colons, varying whitespace, case
 * insensitivity, and common OCR mis-readings of "select" (e.g. "seIect").
 */
const PLEASE_SELECT_LINE_RE =
  /^[ \t]*(.{3,80}?)\s*[:：-]?\s*(Please\s+se[l1I|]ect)\s*$/gim;

export interface ChecklistCompletenessResult {
  findings: Finding[];
  incompleteFields: string[];
  summary: string;
}

function normaliseFieldLabel(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .replace(/[:\-–—]+$/, "")
    .trim();
}

export function evaluateChecklistCompleteness(
  text: string,
): ChecklistCompletenessResult {
  const incompleteFields: string[] = [];
  const seen = new Set<string>();

  const re = new RegExp(PLEASE_SELECT_LINE_RE.source, PLEASE_SELECT_LINE_RE.flags);
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const label = normaliseFieldLabel(match[1]);
    const key = label.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      incompleteFields.push(label);
    }
  }

  const findings: Finding[] = [];

  if (incompleteFields.length > 0) {
    const snippet = incompleteFields
      .map(f => `${f}: Please select`)
      .join("; ");

    findings.push({
      ruleId: `${CHECK_RULE_PREFIX}010`,
      fieldName: "Checklist Completion",
      severity: "S2",
      reasonCode: "INCOMPLETE_EVIDENCE",
      rawSnippet: snippet.slice(0, 300),
      normalisedSnippet:
        `${incompleteFields.length} checklist field(s) still show placeholder "Please select": ` +
        incompleteFields.join(", ") +
        ".",
      confidence: 95,
      pageNumber: 1,
      whyItMatters:
        "Compliance checklist fields left at the default \"Please select\" " +
        "indicate the engineer did not complete the inspection checklist. " +
        "The checklist is incomplete — not a substantive field failure.",
      suggestedFix:
        "Return the checklist to the engineer to select the correct values " +
        "for: " +
        incompleteFields.join(", ") +
        ".",
    });
  }

  const summary =
    incompleteFields.length > 0
      ? `Checklist incomplete: ${incompleteFields.length} field(s) still show "Please select" (${incompleteFields.join(", ")}).`
      : "Checklist completeness check passed — no placeholder values found.";

  return { findings, incompleteFields, summary };
}
