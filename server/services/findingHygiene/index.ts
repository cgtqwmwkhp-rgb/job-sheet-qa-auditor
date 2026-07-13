/**
 * Post-judgment finding hygiene (no new gold templates).
 *
 * Suppresses MISSING_FIELD when ensemble already extracted the field,
 * caps MISSING_FIELD storms, demotes nonsense signature/date vs asset conflicts,
 * drops mileage-as-serial snippets, suppresses optional-template field noise,
 * and injects Present findings for VOR / asset / mileage when text evidence exists.
 *
 * Feature flag: FEATURE_FINDING_HYGIENE
 * - unset / "true" → enabled (default on)
 * - "false" / "0" → disabled
 */

import type { Finding } from "../analyzer";
import {
  isLetterheadNoise,
  scrubLetterheadConflictParts,
  scrubLetterheadFromSnippets,
  stripLetterheadNoise,
} from "../letterheadNoise";

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
  /** Document text contains a signature label/box (OCR cannot see ink). */
  signatureLabelPresent?: boolean;
  /** OCR-4 reported a signature block/region. */
  hasOcrSignature?: boolean;
  /** Full extracted text for VOR / asset / mileage Present injection. */
  documentText?: string;
  /**
   * Template fields marked required:false (canonical IDs).
   * MISSING_FIELD on these (or their aliases) is suppressed.
   */
  optionalTemplateFields?: Set<string> | string[];
  /** Optional field aliases from template (e.g. Engineer Comments → workDescription). */
  optionalFieldAliases?: string[];
}

const ASSET_ID_RE =
  /^[A-Z]{2}\d{2}[A-Z]{3}(_[A-Z0-9]+)?$|^[A-Z0-9]+_TL$|^[A-Z0-9]+_FL$/i;
const ASSET_BLEED_RE =
  /\b[A-Z]{2}\d{2}[A-Z]{3}(_[A-Z0-9]+)?\b.*make\/?model|\b[A-Z0-9]+_TL\b/i;
const MILEAGE_NOISE_RE = /mileage|odometer|\bhours\b|km\/h/i;
const SIGNATURE_FIELD_RE = /signature|engineerSignOff/i;
const DATE_FIELD_RE = /^date$|dateOfService|service.?date|job.?date/i;
const DATE_VALUE_RE =
  /^\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}$|^\d{4}[/\-.]\d{1,2}[/\-.]\d{1,2}$|^\d{4}-\d{2}-\d{2}$/;
const SIGNATURE_LABEL_RE =
  /(?:technician|engineer|customer|client)?\s*signature|signed\s*by|sign\s*off|signatory/i;
const VOR_BANNER_RE =
  /(?:this\s*)?(?:vehicle|asset)\s*(?:is\s*)?marked\s*as\s*vor|vehicle\s*off\s*road|\bVOR\b/i;
const WORK_NOTES_FIELD_RE =
  /^(workDescription|work\s*notes|engineer\s*comments|comments|work\s*performed)$/i;

const DEFAULT_OPTIONAL_ALIASES = [
  "Engineer Comments",
  "Work Notes",
  "Comments",
  "Work Performed",
  "workDescription",
];

/** True when OCR/extracted text shows a signature label/box (ink may still be invisible). */
export function hasSignatureLabelEvidence(text: string): boolean {
  return SIGNATURE_LABEL_RE.test(text);
}

/** True when document text shows a VOR / vehicle-off-road banner. */
export function hasVorBannerEvidence(text: string): boolean {
  return VOR_BANNER_RE.test(text);
}

function normalizeOptionalSet(
  value: Set<string> | string[] | undefined
): Set<string> {
  if (!value) return new Set();
  return value instanceof Set ? value : new Set(value);
}

