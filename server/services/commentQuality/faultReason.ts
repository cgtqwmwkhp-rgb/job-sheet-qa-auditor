/**
 * Fault Reason placeholder honesty (FAULT-C010).
 * Always-on when FEATURE_FAULT_REASON_PLACEHOLDER is unset/true — not failure-path gated.
 */

import type { Finding } from "../analyzer";

export const FEATURE_FAULT_REASON_PLACEHOLDER =
  "FEATURE_FAULT_REASON_PLACEHOLDER";
export const FAULT_REASON_RULE_ID = "FAULT-C010";

/** Default ON — only explicit false/0 disables. */
export function isFaultReasonPlaceholderEnabled(): boolean {
  const v = process.env[FEATURE_FAULT_REASON_PLACEHOLDER];
  if (v === "false" || v === "0") return false;
  return true;
}

const PLACEHOLDER_EXACT = new Set([
  "",
  "-",
  "—",
  "reason",
  "fault reason",
  "please select",
  "select",
  "select one",
  "n/a",
  "na",
  "nil",
  "none",
  "tbd",
  "tbc",
  "todo",
]);

/**
 * True when the extracted Fault Reason is a form label / placeholder, not a real category.
 * Valid categories (Wear & Tear, Unknown, …) are not placeholders.
 */
export function isPlaceholderFaultReason(value: unknown): boolean {
  if (value == null) return false;
  const raw = String(value).trim();
  if (!raw) return true;
  const norm = raw.toLowerCase().replace(/\s+/g, " ").trim();
  if (PLACEHOLDER_EXACT.has(norm)) return true;
  // OCR sometimes returns the field label alone
  if (/^fault\s*reason$/i.test(norm)) return true;
  return false;
}

/** Pull Fault Reason from free-text OCR when structured extract is missing. */
export function extractFaultReasonFromText(text: string): string | null {
  const m = text.match(/Fault\s*Reason\s*[:-]?\s*([^\n\r]{1,80})/i);
  if (!m?.[1]) return null;
  return m[1].replace(/\s+/g, " ").trim();
}

export function resolveFaultReasonValue(
  extracted: unknown,
  text: string
): string | null {
  if (extracted != null && typeof extracted === "object") {
    const obj = extracted as { value?: unknown };
    if (obj.value != null && String(obj.value).trim()) {
      return String(obj.value).trim();
    }
  }
  if (extracted != null && String(extracted).trim()) {
    return String(extracted).trim();
  }
  return extractFaultReasonFromText(text);
}

function issue(message: string, raw: string): Finding {
  return {
    ruleId: FAULT_REASON_RULE_ID,
    fieldName: "Fault Reason",
    severity: "S2",
    reasonCode: "INVALID_FORMAT",
    rawSnippet: raw.slice(0, 300),
    normalisedSnippet: message,
    confidence: 92,
    pageNumber: 1,
    whyItMatters:
      "A placeholder Fault Reason (e.g. the form label 'Reason') blocks trend analysis and hides incomplete root-cause capture.",
    suggestedFix:
      "Select a real Fault Reason category (Wear & Tear, Damage, Electrical, Mechanical, User Error, Routine, or Unknown).",
  };
}

/**
 * Emit FAULT-C010 when Fault Reason is a placeholder. Empty/missing is not flagged
 * here (field is optional) — only when a value is present but meaningless.
 */
export function evaluateFaultReasonPlaceholder(
  faultReason: string | null | undefined
): Finding[] {
  if (!isFaultReasonPlaceholderEnabled()) return [];
  if (faultReason == null) return [];
  const trimmed = String(faultReason).trim();
  if (!trimmed) return [];
  if (!isPlaceholderFaultReason(trimmed)) return [];
  return [
    issue(
      `Fault Reason is a placeholder ("${trimmed}"), not a real fault category.`,
      trimmed
    ),
  ];
}
