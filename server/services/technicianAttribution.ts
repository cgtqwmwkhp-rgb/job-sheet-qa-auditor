/**
 * Resolve extracted engineer / technician names onto users.id for analytics attribution.
 *
 * Handles PlantExpand OCR shapes such as "Richard.Newton" as well as
 * "Richard Newton", email locals, and unique surname fallbacks.
 */

import { isLetterheadNoise, stripLetterheadNoise } from "./letterheadNoise";

export interface TechnicianCandidate {
  id: number;
  name: string | null;
  email: string | null;
  role?: string;
}

export type MatchConfidence = "exact" | "strong" | "probable" | "none";

export interface NameMatchResult {
  technicianId: number | null;
  confidence: MatchConfidence;
  matchedOn: string | null;
}

/** Normalize for comparison: lower, strip accents, punctuation → spaces. */
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
 * Canonical person key — treats dots/underscores/hyphens as name separators
 * so "Richard.Newton" ≡ "Richard Newton" ≡ "richard_newton".
 */
export function canonicalizePersonName(raw: string): string {
  return normalizePersonName(raw.replace(/[._-]+/g, " "));
}

function tokens(canon: string): string[] {
  return canon.split(/\s+/).filter(Boolean);
}

function sameTokenSet(a: string, b: string): boolean {
  const ta = tokens(a).sort();
  const tb = tokens(b).sort();
  if (ta.length === 0 || ta.length !== tb.length) return false;
  return ta.every((t, i) => t === tb[i]);
}

