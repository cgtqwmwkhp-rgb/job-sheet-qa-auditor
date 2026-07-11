/**
 * Tyre compliance checks for PlantExpand trailer / moveable-plant checklists.
 *
 * Tread depth:
 *   PlantExpand General Trailer checklist minimum allowable tread = 2mm.
 *   Any recorded numeric depth < 2.0 mm → S1 CONFLICT/OUT_OF_POLICY.
 *
 * PSI / inflation (size-specific):
 *   A lookup table maps common C-rated trailer sizes to acceptable cold-
 *   inflation PSI bands derived from manufacturer datasheets (Wanda, Kenda,
 *   GT Savero, Trident Towing) and the Westwood Trailers pressure chart:
 *
 *     195/50R13C  → 90–95 PSI  (6.5 bar max; Wanda WR068, ETD)
 *     155/70R12C  → 90–95 PSI  (6.2–6.5 bar; Wanda WR068, Kenda, ETD)
 *     185/70R13C  → 83–87 PSI  (6.0 bar max; Trident Towing, Kenda KR103)
 *     195/55R10C  → 87–91 PSI  (6.25 bar max; Wanda WR301/068)
 *
 *   Recorded PSI outside the band for a matched size → S1 OUT_OF_POLICY.
 *   Unknown / unconfigured size → S3 informational, PSI noted but no fail.
 *
 * DOT age:
 *   PlantExpand checklist states plant tyres must not exceed 8 years.
 *   DOT date codes (4-digit WWYY) are parsed from OCR text; if the
 *   calculated age exceeds 8 years → S1 OUT_OF_POLICY.
 *   If no DOT data is present, the check is skipped (no false fail).
 *
 * Rules:
 *   TYRE-C010  Tread depth  (Major)
 *   TYRE-C020  PSI band     (Major)
 *   TYRE-C030  DOT age      (Major)
 */

import type { Finding } from "../analyzer";

export const TYRE_RULE_PREFIX = "TYRE-C";

const MIN_TREAD_MM = 2.0;
const MAX_DOT_AGE_YEARS = 8;

const KNOWN_SIZE_PSI: Record<string, { min: number; max: number }> = {
  "195/50R13C": { min: 90, max: 95 },
  "195/50 R13C": { min: 90, max: 95 },
  "155/70R12C": { min: 90, max: 95 },
  "155/70 R12C": { min: 90, max: 95 },
  "185/70R13C": { min: 83, max: 87 },
  "185/70 R13C": { min: 83, max: 87 },
  "195/55R10C": { min: 87, max: 91 },
  "195/55 R10C": { min: 87, max: 91 },
};

function normaliseTyreSize(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().toUpperCase();
}

// Positions extracted from OCR lines (OSF, NSF, OSR, NSR, 3rd-axle variants)
const TREAD_FIELD_RE =
  /\b(OSF|NSF|OSR|NSR|OS\s*3rd|NS\s*3rd|3rd\s*(?:axle\s*)?(?:OS|NS))\s*(?:Tyre\s*)?Tread\s*(?:Depth)?\s*[:-]?\s*(\d+(?:\.\d+)?)\s*mm/gi;

const SIZE_RE =
  /(?:Tyre\s*)?Size\s*[:-]?\s*([\d]{2,3}\s*\/\s*\d{2,3}\s*R?\s*\d{2,3}\s*C?)\b/i;

const PSI_RE =
  /(?:Tyre\s*)?(?:Inflation|PSI|Pressure)\s*[:-]?\s*(\d+(?:\.\d+)?)\s*(?:PSI|psi)?/i;

// DOT date code: 4-digit WWYY (week 01-52, year 00-99). Matches patterns like
// "DOT 2315", "DOT: 2315", "DOT code 2315", "DOT XXXX XXXX 2315"
const DOT_CODE_RE = /\bDOT\b[\s\S]{0,40}?\b(\d{2})([01]\d|[2-9]\d)\s*$/gim;

// More permissive single-match: captures last 4 digits on a DOT line
const DOT_LINE_RE = /\bDOT\b[^]*?(\d{2})(\d{2})\s*(?:$|\n)/im;

// Explicit age statements: "Tyre Age: 9 years" or "Age of tyre: 10yrs"
const DOT_AGE_EXPLICIT_RE =
  /(?:Tyre|DOT)\s*Age\s*[:-]?\s*(\d+)\s*(?:years?|yrs?)/i;

export interface TyreReading {
  position: string;
  depthMm: number;
}

export interface DotAgeResult {
  week: number;
  year: number;
  ageYears: number;
}

export interface TyreComplianceResult {
  findings: Finding[];
  readings: TyreReading[];
  tyreSize: string | null;
  psiValue: number | null;
  dotAge: DotAgeResult | null;
  summary: string;
}

