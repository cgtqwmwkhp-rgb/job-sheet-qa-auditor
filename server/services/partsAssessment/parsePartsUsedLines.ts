import type { PartsUsedLine } from "./types";

const LINE_SEP = /\s*[—–\-/|]\s*/;
const QTY_RE = /^\d+(?:\.\d+)?$/;
const SKIP_LINE_RE = /^(?:none|n\/a|na|nil|-|—|\.|see\s+above|tbc|tba)$/i;

function looksLikePartNumber(token: string): boolean {
  const t = token.trim();
  if (!t) return false;
  if (/^PN[- ]?\d/i.test(t)) return true;
  if (/^[A-Z]{1,4}\d+[\w\-_.]*$/i.test(t)) return true;
  if (/\d/.test(t) && /^[A-Za-z0-9][A-Za-z0-9\-_.]*$/.test(t)) return true;
  return false;
}

/**
 * Parse a single Parts Used line into part number, description, and qty.
 *
 * Supports `WT158 — wheel — 1` and `WT158 / wheel / 1` style separators.
 */
export function parsePartsUsedLine(raw: string): PartsUsedLine {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { partNumber: null, description: null, raw: trimmed };
  }

  const parts = trimmed
    .split(LINE_SEP)
    .map(s => s.trim())
    .filter(Boolean);
  if (parts.length === 0) {
    return { partNumber: null, description: null, raw: trimmed };
  }

  let partNumber: string | null = null;
  let description: string | null = null;
  let qty: string | null = null;

  if (looksLikePartNumber(parts[0])) {
    partNumber = parts[0];
    const remainder = parts.slice(1);

    if (remainder.length === 0) {
      return { partNumber, description: null, qty: null, raw: trimmed };
    }

    if (remainder.length >= 2 && QTY_RE.test(remainder[remainder.length - 1])) {
      qty = remainder[remainder.length - 1];
      const descParts = remainder.slice(0, -1);
      description = descParts.join(" ").trim() || null;
    } else if (remainder.length === 1 && QTY_RE.test(remainder[0])) {
      qty = remainder[0];
    } else {
      description = remainder.join(" ").trim() || null;
    }
  } else {
    if (parts.length >= 2 && QTY_RE.test(parts[parts.length - 1])) {
      qty = parts[parts.length - 1];
      description = parts.slice(0, -1).join(" ").trim() || null;
    } else {
      description = parts.join(" ").trim() || null;
    }
  }

  return { partNumber, description, qty, raw: trimmed };
}

function isSkippableLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (SKIP_LINE_RE.test(trimmed)) return true;
  if (!/[a-z0-9]/i.test(trimmed)) return true;
  return false;
}

/** Split Parts Used section body into parsed line items. */
export function parsePartsUsedLines(sectionBody: string): PartsUsedLine[] {
  if (!sectionBody.trim()) return [];

  return sectionBody
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => !isSkippableLine(line))
    .map(parsePartsUsedLine);
}

export function isCompletePartsLine(line: PartsUsedLine): boolean {
  return Boolean(line.partNumber?.trim() && line.description?.trim());
}
