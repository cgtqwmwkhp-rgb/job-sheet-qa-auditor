/**
 * Post-judgment finding hygiene (no new gold templates).
 *
 * Suppresses MISSING_FIELD when ensemble already extracted the field,
 * caps MISSING_FIELD storms, demotes nonsense signature/asset conflicts,
 * and drops mileage-as-serial snippets.
 *
 * Feature flag: FEATURE_FINDING_HYGIENE
 * - unset / "true" → enabled (default on)
 * - "false" / "0" → disabled
 */

import type { Finding } from "../analyzer";

export const FEATURE_FLAG = "FEATURE_FINDING_HYGIENE";
export const MAX_MISSING_FIELD_FINDINGS = 5;

export function isFindingHygieneEnabled(): boolean {
  const raw = process.env[FEATURE_FLAG];
  if (raw === undefined || raw === "") return true;
  return raw !== "false" && raw !== "0";
}

export interface PreExtractedField {
  value: string;
  confidence: number;
  pageNumber: number;
}

export interface FindingHygieneOptions {
  preExtractedFields?: Record<string, PreExtractedField>;
  /** Default 70 — matches llmConfidenceThreshold */
  confidenceThreshold?: number;
  maxMissingField?: number;
}

const ASSET_ID_RE =
  /^[A-Z]{2}\d{2}[A-Z]{3}(_[A-Z0-9]+)?$|^[A-Z0-9]+_TL$|^[A-Z0-9]+_FL$/i;
const MILEAGE_NOISE_RE = /mileage|odometer|\bhours\b|km\/h|odometer/i;
const SIGNATURE_FIELD_RE = /signature/i;

function isAssetToken(value: string): boolean {
  return ASSET_ID_RE.test(value.trim());
}

function isPresentAbsent(value: string): boolean {
  return /^(present|absent)$/i.test(value.trim());
}

function isNonsenseSignatureConflict(finding: Finding): boolean {
  if (finding.reasonCode !== "CONFLICT") return false;
  if (!SIGNATURE_FIELD_RE.test(finding.fieldName)) return false;
  const parts = (finding.normalisedSnippet || finding.rawSnippet || "")
    .split("|")
    .map(s => s.replace(/^Conflicting values:\s*/i, "").trim())
    .filter(Boolean);
  if (parts.length < 2) {
    // Also parse "Present | BN21ACO_TL"
    const raw = finding.normalisedSnippet || finding.rawSnippet || "";
    const split = raw
      .split("|")
      .map(s => s.trim())
      .filter(Boolean);
    if (split.length >= 2) {
      const hasPresence = split.some(isPresentAbsent);
      const hasAsset = split.some(isAssetToken);
      return hasPresence && hasAsset;
    }
    return false;
  }
  const hasPresence = parts.some(isPresentAbsent);
  const hasAsset = parts.some(isAssetToken);
  return hasPresence && hasAsset;
}

function isMileageAsSerialSnippet(finding: Finding): boolean {
  if (!/serial|asset/i.test(finding.fieldName)) return false;
  const snippet = `${finding.rawSnippet} ${finding.normalisedSnippet}`;
  return MILEAGE_NOISE_RE.test(snippet);
}

/**
 * Apply finding hygiene policies. Pure function — does not mutate input.
 */
export function applyFindingHygiene(
  findings: Finding[],
  options: FindingHygieneOptions = {}
): Finding[] {
  if (!isFindingHygieneEnabled()) {
    return findings;
  }

  const threshold = options.confidenceThreshold ?? 70;
  const maxMissing = options.maxMissingField ?? MAX_MISSING_FIELD_FINDINGS;
  const pre = options.preExtractedFields ?? {};

  let working = findings.filter(f => {
    // Suppress MISSING_FIELD when ensemble already has a confident value
    if (f.reasonCode === "MISSING_FIELD") {
      const hint = pre[f.fieldName];
      if (hint && hint.value && hint.confidence >= threshold) {
        return false;
      }
    }
    // Drop mileage/odometer noise on serial/asset fields
    if (isMileageAsSerialSnippet(f)) {
      return false;
    }
    return true;
  });

  // Downgrade Present|assetId signature conflicts → LOW_CONFIDENCE or drop
  working = working.map(f => {
    if (!isNonsenseSignatureConflict(f)) return f;
    return {
      ...f,
      reasonCode: "LOW_CONFIDENCE" as const,
      severity: "S3" as const,
      normalisedSnippet: "Present",
      whyItMatters:
        "Signature presence was confused with an adjacent asset ID; treated as low-confidence presence check.",
      suggestedFix:
        "Confirm signature presence on the document; ignore asset ID bleed.",
    };
  });

  // Dedupe (fieldName, reasonCode) — keep higher confidence / richer snippet
  const deduped = new Map<string, Finding>();
  for (const f of working) {
    const key = `${f.fieldName}::${f.reasonCode}`;
    const existing = deduped.get(key);
    if (!existing) {
      deduped.set(key, f);
      continue;
    }
    const existingScore =
      existing.confidence + (existing.rawSnippet?.length ?? 0) / 1000;
    const nextScore = f.confidence + (f.rawSnippet?.length ?? 0) / 1000;
    if (nextScore > existingScore) {
      deduped.set(key, f);
    }
  }
  working = Array.from(deduped.values());

  // Cap MISSING_FIELD storm
  const missing = working.filter(f => f.reasonCode === "MISSING_FIELD");
  if (missing.length > maxMissing) {
    const keep = missing.slice(0, maxMissing);
    const overflow = missing.slice(maxMissing);
    const nonMissing = working.filter(f => f.reasonCode !== "MISSING_FIELD");
    const collapsed: Finding = {
      ruleId: "SYSTEM",
      fieldName: "Multiple Fields",
      severity: "S2",
      reasonCode: "LOW_CONFIDENCE",
      rawSnippet: overflow.map(f => f.fieldName).join(", "),
      normalisedSnippet: `${overflow.length} additional missing-field findings collapsed`,
      confidence: 0,
      pageNumber: 1,
      whyItMatters:
        "Too many MISSING_FIELD findings for reliable auto-judgment without a form-specific gold template. Collapsed for reviewability.",
      suggestedFix:
        "Review the document against the correct template family, or complete manual field checks.",
    };
    working = [...nonMissing, ...keep, collapsed];
  }

  return working;
}
