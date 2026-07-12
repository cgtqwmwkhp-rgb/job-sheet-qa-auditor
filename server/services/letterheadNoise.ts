/**
 * PlantExpand form letterhead/footer noise — discard everywhere.
 *
 * Standard template chrome (company phone, website, Email label, brand name)
 * must never become field values, finding snippets, or coaching evidence.
 */

/** UK-style contact phone as printed on PlantExpand letterhead/footer. */
function looksLikeUkContactPhone(value: string): boolean {
  const spaced = value.trim();
  // Compact digit run after stripping separators
  const compact = spaced.replace(/[\s()-]/g, "");
  if (/^0800\d{6,8}$/.test(compact)) return true;
  // Typical UK geographic / mobile: 10–11 digits starting with 0
  if (/^0\d{9,10}$/.test(compact)) return true;
  // Embedded phone inside a larger OCR blob
  const embedded = spaced.match(
    /(?:^|[^\d])(0\d{2,4}[\s-]?\d{3,4}[\s-]?\d{3,5}|0800[\s-]?\d{3}[\s-]?\d{3,5})(?:[^\d]|$)/
  );
  if (!embedded) return false;
  const embDigits = embedded[1].replace(/\D/g, "");
  return /^0800\d{6,8}$/.test(embDigits) || /^0\d{9,10}$/.test(embDigits);
}

const URL_RE = /www\.|https?:\/\//i;
const EMAIL_ADDR_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const DOMAIN_RE = /\.com\b|\.co\.uk\b/i;
const BRAND_RE = /\bplantexpand\b/i;
const EMAIL_LABEL_RE = /\bEmails?\b/i;
const PHONE_CHUNK_RE =
  /0\d{2,4}[\s-]?\d{3,4}[\s-]?\d{3,5}|0800[\s-]?\d{3}[\s-]?\d{3,5}/g;

/**
 * True when a value is (or is dominated by) form letterhead/footer chrome.
 * Safe for field filtering: does NOT flag plain job/asset digit IDs.
 */
export function isLetterheadNoise(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (URL_RE.test(v)) return true;
  if (EMAIL_ADDR_RE.test(v)) return true;
  if (DOMAIN_RE.test(v)) return true;
  if (BRAND_RE.test(v)) return true;
  if (looksLikeUkContactPhone(v)) return true;
  // Lone "Email" / "Emails" label from footer
  if (/^emails?$/i.test(v)) return true;
  return false;
}

/** True when any letterhead token appears inside a larger string. */
export function containsLetterheadNoise(value: string): boolean {
  return isLetterheadNoise(value);
}

/**
 * Strip letterhead/footer fragments from a value.
 * Returns null when nothing usable remains.
 */
export function stripLetterheadNoise(
  value: string | null | undefined
): string | null {
  if (value == null) return null;
  let v = String(value).trim();
  if (!v) return null;

  // Drop conflict parts that are pure letterhead
  if (v.includes("|")) {
    const kept = v
      .split("|")
      .map(p => stripLetterheadNoise(p.trim()))
      .filter((p): p is string => Boolean(p));
    if (kept.length === 0) return null;
    if (kept.length === 1) return kept[0];
    return kept.join(" | ");
  }

  if (isLetterheadNoise(v) && !hasNonLetterheadSubstance(v)) {
    return null;
  }

  v = v
    .replace(EMAIL_ADDR_RE, " ")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/www\.\S+/gi, " ")
    .replace(PHONE_CHUNK_RE, " ")
    .replace(BRAND_RE, " ")
    .replace(EMAIL_LABEL_RE, " ")
    .replace(/\bPlant\s*Expand\b/gi, " ")
    .replace(/\bLtd\.?\b/gi, " ")
    .replace(/\s*[|/,;]+\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!v) return null;
  if (isLetterheadNoise(v) && !hasNonLetterheadSubstance(v)) return null;
  return v;
}

/**
 * True when text still has substance after ignoring letterhead tokens
 * (e.g. job id "87", username "Richard.Newton").
 */
function hasNonLetterheadSubstance(value: string): boolean {
  const stripped = value
    .replace(EMAIL_ADDR_RE, " ")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/www\.\S+/gi, " ")
    .replace(PHONE_CHUNK_RE, " ")
    .replace(BRAND_RE, " ")
    .replace(EMAIL_LABEL_RE, " ")
    .replace(/\bPlant\s*Expand\b/gi, " ")
    .replace(/\bLtd\.?\b/gi, " ")
    .replace(/[|/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!stripped) return false;
  // Remaining username, job id, short token, etc.
  if (/^[A-Za-z][A-Za-z0-9]*\.[A-Za-z][A-Za-z0-9]*$/.test(stripped)) {
    return true;
  }
  if (/^\d{1,6}$/.test(stripped)) return true;
  if (
    /^[A-Z0-9][A-Z0-9_-]{2,}$/i.test(stripped) &&
    !looksLikeUkContactPhone(value)
  ) {
    return true;
  }
  // Any remaining alphanumeric word of length >= 2 that isn't Email
  return /\b[A-Za-z0-9]{2,}\b/.test(stripped);
}

/** Split conflict snippets and drop letterhead-only parts. */
export function scrubLetterheadConflictParts(value: string): string {
  const parts = value
    .split("|")
    .map(p => p.trim())
    .filter(Boolean);
  if (parts.length <= 1) {
    return stripLetterheadNoise(value) ?? "";
  }
  const kept = parts
    .map(p => stripLetterheadNoise(p))
    .filter((p): p is string => Boolean(p));
  return kept.join(" | ");
}

export interface SnippetFields {
  rawSnippet?: string | null;
  normalisedSnippet?: string | null;
}

/**
 * Scrub letterhead from finding / cite snippet fields.
 * Returns null snippets when only letterhead remained.
 */
export function scrubLetterheadFromSnippets<T extends SnippetFields>(
  fields: T
): T {
  const raw = scrubLetterheadConflictParts(fields.rawSnippet ?? "");
  const norm = scrubLetterheadConflictParts(fields.normalisedSnippet ?? "");
  return {
    ...fields,
    rawSnippet: raw || "",
    normalisedSnippet: norm || "",
  };
}

/** Drop extracted strategy results whose value is letterhead-only. */
export function rejectLetterheadExtractedValue(
  value: string | null | undefined
): string | null {
  if (value == null) return null;
  const cleaned = stripLetterheadNoise(value);
  return cleaned;
}