function isOptionalTemplateMissing(
  finding: Finding,
  optionalFields: Set<string>,
  optionalAliases: string[]
): boolean {
  if (finding.reasonCode !== "MISSING_FIELD") return false;
  if (optionalFields.size === 0 && optionalAliases.length === 0) return false;

  const name = finding.fieldName.trim();
  if (optionalFields.has(name)) return true;
  if (WORK_NOTES_FIELD_RE.test(name) && optionalFields.has("workDescription")) {
    return true;
  }
  const lower = name.toLowerCase();
  if (
    optionalAliases.some(a => a.toLowerCase() === lower) &&
    (optionalFields.has("workDescription") || optionalFields.size === 0)
  ) {
    // When workDescription is optional OR aliases explicitly listed
    if (
      optionalFields.has("workDescription") ||
      WORK_NOTES_FIELD_RE.test(name)
    ) {
      return true;
    }
  }
  // Canonical optional field matched via camelCase → spaced label
  for (const field of Array.from(optionalFields)) {
    const spaced = field.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
    if (lower === spaced || lower === field.toLowerCase()) return true;
  }
  return false;
}

function splitConflictParts(finding: Finding): string[] {
  const raw = finding.normalisedSnippet || finding.rawSnippet || "";
  return raw
    .split("|")
    .map(s => s.replace(/^Conflicting values:\s*/i, "").trim())
    .filter(Boolean);
}

function isAssetToken(value: string): boolean {
  const v = value.trim();
  return ASSET_ID_RE.test(v) || ASSET_BLEED_RE.test(v);
}

function isPresentAbsent(value: string): boolean {
  return /^(present|absent)$/i.test(value.trim());
}

function isDateShaped(value: string): boolean {
  return DATE_VALUE_RE.test(value.trim());
}

function isNonsenseSignatureConflict(finding: Finding): boolean {
  if (finding.reasonCode !== "CONFLICT") return false;
  if (!SIGNATURE_FIELD_RE.test(finding.fieldName)) return false;
  const parts = splitConflictParts(finding);
  if (parts.length < 2) return false;
  return parts.some(isPresentAbsent) && parts.some(isAssetToken);
}

/** Date CONFLICT that mixes a real date with asset/Make-Model bleed. */
function isNonsenseDateAssetConflict(finding: Finding): boolean {
  if (finding.reasonCode !== "CONFLICT") return false;
  if (!DATE_FIELD_RE.test(finding.fieldName)) return false;
  const parts = splitConflictParts(finding);
  if (parts.length < 2) return false;
  return parts.some(isDateShaped) && parts.some(isAssetToken);
}

const ENGINEER_NAME_FIELD_RE = /engineer|technician/i;
const USERNAME_RE = /^[A-Za-z][A-Za-z0-9]*\.[A-Za-z][A-Za-z0-9]*$/;

/** CONFLICT where one part is a username and another is letterhead noise. */
function isNonsenseEngineerNameConflict(finding: Finding): boolean {
  if (finding.reasonCode !== "CONFLICT") return false;
  if (!ENGINEER_NAME_FIELD_RE.test(finding.fieldName)) return false;
  const parts = splitConflictParts(finding);
  if (parts.length < 2) return false;
  return (
    parts.some(p => USERNAME_RE.test(p.trim())) &&
    parts.some(p => isLetterheadNoise(p.trim()))
  );
}

/**
 * Any CONFLICT that mixes a real value with letterhead/footer chrome
 * (phone, www, Email, PlantExpand) — keep only non-letterhead parts.
 */
function isLetterheadPollutionConflict(finding: Finding): boolean {
  if (finding.reasonCode !== "CONFLICT") return false;
  const parts = splitConflictParts(finding);
  if (parts.length < 2) return false;
  const hasLetterhead = parts.some(p => isLetterheadNoise(p.trim()));
  const hasClean = parts.some(p => {
    const scrubbed = stripLetterheadNoise(p.trim());
    return Boolean(scrubbed) && !isLetterheadNoise(scrubbed!);
  });
  return hasLetterhead && hasClean;
}