function parseTreadReadings(text: string): TyreReading[] {
  const readings: TyreReading[] = [];
  let match: RegExpExecArray | null;
  const re = new RegExp(TREAD_FIELD_RE.source, TREAD_FIELD_RE.flags);
  while ((match = re.exec(text)) !== null) {
    const position = match[1].replace(/\s+/g, " ").trim().toUpperCase();
    const depthMm = parseFloat(match[2]);
    if (!isNaN(depthMm)) {
      readings.push({ position, depthMm });
    }
  }
  return readings;
}

function parseTyreSize(text: string): string | null {
  const m = text.match(SIZE_RE);
  if (!m) return null;
  return normaliseTyreSize(m[1]);
}

function parsePsi(text: string): number | null {
  const m = text.match(PSI_RE);
  if (!m) return null;
  const val = parseFloat(m[1]);
  return isNaN(val) ? null : val;
}

function parseDotAge(
  text: string,
  now: Date = new Date()
): DotAgeResult | null {
  // Try explicit age statement first
  const explicitMatch = text.match(DOT_AGE_EXPLICIT_RE);
  if (explicitMatch) {
    const ageYears = parseInt(explicitMatch[1], 10);
    if (!isNaN(ageYears) && ageYears >= 0 && ageYears < 100) {
      return { week: 0, year: 0, ageYears };
    }
  }

  // Try DOT code extraction (WWYY format)
  const lineMatch = text.match(DOT_LINE_RE);
  if (lineMatch) {
    const week = parseInt(lineMatch[1], 10);
    const yearShort = parseInt(lineMatch[2], 10);
    if (week >= 1 && week <= 53) {
      const fullYear =
        yearShort <= now.getFullYear() % 100
          ? 2000 + yearShort
          : 1900 + yearShort;
      const mfgDate = new Date(fullYear, 0, 1 + (week - 1) * 7);
      const ageMs = now.getTime() - mfgDate.getTime();
      const ageYears = ageMs / (365.25 * 24 * 60 * 60 * 1000);
      if (ageYears >= 0) {
        return {
          week,
          year: fullYear,
          ageYears: Math.round(ageYears * 10) / 10,
        };
      }
    }
  }

  return null;
}

function lookupPsiBand(
  size: string | null
): { min: number; max: number } | null {
  if (!size) return null;
  const norm = normaliseTyreSize(size);
  for (const [key, band] of Object.entries(KNOWN_SIZE_PSI)) {
    if (normaliseTyreSize(key) === norm) return band;
  }
  return null;
}

