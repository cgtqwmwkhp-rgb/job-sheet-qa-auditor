/**
 * Resolve extracted engineer / technician names onto users.id for analytics attribution.
 */

export interface TechnicianCandidate {
  id: number;
  name: string | null;
  email: string | null;
  role?: string;
}

/** Normalize for fuzzy equality: lower, strip punctuation, collapse whitespace. */
export function normalizePersonName(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Pull a display name from extractedFields.technicianName (or common aliases).
 */
export function extractTechnicianNameFromFields(
  fields: Record<string, unknown> | null | undefined
): string | null {
  if (!fields || typeof fields !== "object") return null;
  const keys = [
    "technicianName",
    "engineer_name",
    "engineerName",
    "technician_name",
    "performedBy",
  ];
  for (const key of keys) {
    const entry = fields[key];
    if (entry == null) continue;
    if (typeof entry === "string" && entry.trim()) return entry.trim();
    if (typeof entry === "object" && entry !== null) {
      const value = (entry as { value?: unknown }).value;
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  return null;
}

/**
 * Match an extracted name to a user. Prefers role=technician on ties.
 * Requires exact normalized full-name match (no partial substring) to avoid
 * mis-attribution.
 */
export function resolveTechnicianIdFromName(
  extractedName: string | null | undefined,
  candidates: TechnicianCandidate[]
): number | null {
  if (!extractedName?.trim() || candidates.length === 0) return null;
  const target = normalizePersonName(extractedName);
  if (target.length < 2) return null;

  const matches = candidates.filter(c => {
    const name = c.name ? normalizePersonName(c.name) : "";
    if (name && name === target) return true;
    // Email local-part only when it looks like a full name (contains space in display name path skipped)
    const emailLocal = c.email?.split("@")[0]?.replace(/[._]/g, " ");
    if (emailLocal && normalizePersonName(emailLocal) === target) return true;
    return false;
  });

  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0].id;

  const techs = matches.filter(m => m.role === "technician");
  if (techs.length === 1) return techs[0].id;
  // Ambiguous — do not guess
  return null;
}
