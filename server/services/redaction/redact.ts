/**
 * Pure PII redaction helpers (Phase 3.x)
 *
 * No DB, documentProcessor, or live AI — safe to unit/contract test in isolation.
 */

import type { RedactionResult } from "./types";

const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

/** UK-ish phone: 10+ digits with optional spaces, dashes, or parentheses. */
const PHONE_PATTERN = /(?:\+?\d[\d\s().-]{6,}\d|\d{10,})/g;

/** Long digit runs (12+ consecutive digits). */
const NUMBER_PATTERN = /\d{12,}/g;

function countDigits(value: string): number {
  return (value.match(/\d/g) ?? []).length;
}

function redactPhoneMatches(text: string): { text: string; changed: boolean } {
  let changed = false;

  const next = text.replace(PHONE_PATTERN, match => {
    const digits = countDigits(match);
    if (digits < 10 || digits >= 12) {
      return match;
    }

    changed = true;
    return "[PHONE]";
  });

  return { text: next, changed };
}

/**
 * Redact common PII patterns from free text.
 *
 * - Emails → [EMAIL]
 * - UK-ish phone numbers (10–11 digits, optional separators) → [PHONE]
 * - Long digit runs (12+ consecutive digits) → [NUMBER]
 */
export function redactPii(text: string): RedactionResult {
  let redacted = false;
  let output = text;

  const afterEmail = output.replace(EMAIL_PATTERN, () => {
    redacted = true;
    return "[EMAIL]";
  });
  output = afterEmail;

  const afterNumber = output.replace(NUMBER_PATTERN, () => {
    redacted = true;
    return "[NUMBER]";
  });
  output = afterNumber;

  const afterPhone = redactPhoneMatches(output);
  if (afterPhone.changed) {
    redacted = true;
  }
  output = afterPhone.text;

  return { text: output, redacted };
}