export function evaluateTyreCompliance(
  text: string,
  now?: Date
): TyreComplianceResult {
  const readings = parseTreadReadings(text);
  const tyreSize = parseTyreSize(text);
  const psiValue = parsePsi(text);
  const dotAge = parseDotAge(text, now);
  const findings: Finding[] = [];

  // --- Tread depth ---
  if (readings.length > 0) {
    const belowMin = readings.filter(r => r.depthMm < MIN_TREAD_MM);
    if (belowMin.length > 0) {
      const snippet = belowMin
        .map(r => `${r.position}: ${r.depthMm}mm`)
        .join(", ");
      findings.push({
        ruleId: `${TYRE_RULE_PREFIX}010`,
        fieldName: "Tyre Tread Depth",
        severity: "S1",
        reasonCode: "OUT_OF_POLICY",
        rawSnippet: snippet.slice(0, 300),
        normalisedSnippet: `Tread depth below ${MIN_TREAD_MM}mm minimum on ${belowMin.length} position(s).`,
        confidence: 95,
        pageNumber: 1,
        whyItMatters:
          "PlantExpand General Trailer checklist requires minimum 2mm tread depth. " +
          "Tyres below this threshold are non-compliant and a safety concern.",
        suggestedFix:
          "Replace tyres below the 2mm minimum before the trailer returns to service.",
      });
    } else {
      const depths = readings.map(r => `${r.position}: ${r.depthMm}mm`);
      findings.push({
        ruleId: `${TYRE_RULE_PREFIX}010`,
        fieldName: "Tyre Tread Depth",
        severity: "S3",
        reasonCode: "OUT_OF_POLICY",
        rawSnippet: depths.join(", ").slice(0, 300),
        normalisedSnippet: `All ${readings.length} recorded tread depths ≥ ${MIN_TREAD_MM}mm. Passed.`,
        confidence: 95,
        pageNumber: 1,
        whyItMatters:
          "All recorded tyre tread depths meet the PlantExpand 2mm minimum.",
        suggestedFix: "No action required.",
      });
    }
  }

  // --- PSI / inflation ---
  if (psiValue !== null) {
    const band = lookupPsiBand(tyreSize);
    if (band) {
      if (psiValue < band.min || psiValue > band.max) {
        findings.push({
          ruleId: `${TYRE_RULE_PREFIX}020`,
          fieldName: "Tyre PSI",
          severity: "S1",
          reasonCode: "OUT_OF_POLICY",
          rawSnippet: `PSI: ${psiValue}, Size: ${tyreSize}`,
          normalisedSnippet:
            `Recorded PSI ${psiValue} is outside the acceptable ${band.min}–${band.max} PSI band ` +
            `for tyre size ${tyreSize}.`,
          confidence: 90,
          pageNumber: 1,
          whyItMatters:
            `Manufacturer-published max cold inflation for ${tyreSize} gives an acceptable ` +
            `range of ${band.min}–${band.max} PSI. Sources: Wanda / Kenda / Trident Towing datasheets.`,
          suggestedFix: `Adjust tyre inflation to within ${band.min}–${band.max} PSI for ${tyreSize} tyres.`,
        });
      } else {
        findings.push({
          ruleId: `${TYRE_RULE_PREFIX}020`,
          fieldName: "Tyre PSI",
          severity: "S3",
          reasonCode: "OUT_OF_POLICY",
          rawSnippet: `PSI: ${psiValue}, Size: ${tyreSize}`,
          normalisedSnippet: `Recorded PSI ${psiValue} is within the ${band.min}–${band.max} PSI band for ${tyreSize}. Passed.`,
          confidence: 90,
          pageNumber: 1,
          whyItMatters: `Tyre inflation is within the acceptable range for ${tyreSize}.`,
          suggestedFix: "No action required.",
        });
      }
    } else {
      findings.push({
        ruleId: `${TYRE_RULE_PREFIX}020`,
        fieldName: "Tyre PSI",
        severity: "S3",
        reasonCode: "OUT_OF_POLICY",
        rawSnippet: `PSI: ${psiValue}${tyreSize ? `, Size: ${tyreSize}` : ""}`,
        normalisedSnippet:
          "PSI recorded; size-specific inflation band not configured for this tyre size.",
        confidence: 60,
        pageNumber: 1,
        whyItMatters:
          "Without a known tyre size, the acceptable PSI band cannot be determined.",
        suggestedFix: "No action required — PSI value noted for reference.",
      });
    }
  }

  // --- DOT age ---
  if (dotAge !== null) {
    if (dotAge.ageYears > MAX_DOT_AGE_YEARS) {
      const ageDisplay =
        dotAge.year > 0
          ? `DOT ${String(dotAge.week).padStart(2, "0")}${String(dotAge.year % 100).padStart(2, "0")} (${dotAge.ageYears} years)`
          : `${dotAge.ageYears} years`;
      findings.push({
        ruleId: `${TYRE_RULE_PREFIX}030`,
        fieldName: "Tyre DOT Age",
        severity: "S1",
        reasonCode: "OUT_OF_POLICY",
        rawSnippet: ageDisplay,
        normalisedSnippet: `Tyre age ${dotAge.ageYears} years exceeds the ${MAX_DOT_AGE_YEARS}-year maximum.`,
        confidence: 90,
        pageNumber: 1,
        whyItMatters:
          "PlantExpand checklist requires plant tyres not to exceed 8 years of age. " +
          "Rubber degrades over time regardless of tread wear, increasing blowout risk.",
        suggestedFix:
          "Replace tyres that exceed the 8-year age limit before the trailer returns to service.",
      });
    } else {
      const ageDisplay =
        dotAge.year > 0
          ? `DOT ${String(dotAge.week).padStart(2, "0")}${String(dotAge.year % 100).padStart(2, "0")} (${dotAge.ageYears} years)`
          : `${dotAge.ageYears} years`;
      findings.push({
        ruleId: `${TYRE_RULE_PREFIX}030`,
        fieldName: "Tyre DOT Age",
        severity: "S3",
        reasonCode: "OUT_OF_POLICY",
        rawSnippet: ageDisplay,
        normalisedSnippet: `Tyre age ${dotAge.ageYears} years is within the ${MAX_DOT_AGE_YEARS}-year limit. Passed.`,
        confidence: 90,
        pageNumber: 1,
        whyItMatters: "Tyre age is within the PlantExpand 8-year maximum.",
        suggestedFix: "No action required.",
      });
    }
  }

  // --- Summary ---
  const s1Count = findings.filter(f => f.severity === "S1").length;
  const parts: string[] = [];
  if (readings.length > 0) parts.push(`${readings.length} tread readings`);
  if (psiValue !== null) parts.push(`PSI=${psiValue}`);
  if (tyreSize) parts.push(`Size=${tyreSize}`);
  if (dotAge !== null) parts.push(`DOT age=${dotAge.ageYears}yr`);
  const summary =
    s1Count > 0
      ? `Tyre compliance: ${s1Count} issue(s) found (${parts.join(", ")}).`
      : parts.length > 0
        ? `Tyre compliance passed (${parts.join(", ")}).`
        : "No tyre tread/PSI data found; tyre compliance check skipped.";

  return { findings, readings, tyreSize, psiValue, dotAge, summary };
}
