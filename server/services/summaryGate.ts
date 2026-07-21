/**
 * PX-101: Keep AI/narrative summary honest relative to overallResult.
 *
 * Policy demotions can leave free-text that still says "passes" on FAIL /
 * REVIEW_QUEUE. Gate the summary before persist so UIs never contradict
 * the canonical outcome.
 */

export type SummaryGateOutcome = "PASS" | "FAIL" | "REVIEW_QUEUE" | string;

const PASS_CLAIM =
  /\b(passes?|passed|passing|all\s+checks?\s+pass(?:ed)?|audit\s+pass(?:ed|es)?)\b/gi;

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

  const neutralized = text
    ? text.replace(PASS_CLAIM, match => {
        // Preserve length-ish readability; mark contradiction explicitly.
        if (/^pass(?:es|ed|ing)?$/i.test(match)) return "does not pass";
        return "does not pass";
      })
    : "";

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
