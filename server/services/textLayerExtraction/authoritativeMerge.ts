/**
 * Authoritative persist backfill (Sprint 1.5 PR-B / PX-106).
 *
 * Root cause: Gemini can return `{}` for extractedFields on a born-digital
 * Job Summary that the text layer already grounded (Stage 1 label-anchor
 * extracted 6/6 locally, graded 0/6). Persist must not throw that grounded
 * evidence away — backfill canonical headers from the text-layer (or ROI
 * spatial) snapshot whenever the graded value is missing or empty. An empty
 * string is treated as absent, never as "Gemini confirmed no value".
 */

export interface ExtractedFieldEntry {
  value: string;
  confidence: number;
  pageNumber: number;
}

export type ExtractedFieldMap = Record<string, ExtractedFieldEntry>;

/** Canonical Job Summary header ids eligible for authoritative backfill. */
export const CANONICAL_HEADER_FIELD_IDS = [
  "assetId",
  "serialNumber",
  "jobReference",
  "jobNumber",
  "date",
  "dateOfService",
  "makeModel",
  "customerName",
  "technicianName",
] as const;

export function isBlankFieldValue(value: string | undefined | null): boolean {
  return value == null || value.trim().length === 0;
}

/**
 * Backfill graded extractedFields with nonempty authoritative (text-layer /
 * ROI spatial) values for canonical headers whenever the graded value is
 * missing or empty. A nonempty graded value always wins — this is a pure
 * gap-filler, not a wholesale override of Gemini's judgment.
 */
export function backfillAuthoritativeExtractedFields(
  graded: ExtractedFieldMap,
  authoritative: ExtractedFieldMap,
  fieldIds: readonly string[] = CANONICAL_HEADER_FIELD_IDS
): ExtractedFieldMap {
  const out: ExtractedFieldMap = { ...graded };
  for (const id of fieldIds) {
    const authField = authoritative[id];
    if (!authField || isBlankFieldValue(authField.value)) continue;
    const current = out[id];
    if (!current || isBlankFieldValue(current.value)) {
      out[id] = authField;
    }
  }
  return out;
}