function pickCleanFromLetterheadConflict(finding: Finding): string {
  const parts = splitConflictParts(finding);
  const cleaned = parts
    .map(p => stripLetterheadNoise(p.trim()))
    .filter((p): p is string => Boolean(p));
  if (cleaned.length === 0) return "";
  // Prefer username / short job digit
  const username = cleaned.find(p => USERNAME_RE.test(p));
  if (username) return username;
  const digits = cleaned.find(p => /^\d{1,6}$/.test(p));
  if (digits) return digits;
  return cleaned[0];
}

function pickUsernameFromConflict(finding: Finding): string {
  const parts = splitConflictParts(finding);
  return (
    parts.find(p => USERNAME_RE.test(p.trim()))?.trim() ??
    parts[0]?.trim() ??
    ""
  );
}

/** CONFLICT where all parts normalize to the same digit string (e.g. "87" vs "87"). */
function isNonsenseJobRefConflict(finding: Finding): boolean {
  if (finding.reasonCode !== "CONFLICT") return false;
  if (!/job|reference/i.test(finding.fieldName)) return false;
  const parts = splitConflictParts(finding);
  if (parts.length < 2) return false;
  const digitSet = new Set(
    parts.map(p => p.trim().replace(/\D/g, "")).filter(d => d.length > 0)
  );
  return digitSet.size === 1;
}

function pickDigitsFromConflict(finding: Finding): string {
  const parts = splitConflictParts(finding);
  return (
    parts.map(p => p.trim().replace(/\D/g, "")).find(d => d.length > 0) ??
    parts[0]?.trim() ??
    ""
  );
}

function isMileageAsSerialSnippet(finding: Finding): boolean {
  if (!/serial|asset/i.test(finding.fieldName)) return false;
  const snippet = `${finding.rawSnippet} ${finding.normalisedSnippet}`;
  return MILEAGE_NOISE_RE.test(snippet);
}

function pickDateFromConflict(finding: Finding): string {
  const parts = splitConflictParts(finding);
  return parts.find(isDateShaped) ?? parts[0] ?? "";
}

function isFalseAbsentSignature(
  finding: Finding,
  signatureEvidence: boolean
): boolean {
  if (!signatureEvidence || !SIGNATURE_FIELD_RE.test(finding.fieldName)) {
    return false;
  }
  if (finding.reasonCode === "MISSING_FIELD") return true;
  return /^(absent|missing|no|unsigned)$/i.test(
    (finding.normalisedSnippet || finding.rawSnippet || "").trim()
  );
}

/** Convert false Absent/MISSING signature into a recorded Present (S3) finding. */
export function toPresentSignatureFinding(finding: Finding): Finding {
  return {
    ...finding,
    severity: "S3",
    reasonCode: "LOW_CONFIDENCE",
    normalisedSnippet: "Present",
    rawSnippet: finding.rawSnippet || "Technician Signature",
    confidence: Math.max(finding.confidence || 0, 70),
    whyItMatters:
      "Signature label/box detected. Handwritten ink is usually invisible to OCR; recorded as Present — confirm ink on the document (scroll to the signature box).",
    suggestedFix:
      "Scroll to the signature section on the PDF and confirm the handwritten signature is present.",
  };
}

function buildPresentSignatureFinding(): Finding {
  return {
    ruleId: "SYSTEM",
    fieldName: "customerSignature",
    severity: "S3",
    reasonCode: "LOW_CONFIDENCE",
    rawSnippet: "Technician Signature",
    normalisedSnippet: "Present",
    confidence: 75,
    pageNumber: 1,
    boundingBox: {
      x: 6,
      y: 88,
      width: 88,
      height: 10,
    },
    whyItMatters:
      "Signature label/box detected. Handwritten ink is usually invisible to OCR; recorded as Present — confirm ink on the document (scroll to the signature box).",
    suggestedFix:
      "Scroll to the signature section on the PDF and confirm the handwritten signature is present.",
  };
}

