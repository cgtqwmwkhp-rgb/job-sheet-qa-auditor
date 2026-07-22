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
  /**
   * PX-067/090: "attribution" marks synthetic OCR-derived technician
   * accounts (created via `ensureAttributionTechnicianUser`), not real
   * roster members. Callers that have this signal should pass it through
   * so attribution-gap findings can tell a genuinely empty roster apart
   * from a roster that is only phantom accounts.
   */
  loginMethod?: string | null;
}

/** True when every candidate is a synthetic OCR-attribution phantom (or the list is empty). */
export function isPhantomOnlyRoster(
  candidates: TechnicianCandidate[]
): boolean {
  if (candidates.length === 0) return true;
  return candidates.every(c => c.loginMethod === "attribution");
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

// Allow QGP "Last, F" commas inside the capture (cleaned later).
const NAME_CAPTURE = "([A-Za-z][A-Za-z0-9._' ,-]{1,80})";

const TEXT_NAME_PATTERNS: RegExp[] = [
  // Prefer username.lastname immediately after Technican/Technician (flat OCR).
  /\btechni[cs]an\s+([A-Za-z][A-Za-z0-9]*\.[A-Za-z][A-Za-z0-9]*)\b/i,
  // Multiline: Technican\nName:\n brandon.Towse
  new RegExp(
    `\\btechni[cs]an\\s*(?:\\r?\\n\\s*)?name\\s*[:-]?\\s*(?:\\r?\\n\\s*)*${NAME_CAPTURE}`,
    "i"
  ),
  new RegExp(`techni[cs]an\\s*name\\s*[:-]\\s*${NAME_CAPTURE}`, "i"),
  new RegExp(`technician\\s*name\\s*[:-]\\s*${NAME_CAPTURE}`, "i"),
  new RegExp(`engineer\\s*name\\s*[:-]\\s*${NAME_CAPTURE}`, "i"),
  new RegExp(`\\bengineer\\s*[:-]\\s*${NAME_CAPTURE}`, "i"),
  new RegExp(`\\btech(?:nician)?\\s*[:-]\\s*${NAME_CAPTURE}`, "i"),
  new RegExp(`performed\\s*by\\s*[:-]\\s*${NAME_CAPTURE}`, "i"),
];

const REJECT_NAME_TOKENS =
  /^(present|absent|signed|yes|no|name|signature|sign|off|technician|technican|engineer)$/i;

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
    // Drop trailing junk after common delimiters — but keep "Towse, B"
    // (QGP roster Last, Initial) intact.
    let cleaned = raw.replace(/\s{2,}.*$/, "").trim();
    const lastInitialKeep = cleaned.match(
      /^(.+?,\s*[A-Za-z]\.?)\s*(?:[;|].*)?$/
    );
    if (lastInitialKeep) {
      cleaned = lastInitialKeep[1].trim();
    } else {
      cleaned = cleaned.replace(/[,;|].*$/, "").trim();
    }
    if (cleaned.length >= 2 && /[A-Za-z]/.test(cleaned)) {
      if (REJECT_NAME_TOKENS.test(cleaned)) continue;
      // Flat OCR: "brandon.Towse Signature: Name:" — keep username only.
      const username = cleaned.match(
        /^([A-Za-z][A-Za-z0-9]*\.[A-Za-z][A-Za-z0-9]*)\b/
      )?.[1];
      const candidate =
        username || cleaned.replace(/\s+signature\b.*$/i, "").trim();
      if (REJECT_NAME_TOKENS.test(candidate)) continue;
      // Preserve QGP "Last, F" — letterhead scrub collapses commas to spaces.
      if (
        /^[A-Za-z][A-Za-z0-9.' -]*,\s*[A-Za-z]\.?$/.test(candidate) &&
        !isLetterheadNoise(candidate)
      ) {
        return candidate.replace(/\.$/, "");
      }
      const scrubbed = stripLetterheadNoise(candidate);
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

export interface PersonNameParts {
  tokens: string[];
  surname: string | null;
  given: string[];
  /** Single-letter initial when roster/OCR only exposes a first initial. */
  initial: string | null;
}

/**
 * Parse QGP "Last, F" / OCR "first.last" / "First Last" / "F. Last" into parts.
 */
export function parsePersonNameParts(raw: string): PersonNameParts {
  const trimmed = raw.trim();
  const comma = trimmed.match(/^(.+?),\s*([A-Za-z][A-Za-z.'-]*)$/);
  if (comma) {
    const surnameCanon = canonicalizePersonName(comma[1]);
    const givenCanon = canonicalizePersonName(comma[2].replace(/\.+$/g, ""));
    const surnameToks = tokens(surnameCanon);
    const given = tokens(givenCanon);
    const surname = surnameToks[surnameToks.length - 1] ?? null;
    const initial =
      given[0] && given[0].length === 1 ? given[0] : (given[0]?.[0] ?? null);
    return {
      tokens: [...given, ...surnameToks],
      surname,
      given,
      initial,
    };
  }

  const canon = canonicalizePersonName(trimmed);
  const toks = tokens(canon);
  if (toks.length >= 2) {
    const surname = toks[toks.length - 1]!;
    const given = toks.slice(0, -1);
    const initial =
      given[0] && given[0].length === 1 ? given[0] : (given[0]?.[0] ?? null);
    return { tokens: toks, surname, given, initial };
  }
  return {
    tokens: toks,
    surname: toks[0] ?? null,
    given: [],
    initial: null,
  };
}

function givenInitialCompatible(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length === 1 && b.startsWith(a)) return true;
  if (b.length === 1 && a.startsWith(b)) return true;
  return false;
}

/** True when surname matches and given name / initial is compatible. */
export function isInitialSurnameCompatible(
  extracted: PersonNameParts,
  candidate: PersonNameParts
): boolean {
  if (!extracted.surname || !candidate.surname) return false;
  if (extracted.surname.length < 3 || candidate.surname.length < 3) {
    return false;
  }
  if (extracted.surname !== candidate.surname) return false;

  if (extracted.given[0] && candidate.given[0]) {
    if (givenInitialCompatible(extracted.given[0], candidate.given[0])) {
      return true;
    }
  }
  if (
    extracted.initial &&
    candidate.initial &&
    extracted.initial === candidate.initial
  ) {
    return true;
  }
  if (extracted.initial && candidate.given[0]?.startsWith(extracted.initial)) {
    return true;
  }
  if (candidate.initial && extracted.given[0]?.startsWith(candidate.initial)) {
    return true;
  }
  return false;
}

function candidateKeys(c: TechnicianCandidate): string[] {
  const keys: string[] = [];
  if (c.name?.trim()) {
    keys.push(canonicalizePersonName(c.name));
    const parts = parsePersonNameParts(c.name);
    if (parts.surname && parts.initial) {
      keys.push(`${parts.initial} ${parts.surname}`);
      keys.push(`${parts.surname} ${parts.initial}`);
    }
    if (parts.surname && parts.given[0] && parts.given[0].length > 1) {
      keys.push(`${parts.given[0]} ${parts.surname}`);
    }
  }
  if (c.email?.trim()) {
    const local = c.email.split("@")[0] ?? "";
    if (local) keys.push(canonicalizePersonName(local));
  }
  return Array.from(new Set(keys.filter(Boolean)));
}

function isRealRosterCandidate(c: TechnicianCandidate): boolean {
  return c.loginMethod !== "attribution";
}

function resolveTechnicianMatchAgainst(
  extractedName: string,
  candidates: TechnicianCandidate[]
): NameMatchResult {
  const target = canonicalizePersonName(extractedName);
  if (target.length < 2 || candidates.length === 0) {
    return { technicianId: null, confidence: "none", matchedOn: null };
  }
  const targetTokens = tokens(target);
  const extractedParts = parsePersonNameParts(extractedName);

  type Hit = {
    id: number;
    confidence: MatchConfidence;
    matchedOn: string;
    role?: string;
    real: boolean;
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
          real: isRealRosterCandidate(c),
        });
        continue;
      }
      if (sameTokenSet(key, target)) {
        hits.push({
          id: c.id,
          confidence: "strong",
          matchedOn: key,
          role: c.role,
          real: isRealRosterCandidate(c),
        });
      }
    }
  }

  // Smart: unique surname + compatible given/initial (Towse, B ↔ brandon.Towse)
  if (hits.length === 0 && extractedParts.surname) {
    const initialHits = candidates.filter(c => {
      if (!c.name?.trim()) return false;
      return isInitialSurnameCompatible(
        extractedParts,
        parsePersonNameParts(c.name)
      );
    });
    if (initialHits.length === 1) {
      hits.push({
        id: initialHits[0]!.id,
        confidence: "strong",
        matchedOn: `initial+surname:${extractedParts.initial ?? "?"} ${extractedParts.surname}`,
        role: initialHits[0]!.role,
        real: isRealRosterCandidate(initialHits[0]!),
      });
    } else if (initialHits.length > 1) {
      const realOnly = initialHits.filter(isRealRosterCandidate);
      if (realOnly.length === 1) {
        hits.push({
          id: realOnly[0]!.id,
          confidence: "strong",
          matchedOn: `initial+surname:${extractedParts.initial ?? "?"} ${extractedParts.surname}`,
          role: realOnly[0]!.role,
          real: true,
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
      const uniquePool =
        surnameHits.length > 1
          ? surnameHits.filter(isRealRosterCandidate)
          : surnameHits;
      if (uniquePool.length === 1) {
        hits.push({
          id: uniquePool[0]!.id,
          confidence: "probable",
          matchedOn: `surname:${surname}`,
          role: uniquePool[0]!.role,
          real: isRealRosterCandidate(uniquePool[0]!),
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
        if (kt.includes(first) && kt.includes(last)) return true;
        // Initial-compatible first token (b ↔ brandon)
        if (kt.includes(last) && first.length === 1) {
          return kt.some(t => t.startsWith(first) && t !== last);
        }
        if (
          kt.includes(last) &&
          kt.some(t => t.length === 1 && first.startsWith(t))
        ) {
          return true;
        }
        return false;
      })
    );
    const uniquePool =
      pairHits.length > 1 ? pairHits.filter(isRealRosterCandidate) : pairHits;
    if (uniquePool.length === 1) {
      hits.push({
        id: uniquePool[0]!.id,
        confidence: "strong",
        matchedOn: `${first} ${last}`,
        role: uniquePool[0]!.role,
        real: isRealRosterCandidate(uniquePool[0]!),
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
  hits.sort((a, b) => {
    const conf = rank[b.confidence] - rank[a.confidence];
    if (conf !== 0) return conf;
    if (a.real !== b.real) return a.real ? -1 : 1;
    if ((a.role === "technician") !== (b.role === "technician")) {
      return a.role === "technician" ? -1 : 1;
    }
    return 0;
  });
  const bestRank = rank[hits[0]!.confidence];
  let top = hits.filter(h => rank[h.confidence] === bestRank);
  const realTop = top.filter(h => h.real);
  if (realTop.length > 0) top = realTop;
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
 * Match an extracted name to a user with graduated confidence.
 * Prefers real roster (non-attribution) before phantoms, then role=technician.
 * Smart-matches QGP "Last, F" ↔ OCR "first.last" / "First Last".
 */
export function resolveTechnicianMatch(
  extractedName: string | null | undefined,
  candidates: TechnicianCandidate[]
): NameMatchResult {
  if (!extractedName?.trim() || candidates.length === 0) {
    return { technicianId: null, confidence: "none", matchedOn: null };
  }
  const real = candidates.filter(isRealRosterCandidate);
  if (real.length > 0) {
    const realMatch = resolveTechnicianMatchAgainst(extractedName, real);
    if (realMatch.technicianId != null) return realMatch;
  }
  return resolveTechnicianMatchAgainst(extractedName, candidates);
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