function fieldValue(entry: unknown): string | null {
  if (entry == null) return null;
  if (typeof entry === "string" && entry.trim()) return entry.trim();
  if (typeof entry === "object") {
    const value = (entry as { value?: unknown }).value;
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

/**
 * Pull a display name from extractedFields (string or { value } shapes).
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
    "techName",
    "technician",
    "engineer",
  ];
  const rejectAsName = /^(yes|no|n\/a|na|true|false|present|absent|signed)$/i;
  for (const key of keys) {
    const found = fieldValue(fields[key]);
    if (found && !rejectAsName.test(found)) {
      const scrubbed = stripLetterheadNoise(found);
      if (
        scrubbed &&
        !isLetterheadNoise(scrubbed) &&
        !rejectAsName.test(scrubbed)
      )
        return scrubbed;
    }
  }
  // Case-insensitive key scan for OCR variance (never signatures / presence flags)
  for (const [key, entry] of Object.entries(fields)) {
    const k = key.toLowerCase();
    if (
      k.includes("signature") ||
      k.includes("signoff") ||
      k.includes("sign_off")
    ) {
      continue;
    }
    if (
      k.includes("technician") ||
      k.includes("engineer") ||
      k === "performedby"
    ) {
      const found = fieldValue(entry);
      if (found && !rejectAsName.test(found)) {
        const scrubbed = stripLetterheadNoise(found);
        if (
          scrubbed &&
          !isLetterheadNoise(scrubbed) &&
          !rejectAsName.test(scrubbed)
        )
          return scrubbed;
      }
    }
  }
  return null;
}

const TEXT_NAME_PATTERNS: RegExp[] = [
  /technician\s*name\s*[:-]\s*([A-Za-z][A-Za-z0-9._ -]{1,80})/i,
  /engineer\s*name\s*[:-]\s*([A-Za-z][A-Za-z0-9._ -]{1,80})/i,
  /\bengineer\s*[:-]\s*([A-Za-z][A-Za-z0-9._ -]{1,80})/i,
  /\btech(?:nician)?\s*[:-]\s*([A-Za-z][A-Za-z0-9._ -]{1,80})/i,
  /performed\s*by\s*[:-]\s*([A-Za-z][A-Za-z0-9._ -]{1,80})/i,
];

/**
 * Fallback: scrape technician/engineer name from raw OCR / extracted text.
 */
export function extractTechnicianNameFromText(
  text: string | null | undefined
): string | null {
  if (!text || typeof text !== "string") return null;
  for (const re of TEXT_NAME_PATTERNS) {
    const m = text.match(re);
    if (!m?.[1]) continue;
    const raw = m[1].trim().split(/\r?\n/)[0]!.trim();
    // Drop trailing junk after common delimiters
    const cleaned = raw
      .replace(/\s{2,}.*$/, "")
      .replace(/[,;|].*$/, "")
      .trim();
    if (cleaned.length >= 2 && /[A-Za-z]/.test(cleaned)) {
      if (/^(present|absent|signed|yes|no)$/i.test(cleaned)) continue;
      const scrubbed = stripLetterheadNoise(cleaned);
      if (scrubbed && !isLetterheadNoise(scrubbed) && scrubbed.length >= 2) {
        return scrubbed;
      }
    }
  }
  return null;
}

/**
 * Resolve name from an audit reportJson blob (fields first, then text).
 */
export function extractTechnicianNameFromReport(
  report: unknown
): string | null {
  if (!report || typeof report !== "object") return null;
  const r = report as {
    extractedFields?: Record<string, unknown>;
    extractedText?: unknown;
    summary?: unknown;
  };
  const fromFields = extractTechnicianNameFromFields(r.extractedFields);
  if (fromFields) return fromFields;
  if (typeof r.extractedText === "string") {
    const fromText = extractTechnicianNameFromText(r.extractedText);
    if (fromText) return fromText;
  }
  if (typeof r.summary === "string") {
    return extractTechnicianNameFromText(r.summary);
  }
  return null;
}

function candidateKeys(c: TechnicianCandidate): string[] {
  const keys: string[] = [];
  if (c.name?.trim()) keys.push(canonicalizePersonName(c.name));
  if (c.email?.trim()) {
    const local = c.email.split("@")[0] ?? "";
    if (local) keys.push(canonicalizePersonName(local));
  }
  return keys.filter(Boolean);
}

/**
 * Match an extracted name to a user with graduated confidence.
 * Prefers role=technician when multiple exact hits exist.
 */
export function resolveTechnicianMatch(
  extractedName: string | null | undefined,
  candidates: TechnicianCandidate[]
): NameMatchResult {
  if (!extractedName?.trim() || candidates.length === 0) {
    return { technicianId: null, confidence: "none", matchedOn: null };
  }
  const target = canonicalizePersonName(extractedName);
  if (target.length < 2) {
    return { technicianId: null, confidence: "none", matchedOn: null };
  }
  const targetTokens = tokens(target);

  type Hit = {
    id: number;
    confidence: MatchConfidence;
    matchedOn: string;
    role?: string;
  };
  const hits: Hit[] = [];

  for (const c of candidates) {
    const keys = candidateKeys(c);
    for (const key of keys) {
      if (key === target) {
        hits.push({
          id: c.id,
          confidence: "exact",
          matchedOn: key,
          role: c.role,
        });
        continue;
      }
      if (sameTokenSet(key, target)) {
        hits.push({
          id: c.id,
          confidence: "strong",
          matchedOn: key,
          role: c.role,
        });
      }
    }
  }

  // Unique surname when extracted looks like a full name (2+ tokens)
  if (hits.length === 0 && targetTokens.length >= 2) {
    const surname = targetTokens[targetTokens.length - 1]!;
    if (surname.length >= 3) {
      const surnameHits = candidates.filter(c => {
        const keys = candidateKeys(c);
        return keys.some(k => {
          const kt = tokens(k);
          return kt.length >= 1 && kt[kt.length - 1] === surname;
        });
      });
      if (surnameHits.length === 1) {
        hits.push({
          id: surnameHits[0]!.id,
          confidence: "probable",
          matchedOn: `surname:${surname}`,
          role: surnameHits[0]!.role,
        });
      }
    }
  }

  // Unique first-token + last-token pair across candidates (order flexible)
  if (hits.length === 0 && targetTokens.length >= 2) {
    const first = targetTokens[0]!;
    const last = targetTokens[targetTokens.length - 1]!;
    const pairHits = candidates.filter(c =>
      candidateKeys(c).some(k => {
        const kt = tokens(k);
        return kt.includes(first) && kt.includes(last);
      })
    );
    if (pairHits.length === 1) {
      hits.push({
        id: pairHits[0]!.id,
        confidence: "strong",
        matchedOn: `${first} ${last}`,
        role: pairHits[0]!.role,
      });
    }
  }

  if (hits.length === 0) {
    return { technicianId: null, confidence: "none", matchedOn: null };
  }

  const rank: Record<MatchConfidence, number> = {
    exact: 3,
    strong: 2,
    probable: 1,
    none: 0,
  };
  hits.sort((a, b) => rank[b.confidence] - rank[a.confidence]);
  const bestRank = rank[hits[0]!.confidence];
  const top = hits.filter(h => rank[h.confidence] === bestRank);
  const uniqueIds = Array.from(new Set(top.map(h => h.id)));
  if (uniqueIds.length === 1) {
    return {
      technicianId: uniqueIds[0]!,
      confidence: top[0]!.confidence,
      matchedOn: top[0]!.matchedOn,
    };
  }
  const techs = top.filter(h => h.role === "technician");
  const techIds = Array.from(new Set(techs.map(h => h.id)));
  if (techIds.length === 1) {
    return {
      technicianId: techIds[0]!,
      confidence: techs[0]!.confidence,
      matchedOn: techs[0]!.matchedOn,
    };
  }
  return { technicianId: null, confidence: "none", matchedOn: null };
}

/**
 * Convenience wrapper — returns technician id or null.
 */
export function resolveTechnicianIdFromName(
  extractedName: string | null | undefined,
  candidates: TechnicianCandidate[]
): number | null {
  return resolveTechnicianMatch(extractedName, candidates).technicianId;
}

export interface AttributionNameCluster {
  extractedName: string;
  displayName: string;
  sheetCount: number;
  jobSheetIds: number[];
  match: NameMatchResult;
  suggestedUserName: string | null;
}

/**
 * Cluster unattributed sheets by OCR name and attempt matches.
 */
export function buildAttributionClusters(input: {
  sheets: Array<{ id: number; extractedName: string | null }>;
  candidates: TechnicianCandidate[];
}): AttributionNameCluster[] {
  const byName = new Map<
    string,
    { displayName: string; jobSheetIds: number[] }
  >();

  for (const sheet of input.sheets) {
    const raw = sheet.extractedName?.trim();
    if (!raw) continue;
    const key = canonicalizePersonName(raw) || raw.toLowerCase();
    let entry = byName.get(key);
    if (!entry) {
      entry = { displayName: raw, jobSheetIds: [] };
      byName.set(key, entry);
    }
    entry.jobSheetIds.push(sheet.id);
  }

  const clusters: AttributionNameCluster[] = [];
  for (const [key, entry] of Array.from(byName.entries())) {
    const match = resolveTechnicianMatch(entry.displayName, input.candidates);
    const suggested =
      match.technicianId != null
        ? (input.candidates.find(c => c.id === match.technicianId)?.name ??
          null)
        : null;
    clusters.push({
      extractedName: key,
      displayName: entry.displayName,
      sheetCount: entry.jobSheetIds.length,
      jobSheetIds: entry.jobSheetIds,
      match,
      suggestedUserName: suggested,
    });
  }

  return clusters.sort((a, b) => b.sheetCount - a.sheetCount);
}

/** Pretty display: Richard.Newton → Richard Newton */
export function prettifyExtractedName(raw: string): string {
  return raw
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, c => c.toUpperCase());
}

/** Stable openId for analytics-only technician accounts created from OCR. */
export function attributionOpenIdForName(raw: string): string {
  const slug = canonicalizePersonName(raw).replace(/\s+/g, "-") || "unknown";
  return `attribution:${slug}`.slice(0, 64);
}