function buildPresentVorFinding(): Finding {
  return {
    ruleId: "SYSTEM",
    fieldName: "vorStatus",
    severity: "S3",
    reasonCode: "LOW_CONFIDENCE",
    rawSnippet: "This Vehicle is marked as VOR",
    normalisedSnippet: "Present",
    confidence: 85,
    pageNumber: 1,
    boundingBox: {
      x: 18,
      y: 1.5,
      width: 64,
      height: 7,
    },
    whyItMatters:
      "VOR banner detected on the Job Summary. Recorded as Present — confirm operational status.",
    suggestedFix:
      "Confirm the vehicle is VOR and that safe-to-use is not claimed.",
  };
}

/** Max plausible make/model length — longer values are field-bleed from flat OCR. */
export const MAX_MAKE_MODEL_LENGTH = 80;

/** Min length after sanitization (reject label fragments). */
export const MIN_MAKE_MODEL_LENGTH = 2;

/**
 * Job-summary labels that commonly follow Make/Model on a single flattened OCR line.
 * Used to truncate captures before the next field (fail-soft ensemble fallback).
 */
const MAKE_MODEL_BOUNDARY_LABELS =
  "Customer|Serial(?:\\s*(?:No|Number|#))?|Site(?:\\s+Address)?(?:\\s*/\\s*Contact)?|Miles(?:\\s*/\\s*Hours)?|(?:Asset\\s*)?(?:Mileage|Hours)(?:\\s*/\\s*(?:Hours|Mileage))?|Completion(?:\\s+Details)?|Job\\s*(?:ID|No)|Compliance(?:\\s+Type|\\s+Title)?|Technician|Engineer|Registration|Reg(?:istration)?(?:\\s+No)?|VIN|S\\/N|Asset\\s*(?:No|Number|#)|Next\\s+Service|Safe\\s+(?:to\\s+)?Use|All\\s+Works|Return\\s+Visit|Completed\\?|Asset\\s+Safe";

const MAKE_MODEL_INLINE_BOUNDARY_RE = new RegExp(
  `\\s+(?=(?:${MAKE_MODEL_BOUNDARY_LABELS})\\b\\s*[:.?])`,
  "i"
);

const MAKE_MODEL_FIELD_LABEL_IN_VALUE_RE = new RegExp(
  `\\b(?:${MAKE_MODEL_BOUNDARY_LABELS})\\b\\s*[:.]`,
  "i"
);

const MAKE_MODEL_EMPTY_RE = /^(null|n\/a|none|nil|-|—|–|\.)$/i;

/**
 * Truncate make/model values that include subsequent job-summary fields (flat OCR bleed).
 */
export function sanitizeMakeModelValue(
  raw: string | undefined | null
): string | undefined {
  if (!raw) return undefined;

  let value = raw.trim().replace(/^Make\s*[/&]?\s*Model\s*[:.]?\s*/i, "").trim();
  if (!value) return undefined;

  const inlineBoundary = value.search(MAKE_MODEL_INLINE_BOUNDARY_RE);
  if (inlineBoundary > 0) {
    value = value.slice(0, inlineBoundary).trim();
  } else if (MAKE_MODEL_FIELD_LABEL_IN_VALUE_RE.test(value)) {
    const labelMatch = value.match(MAKE_MODEL_FIELD_LABEL_IN_VALUE_RE);
    if (labelMatch?.index != null && labelMatch.index > 0) {
      value = value.slice(0, labelMatch.index).trim();
    }
  }

  // First line only when OCR still has hard breaks inside the captured span.
  const firstLine = value.split(/[\r\n]+/)[0]?.trim();
  value = firstLine || value;

  value = value.replace(/\s{2,}/g, " ").trim();
  if (
    !value ||
    value.length < MIN_MAKE_MODEL_LENGTH ||
    value.length > MAX_MAKE_MODEL_LENGTH ||
    MAKE_MODEL_EMPTY_RE.test(value)
  ) {
    return undefined;
  }

  return value;
}

