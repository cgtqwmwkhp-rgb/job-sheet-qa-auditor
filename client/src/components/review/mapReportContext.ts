/**
 * Shared reportJson field helpers for review context panels.
 */

export function extractFieldValue(
  extractedFields: unknown,
  ...keys: string[]
): string | null {
  if (!extractedFields || typeof extractedFields !== "object") return null;
  const fields = extractedFields as Record<string, unknown>;
  for (const key of keys) {
    const raw = fields[key];
    if (raw == null) continue;
    if (typeof raw === "string" && raw.trim()) return raw.trim();
    if (typeof raw === "object" && raw !== null && "value" in raw) {
      const v = (raw as { value?: unknown }).value;
      if (typeof v === "string" && v.trim()) return v.trim();
    }
  }
  return null;
}

export function mapMakeModelFromReport(reportJson: unknown): string | null {
  if (!reportJson || typeof reportJson !== "object") return null;
  const report = reportJson as Record<string, unknown>;
  return extractFieldValue(report.extractedFields, "makeModel", "make_model");
}
