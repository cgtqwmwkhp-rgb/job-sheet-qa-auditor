/**
 * PX-101: Keep AI/narrative summary honest relative to overallResult.
 *
 * Policy demotions can leave free-text that still says "passes" on FAIL /
 * REVIEW_QUEUE. Gate the summary before persist so UIs never contradict
 * the canonical outcome.
 */

export type SummaryGateOutcome = "PASS" | "FAIL" | "REVIEW_QUEUE" | string;

// PX-101: also strip compliance-flavoured claims ("fully compliant", "meets
// all requirements") — reviewers phrase honesty violations many ways, and
// any of these on a FAIL/REVIEW_QUEUE sheet contradicts the outcome exactly
// like "passes" does.
//
// PX-110: when the claim is preceded by a copula ("is/are/was/were compliant"),
// the copula must be consumed by the same match — otherwise substituting just
// the claim word leaves a dangling copula ("is does not pass with all
// specified rules"). The copula+claim alternative is tried first so a single
// pass replaces the whole phrase.
const PASS_TERMS =
  "passes?|passed|passing|all\\s+checks?\\s+pass(?:ed)?|audit\\s+pass(?:ed|es)?|fully\\s+compliant|compliant|compliance|meets\\s+(?:all\\s+)?requirements?";
const PASS_CLAIM = new RegExp(
  `\\b(?:is|are|was|were)\\s+(?:${PASS_TERMS})\\b|\\b(?:${PASS_TERMS})\\b`,
  "gi"
);

function normalizeOutcome(outcome: SummaryGateOutcome): string {
  return String(outcome ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
}

/**
 * Rewrite summary so it cannot claim a pass when the sheet did not pass.
 * Returns the original summary unchanged for PASS / empty outcomes.
 */
export function gateSummaryToResult(
  summary: string | null | undefined,
  overallResult: SummaryGateOutcome
): string {
  const text = (summary ?? "").trim();
  const outcome = normalizeOutcome(overallResult);

  if (!outcome || outcome === "PASS" || outcome === "WAIVED") {
    return text;
  }

  const neutralized = text ? text.replace(PASS_CLAIM, "does not pass") : "";

  const prefix =
    outcome === "FAIL"
      ? "Outcome: FAIL."
      : outcome === "REVIEW_QUEUE"
        ? "Outcome: Needs review."
        : `Outcome: ${outcome}.`;

  if (!neutralized) return prefix;

  // Avoid stacking duplicate Outcome: prefixes on re-gate.
  const body = neutralized.replace(
    /^Outcome:\s*(FAIL|Needs review|REVIEW_QUEUE)[^.]*\.\s*/i,
    ""
  );

  return `${prefix} ${body}`.trim();
}