/**
 * Extract make/model from document text with field-boundary guards (ensemble fail-soft path).
 */
export function extractMakeModelFromText(text: string): string | undefined {
  const patterns = [
    /Make\s*[/&]?\s*Model\s*[:.]?\s*(.+)/i,
    /Make\s*[:.]?\s*(.+?)(?=\s+Model\s*[:.])/i,
    /Equipment\s*[:.]?\s*(.+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const sanitized = sanitizeMakeModelValue(match[1]);
      if (sanitized) return sanitized;
    }
  }

  return undefined;
}

function buildPresentFieldFinding(
  fieldName: string,
  label: string,
  value: string,
  confidence: number
): Finding {
  return {
    ruleId: "SYSTEM",
    fieldName,
    severity: "S3",
    reasonCode: "LOW_CONFIDENCE",
    rawSnippet: `${label}: ${value}`,
    normalisedSnippet: value,
    confidence,
    pageNumber: 1,
    whyItMatters: `${label} extracted from the document text.`,
    suggestedFix: `Confirm ${label} on the PDF.`,
  };
}

/**
 * Inject Present/value findings for VOR banner and common Job Summary fields
 * when evidence exists in text or pre-extraction.
 */
export function injectPresentFieldFindings(
  findings: Finding[],
  text: string,
  preExtracted: Record<string, PreExtractedField> = {}
): Finding[] {
  const out = [...findings];
  const hasField = (name: string) =>
    out.some(
      f =>
        f.fieldName === name || f.fieldName.toLowerCase() === name.toLowerCase()
    );

  if (hasVorBannerEvidence(text) && !hasField("vorStatus")) {
    out.push(buildPresentVorFinding());
  }

  const assetMatch = text.match(
    /Asset\s*(?:No\.?|Number|#)\b\s*[:.|]?\s*([A-Z0-9][A-Z0-9 _-]{2,})/i
  );
  const nextLineMatch = text.match(
    /Asset\s*(?:No\.?|Number|#)\b\s*[:.|]?\s*[\r\n]+\s*([A-Z0-9][A-Z0-9 _-]{2,})/i
  );
  const rawAsset = (
    preExtracted.assetId?.value ||
    assetMatch?.[1] ||
    nextLineMatch?.[1] ||
    ""
  )
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
  const assetValue =
    rawAsset &&
    /[A-Z]/.test(rawAsset) &&
    /\d/.test(rawAsset) &&
    !/^(DETAILS?|NUMBER|NO|ID|MAKE|MODEL|SERIAL|CUSTOMER)$/i.test(rawAsset)
      ? rawAsset
      : undefined;
  if (assetValue && !hasField("assetId") && !hasField("serialNumber")) {
    out.push(
      buildPresentFieldFinding(
        "assetId",
        "Asset Number",
        assetValue,
        preExtracted.assetId?.confidence ?? 80
      )
    );
  }

  const makeValue =
    sanitizeMakeModelValue(preExtracted.makeModel?.value) ??
    extractMakeModelFromText(text);
  if (makeValue && !hasField("makeModel")) {
    out.push(
      buildPresentFieldFinding(
        "makeModel",
        "Make/Model",
        makeValue,
        preExtracted.makeModel?.confidence ?? 75
      )
    );
  }

  const mileageMatch = text.match(
    /(?:Asset\s*)?(?:Mileage|Hours)(?:\s*[/&]\s*(?:Hours|Mileage))?\s*[:.]?\s*(\d[\d,]*)/i
  );
  const mileageValue =
    preExtracted.mileageHours?.value || mileageMatch?.[1]?.replace(/,/g, "");
  if (mileageValue && !hasField("mileageHours")) {
    out.push(
      buildPresentFieldFinding(
        "mileageHours",
        "Mileage/Hours",
        String(mileageValue),
        preExtracted.mileageHours?.confidence ?? 75
      )
    );
  }

  return out;
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
  const optionalFields = normalizeOptionalSet(options.optionalTemplateFields);
  const optionalAliases =
    options.optionalFieldAliases ??
    (optionalFields.has("workDescription") ? DEFAULT_OPTIONAL_ALIASES : []);
  const signatureEvidence =
    !!options.signatureLabelPresent ||
    !!options.hasOcrSignature ||
    pre.customerSignature?.value === "Present" ||
    pre.technicianSignature?.value === "Present" ||
    pre.engineerSignOff?.value === "Present";

  let working = findings.filter(f => {
    // Suppress MISSING_FIELD for optional template fields (e.g. Engineer Comments)
    if (isOptionalTemplateMissing(f, optionalFields, optionalAliases)) {
      return false;
    }
    // Suppress MISSING_FIELD when ensemble already has a confident value
    if (f.reasonCode === "MISSING_FIELD") {
      const hint = pre[f.fieldName] ?? pre.workDescription;
      if (
        hint &&
        hint.value &&
        hint.confidence >= threshold &&
        (f.fieldName === "workDescription" ||
          WORK_NOTES_FIELD_RE.test(f.fieldName) ||
          pre[f.fieldName])
      ) {
        if (pre[f.fieldName] || WORK_NOTES_FIELD_RE.test(f.fieldName)) {
          return false;
        }
      }
      if (pre[f.fieldName]?.value && pre[f.fieldName].confidence >= threshold) {
        return false;
      }
      // Handwritten ink is invisible to OCR — don't FAIL on missing signature text
      // when a signature label/box (or OCR signature block) is present.
      // (Converted to Present below — do not drop silently.)
      if (SIGNATURE_FIELD_RE.test(f.fieldName) && signatureEvidence) {
        return true;
      }
    }
    // Drop mileage/odometer noise on serial/asset fields
    if (isMileageAsSerialSnippet(f)) {
      return false;
    }
    // Drop date findings whose only snippet is asset bleed (no real date)
    if (DATE_FIELD_RE.test(f.fieldName)) {
      const snippet = `${f.normalisedSnippet || ""} ${f.rawSnippet || ""}`;
      const hasDate =
        DATE_VALUE_RE.test((f.normalisedSnippet || "").trim()) ||
        DATE_VALUE_RE.test((f.rawSnippet || "").trim()) ||
        splitConflictParts(f).some(isDateShaped) ||
        /\d{4}-\d{2}-\d{2}|\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}/.test(snippet);
      if (!hasDate && isAssetToken(snippet)) {
        return false;
      }
    }
    return true;
  });

  // Convert false Absent/MISSING signatures → recorded Present (S3 / Passed tab)
  let convertedSignature = false;
  working = working.map(f => {
    if (isFalseAbsentSignature(f, signatureEvidence)) {
      convertedSignature = true;
      return toPresentSignatureFinding(f);
    }
    return f;
  });

  // If label/OCR evidence exists but Gemini omitted signature entirely, record Present
  if (
    signatureEvidence &&
    !convertedSignature &&
    !working.some(f => SIGNATURE_FIELD_RE.test(f.fieldName))
  ) {
    working = [...working, buildPresentSignatureFinding()];
  }

  // Downgrade Present|assetId signature conflicts
  working = working.map(f => {
    if (isNonsenseSignatureConflict(f)) {
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
    }
    if (isNonsenseDateAssetConflict(f)) {
      const dateOnly = pickDateFromConflict(f);
      return {
        ...f,
        reasonCode: "LOW_CONFIDENCE" as const,
        severity: "S3" as const,
        normalisedSnippet: dateOnly,
        rawSnippet: dateOnly,
        whyItMatters:
          "Date was confused with an adjacent asset/Make-Model line; kept the date candidate only.",
        suggestedFix:
          "Confirm the service date on the document; ignore asset ID bleed.",
      };
    }
    if (isNonsenseEngineerNameConflict(f)) {
      const username = pickUsernameFromConflict(f);
      return {
        ...f,
        reasonCode: "LOW_CONFIDENCE" as const,
        severity: "S3" as const,
        normalisedSnippet: username,
        rawSnippet: username,
        whyItMatters:
          "Technician name was confused with company letterhead/URL; kept the username only.",
        suggestedFix:
          "Confirm the technician name on the document; ignore letterhead noise.",
      };
    }
    if (isLetterheadPollutionConflict(f)) {
      const clean = pickCleanFromLetterheadConflict(f);
      return {
        ...f,
        reasonCode: "LOW_CONFIDENCE" as const,
        severity: "S3" as const,
        normalisedSnippet: clean,
        rawSnippet: clean,
        whyItMatters:
          "Field value was confused with form letterhead/footer (phone, website, Email); kept the document value only.",
        suggestedFix:
          "Confirm the field on the document; ignore PlantExpand letterhead/footer chrome.",
      };
    }
    if (isNonsenseJobRefConflict(f)) {
      const digits = pickDigitsFromConflict(f);
      return {
        ...f,
        reasonCode: "LOW_CONFIDENCE" as const,
        severity: "S3" as const,
        normalisedSnippet: digits,
        rawSnippet: digits,
        whyItMatters:
          "Job reference values all normalize to the same number; treated as agreement.",
        suggestedFix: "Confirm the job reference number on the document.",
      };
    }
    return f;
  });

  // Final pass: strip letterhead chrome from every finding snippet (audit + coaching)
  working = working
    .map(f => {
      const scrubbed = scrubLetterheadFromSnippets(f);
      const norm = scrubLetterheadConflictParts(
        scrubbed.normalisedSnippet ?? ""
      );
      const raw = scrubLetterheadConflictParts(scrubbed.rawSnippet ?? "");
      return {
        ...scrubbed,
        normalisedSnippet: norm,
        rawSnippet: raw,
      };
    })
    .filter(f => {
      // Drop CONFLICT/LOW_CONFIDENCE findings that had only letterhead left
      if (
        (f.reasonCode === "CONFLICT" || f.reasonCode === "LOW_CONFIDENCE") &&
        !f.normalisedSnippet?.trim() &&
        !f.rawSnippet?.trim() &&
        /ENSEMBLE|letterhead|footer|chrome/i.test(
          `${f.ruleId ?? ""} ${f.whyItMatters ?? ""}`
        )
      ) {
        return false;
      }
      return true;
    });

  // Inject VOR / asset / makeModel / mileage Present findings from text evidence
  if (options.documentText) {
    working = injectPresentFieldFindings(working, options.documentText, pre);
  }

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

/**
 * True when findings are informational only (S3 / LOW_CONFIDENCE soft notes).
 * Used to promote REVIEW_QUEUE → PASS after hygiene.
 */
export function hasOnlyInformationalFindings(findings: Finding[]): boolean {
  if (findings.length === 0) return true;
  return findings.every(f => {
    if (f.severity === "S3") return true;
    if (f.severity === "S2" && f.reasonCode === "LOW_CONFIDENCE") return true;
    return false;
  });
}

/**
 * Fix extracted field values that claim signature Absent when label/OCR evidence exists.
 */
export function sanitizeExtractedFieldsForSignatures<
  T extends Record<
    string,
    { value: string; confidence: number; pageNumber: number }
  >,
>(
  fields: T,
  options: {
    signatureLabelPresent?: boolean;
    hasOcrSignature?: boolean;
  } = {}
): T {
  if (!options.signatureLabelPresent && !options.hasOcrSignature) {
    return fields;
  }
  const next = { ...fields };
  for (const [key, data] of Object.entries(next)) {
    if (
      SIGNATURE_FIELD_RE.test(key) &&
      /^(absent|missing|no|unsigned)$/i.test(data.value.trim())
    ) {
      next[key as keyof T] = {
        ...data,
        value: "Present",
        confidence: Math.max(data.confidence, 70),
      } as T[keyof T];
    }
  }
  return next;
}
