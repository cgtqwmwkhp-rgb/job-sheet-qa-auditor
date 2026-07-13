/**
 * Advanced Document Extraction Engine
 * ====================================
 * Best-in-class++ extraction system with:
 * 1. Hybrid text extraction (embedded PDF + OCR fallback)
 * 2. Multi-pattern regex matching with fuzzy fallback
 * 3. LLM-assisted extraction for edge cases (Gemini 2.5)
 * 4. Ensemble voting for consensus-based confidence
 * 5. OCR error correction
 * 6. Field normalization and validation
 */

import { invokeLLM } from "../_core/llm";
import { getProcessingSettings, ProcessingSettingsConfig } from "../db";
import { extractCompletionYesNo } from "./extraction/completionYesNo";
export {
  isLetterheadNoise,
  stripLetterheadNoise,
  containsLetterheadNoise,
} from "./letterheadNoise";
import {
  isLetterheadNoise,
  rejectLetterheadExtractedValue,
} from "./letterheadNoise";

// ============================================================================
// TYPES
// ============================================================================

export interface FieldDefinition {
  name: string;
  displayName: string;
  required: boolean;
  severity: "S0" | "S1" | "S2" | "S3";
  regexPatterns: RegExp[];
  fuzzyLabels: string[];
  llmPrompt: string;
  normalizer?: "date" | "boolean" | "name" | "uppercase";
}

export interface ExtractionResult {
  value: string | null;
  confidence: number;
  strategy: "regex" | "fuzzy" | "context" | "llm" | "ensemble" | "none";
  evidence: string;
}

export interface FieldExtraction {
  displayName: string;
  required: boolean;
  severity: string;
  value: string | null;
  confidence: number;
  strategy: string;
  evidence: string;
  consensusCount?: number;
  /** Distinct high-confidence values when strategies disagree */
  conflictValues?: string[];
  /** Set when ensemble detects disagreement or low consensus confidence */
  reasonCode?: "CONFLICT" | "LOW_CONFIDENCE" | null;
}

/** Stamped on reportJson.ensembleExtraction for audit trail */
export const ENGINE_VERSION = "1.0.0";

export interface DocumentExtractionResult {
  filename: string;
  status: "PASS" | "FAIL" | "REVIEW_QUEUE";
  qualityScore: number;
  averageConfidence: number;
  extractedCount: number;
  totalFields: number;
  requiredExtracted: number;
  requiredTotal: number;
  missingRequired: string[];
  lowConfidenceFields: string[];
  extractedData: Record<string, string>;
  fieldDetails: Record<string, FieldExtraction>;
  documentType: string;
  extractionMethod: "EMBEDDED_TEXT" | "OCR" | "HYBRID";
  processingTimeMs: number;
}

// ============================================================================
// OCR ERROR CORRECTIONS
// ============================================================================

const OCR_CORRECTIONS: Record<string, string[]> = {
  Narne: ["Name"],
  Nurnber: ["Number"],
  Cornpleted: ["Completed"],
  Requirecl: ["Required"],
  Enginee: ["Engineer"],
  Custorner: ["Customer"],
  Ternp: ["Temp"],
  Tirne: ["Time"],
  rn: ["m"],
  cl: ["d"],
  vv: ["w"],
};

function correctOcrErrors(text: string): string {
  let corrected = text;
  for (const [wrong, rights] of Object.entries(OCR_CORRECTIONS)) {
    for (const right of rights) {
      const regex = new RegExp(`\\b${wrong}\\b`, "g");
      corrected = corrected.replace(regex, right);
    }
  }
  return corrected;
}

// ============================================================================
// FIELD DEFINITIONS
// ============================================================================

export const FIELD_DEFINITIONS: FieldDefinition[] = [
  {
    name: "asset_no",
    displayName: "Asset Number",
    required: true,
    severity: "S0",
    regexPatterns: [
      // Require No/Number/ID/# so "Asset Details" never captures "DETAILS"
      /Asset\s*(?:No|Number|ID|#)\s*[:\s]+([A-Z0-9][A-Z0-9_-]{2,})/i,
      /Asset\s*ID[:\s]+([A-Z0-9][A-Z0-9_-]{2,})/i,
      /Registration[:\s]*([A-Z]{2}\d{2}[A-Z]{3})/i,
      /Reg(?:istration)?\s*(?:No|Number|#)?[:\s]*([A-Z0-9]{5,8})/i,
    ],
    fuzzyLabels: [
      "Asset No",
      "Asset Number",
      "Asset ID",
      "Registration",
      "Reg No",
    ],
    llmPrompt:
      "Extract the asset number or registration number from this text.",
    normalizer: "uppercase",
  },
  {
    name: "make_model",
    displayName: "Make/Model",
    required: true,
    severity: "S1",
    regexPatterns: [
      /Make[/\s]*Model[:\s]*([^\n]+?)(?=\n|Serial|Customer|Site\s+Address|Miles|Completion|Job\s*ID|$)/i,
      /Make[:\s]*([^\n]+?)(?=\n|Model|Serial|Customer|$)/i,
      /Equipment[:\s]*([^\n]+?)(?=\n|Serial|Customer|$)/i,
    ],
    fuzzyLabels: [
      "Make/Model",
      "Make Model",
      "Make",
      "Equipment",
      "Vehicle Type",
    ],
    llmPrompt: "Extract the make and model of the equipment or vehicle.",
  },
  {
    name: "serial_no",
    displayName: "Serial Number",
    required: false,
    severity: "S2",
    regexPatterns: [
      /Serial\s*(?:No|Number|#)?[:\s]*(?!(?:Asset|Make|Model|Customer|Serial|null|Null|N\/A)\b)([A-Z0-9][A-Z0-9-]{2,})/i,
      /S\/N[:\s]*(?!(?:Asset|Make|Model|Customer|Serial|null|Null|N\/A)\b)([A-Z0-9][A-Z0-9-]{2,})/i,
      /VIN[:\s]*([A-Z0-9]{17})/i,
    ],
    fuzzyLabels: ["Serial No", "Serial Number", "S/N", "VIN"],
    llmPrompt: "Extract the serial number or VIN.",
    normalizer: "uppercase",
  },
  {
    name: "job_no",
    displayName: "Job Number",
    required: true,
    severity: "S0",
    regexPatterns: [
      /Job\s*ID\s*[:\s]*(\d+)/i,
      /Job\s*(?:No|Number|#)?[:\s]*(\d+)/i,
      /Work\s*Order[:\s]*(\d+)/i,
      /WO[:\s]*#?(\d+)/i,
      /Reference[:\s]*(\d+)/i,
    ],
    fuzzyLabels: [
      "Job ID",
      "Job No",
      "Job Number",
      "Work Order",
      "WO",
      "Reference",
    ],
    llmPrompt: "Extract the job number or work order number.",
  },
  {
    name: "customer_name",
    displayName: "Customer Name",
    required: true,
    severity: "S1",
    regexPatterns: [
      /Customer\s*(?:Name)?[:\s]*([A-Za-z][^\n]+?)(?=\n|Contact|Address|$)/i,
      /Client[:\s]*([A-Za-z][^\n]+?)(?=\n|$)/i,
      /Company[:\s]*([A-Za-z][^\n]+?)(?=\n|$)/i,
    ],
    fuzzyLabels: ["Customer Name", "Customer", "Client", "Company", "Account"],
    llmPrompt: "Extract the customer or client name.",
    normalizer: "name",
  },
  {
    name: "date",
    displayName: "Date",
    required: true,
    severity: "S0",
    regexPatterns: [
      /Date[:\s]*(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})/i,
      /Date[:\s]*(\d{4}[/\-.]\d{1,2}[/\-.]\d{1,2})/i,
      /(\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})/i,
    ],
    fuzzyLabels: ["Date", "Job Date", "Completed Date", "Service Date"],
    llmPrompt: "Extract the date of the job or service.",
    normalizer: "date",
  },
  {
    name: "engineer_name",
    displayName: "Engineer Name",
    required: true,
    severity: "S0",
    regexPatterns: [
      /Engineer(?:\s*Name)?[:\s]*([A-Za-z][A-Za-z\s.]+?)(?=\n|Date|$)/i,
      /Technician(?:\s*Name)?[:\s]*([A-Za-z][A-Za-z\s.]+?)(?=\n|$)/i,
      /Completed\s*By[:\s]*([A-Za-z][A-Za-z\s.]+?)(?=\n|$)/i,
      /Print\s*name[:\s]*([A-Za-z][A-Za-z\s.]+?)(?=\n|$)/i,
      /Technician\s*Name\s*[:\s]*([A-Za-z][A-Za-z0-9.\s-]+?)(?=\s*Signature|\n|$)/i,
    ],
    fuzzyLabels: [
      "Engineer",
      "Engineer Name",
      "Technician",
      "Completed By",
      "Service By",
    ],
    llmPrompt: "Extract the engineer or technician name.",
    normalizer: "name",
  },
  {
    name: "safe_to_use",
    displayName: "Safe to Use",
    required: true,
    severity: "S0",
    regexPatterns: [
      /asset\s+safe\s+to\s+use\??\s*:?\s*(Yes|No|Y|N)/i,
      /safe\s+to\s+(?:use|operate)\??\s*:?\s*(Yes|No|Y|N)/i,
      /equipment\s+safe\??\s*:?\s*(Yes|No)/i,
      /safe\s+to\s+operate\s+Yes\/No[:\s]*(Yes|No)/i,
    ],
    fuzzyLabels: [
      "Safe to Use",
      "Safe to Operate",
      "Equipment Safe",
      "Serviceable",
    ],
    llmPrompt: "Is the asset/equipment safe to use? Extract Yes or No.",
    normalizer: "boolean",
  },
  {
    name: "return_visit",
    displayName: "Return Visit Needed",
    required: false,
    severity: "S2",
    regexPatterns: [
      /Return\s+Visit\s+(?:Needed|Required)\??\s*:?\s*(Yes|No|Y|N)/i,
      /Is\s+a\s+return\s+visit\s+required\??\s*:?\s*(Yes|No|Y|N)/i,
    ],
    fuzzyLabels: [
      "Return Visit Needed",
      "Return Visit Required",
      "Return Visit",
    ],
    llmPrompt: "Is a return visit needed or required? Extract Yes or No.",
    normalizer: "boolean",
  },
  {
    name: "all_works",
    displayName: "All Works Completed",
    required: false,
    severity: "S2",
    regexPatterns: [
      /All\s+Works\s+(?:Completed|Complete)\??\s*:?\s*(Yes|No|Y|N)/i,
      /Were\s+all\s+works\s+fully\s+completed\??\s*:?\s*(Yes|No|Y|N)/i,
    ],
    fuzzyLabels: [
      "All Works Completed",
      "All Works Complete",
      "Works Completed",
    ],
    llmPrompt: "Were all works fully completed? Extract Yes or No.",
    normalizer: "boolean",
  },
  {
    name: "service_completed",
    displayName: "Service Completed",
    required: false,
    severity: "S2",
    regexPatterns: [
      /Service\s+Completed\??\s*:?\s*(Yes|No|Y|N)/i,
      /Was\s+the\s+service\s+fully\s+completed\??\s*:?\s*(Yes|No|Y|N)/i,
    ],
    fuzzyLabels: ["Service Completed", "Service Complete"],
    llmPrompt: "Was the service fully completed? Extract Yes or No.",
    normalizer: "boolean",
  },
  {
    name: "engineer_comments",
    displayName: "Engineer Comments",
    required: true,
    severity: "S1",
    regexPatterns: [
      /Engineer\s*Comments?[:\s]*([^\n]+(?:\n(?![A-Z][a-z]*(?:\s+[A-Z][a-z]*)?:)[^\n]+)*)/i,
      /Technician\s*Notes?[:\s]*([^\n]+)/i,
      /Comments?[:\s]*([^\n]+)/i,
      /Notes?[:\s]*([^\n]+)/i,
    ],
    fuzzyLabels: [
      "Engineer Comments",
      "Technician Notes",
      "Service Notes",
      "Comments",
      "Notes",
    ],
    llmPrompt: "Extract the engineer's comments or notes about the service.",
  },
  {
    name: "technician_signature",
    displayName: "Technician Signature",
    required: true,
    severity: "S0",
    regexPatterns: [
      /(?:Technician|Engineer)\s*Signature/i,
      /Signed\s*(?:By)?[:\s]*([^\n]+)/i,
    ],
    fuzzyLabels: [
      "Technician Signature",
      "Engineer Signature",
      "Signed By",
      "Signature",
    ],
    llmPrompt: "Is there a technician or engineer signature present?",
  },
];

// ============================================================================
// NORMALIZATION FUNCTIONS
// ============================================================================

function normalizeDate(value: string): string {
  const trimmed = value.trim();

  // Try DD/MM/YYYY format
  const ddmmyyyy = trimmed.match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/);
  if (ddmmyyyy) {
    const [, day, month, year] = ddmmyyyy;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  // Try YYYY-MM-DD format
  const yyyymmdd = trimmed.match(/(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})/);
  if (yyyymmdd) {
    const [, year, month, day] = yyyymmdd;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  return trimmed;
}

function normalizeBoolean(value: string): string {
  const upper = value.trim().toUpperCase();
  if (["YES", "Y", "TRUE", "1"].includes(upper)) return "Yes";
  if (["NO", "N", "FALSE", "0"].includes(upper)) return "No";
  return value.trim();
}

function normalizeName(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .map(word => {
      if (["UK", "USA", "LLC", "LTD", "PLC"].includes(word.toUpperCase())) {
        return word.toUpperCase();
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

function normalizeValue(value: string, normalizer?: string): string {
  if (!value) return value;

  switch (normalizer) {
    case "date":
      return normalizeDate(value);
    case "boolean":
      return normalizeBoolean(value);
    case "name":
      return normalizeName(value);
    case "uppercase":
      return value.trim().toUpperCase();
    default:
      return value.trim();
  }
}

// ============================================================================
// FUZZY MATCHING
// ============================================================================

function levenshteinDistance(s1: string, s2: string): number {
  if (s1.length < s2.length) return levenshteinDistance(s2, s1);
  if (s2.length === 0) return s1.length;

  let previousRow = Array.from({ length: s2.length + 1 }, (_, i) => i);

  for (let i = 0; i < s1.length; i++) {
    const currentRow = [i + 1];
    for (let j = 0; j < s2.length; j++) {
      const insertions = previousRow[j + 1] + 1;
      const deletions = currentRow[j] + 1;
      const substitutions = previousRow[j] + (s1[i] !== s2[j] ? 1 : 0);
      currentRow.push(Math.min(insertions, deletions, substitutions));
    }
    previousRow = currentRow;
  }

  return previousRow[previousRow.length - 1];
}

function fuzzyRatio(s1: string, s2: string): number {
  if (!s1 || !s2) return 0;
  const distance = levenshteinDistance(s1.toLowerCase(), s2.toLowerCase());
  const maxLen = Math.max(s1.length, s2.length);
  return (1 - distance / maxLen) * 100;
}

// ============================================================================
// EXTRACTION STRATEGIES
// ============================================================================

function extractWithRegex(
  text: string,
  field: FieldDefinition
): ExtractionResult {
  for (const pattern of field.regexPatterns) {
    const match = text.match(pattern);
    if (match) {
      let value = match[1]?.trim() || null;

      // Special handling for signature presence
      if (field.name === "technician_signature" && !value) {
        if (
          text.includes("Technician Signature") ||
          text.includes("Engineer Signature")
        ) {
          value = "Present";
        }
      }

      if (value) {
        if (isPresenceSignatureField(field.name)) {
          const coerced = normalizeSignatureExtractionValue(value);
          if (!coerced) {
            continue;
          }
          value = coerced;
        }
        const confidence = pattern.source.length > 50 ? 85 : 75;
        return {
          value: normalizeValue(value, field.normalizer),
          confidence,
          strategy: "regex",
          evidence: `Pattern matched: ${pattern.source.slice(0, 50)}...`,
        };
      }
    }
  }

  // Special handling for signature presence
  if (field.name === "technician_signature") {
    if (
      text.includes("Technician Signature") ||
      text.includes("Engineer Signature")
    ) {
      return {
        value: "Present",
        confidence: 70,
        strategy: "regex",
        evidence: "Signature label found in document",
      };
    }
  }

  return { value: null, confidence: 0, strategy: "regex", evidence: "" };
}

function extractWithFuzzy(
  text: string,
  field: FieldDefinition
): ExtractionResult {
  const lines = text.split("\n");

  for (const line of lines) {
    if (line.includes(":")) {
      const [labelPart, valuePart] = line.split(":").map(s => s.trim());

      for (const label of field.fuzzyLabels) {
        const score = fuzzyRatio(labelPart, label);
        if (score >= 70 && valuePart) {
          return {
            value: normalizeValue(valuePart, field.normalizer),
            confidence: Math.min(score, 80),
            strategy: "fuzzy",
            evidence: `Fuzzy match: '${labelPart}' ~ '${label}' (${score.toFixed(1)}%)`,
          };
        }
      }
    }
  }

  return { value: null, confidence: 0, strategy: "fuzzy", evidence: "" };
}

function extractWithContext(
  text: string,
  field: FieldDefinition
): ExtractionResult {
  const lines = text.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const lineLower = lines[i].toLowerCase();

    for (const label of field.fuzzyLabels) {
      if (lineLower.includes(label.toLowerCase())) {
        // Signature fields: label presence = Present (never grab next-line asset IDs)
        if (isPresenceSignatureField(field.name)) {
          return {
            value: "Present",
            confidence: 70,
            strategy: "context",
            evidence: `Signature label found on line ${i + 1}`,
          };
        }
        if (lines[i].includes(":")) {
          const value = lines[i].split(":")[1]?.trim();
          if (value && !isAssetIdShaped(value)) {
            if (isDateField(field.name) && !looksLikeDateValue(value)) {
              // keep searching — colon value was not a date
            } else {
              return {
                value: normalizeValue(value, field.normalizer),
                confidence: 70,
                strategy: "context",
                evidence: `Context match on line ${i + 1}`,
              };
            }
          }
        } else if (i + 1 < lines.length) {
          const nextLine = lines[i + 1].trim();
          if (!nextLine || nextLine.includes(":")) {
            continue;
          }
          if (isAssetIdShaped(nextLine)) {
            // Never treat asset/reg bleed as a field value
            continue;
          }
          if (isDateField(field.name) && !looksLikeDateValue(nextLine)) {
            // Skip non-date text on the line after "Date"
            continue;
          }
          return {
            value: normalizeValue(nextLine, field.normalizer),
            confidence: 60,
            strategy: "context",
            evidence: `Value on line after label (line ${i + 2})`,
          };
        }
      }
    }
  }

  return { value: null, confidence: 0, strategy: "context", evidence: "" };
}

async function extractWithLlm(
  text: string,
  field: FieldDefinition
): Promise<ExtractionResult> {
  try {
    const prompt = `You are an expert document analyst. Extract the following field from this job sheet text.

Field: ${field.displayName}
Instructions: ${field.llmPrompt}

Document Text (first 4000 chars):
---
${text.slice(0, 4000)}
---

Respond with ONLY a JSON object:
{"value": "extracted value or null", "confidence": 0-100, "evidence": "relevant text snippet"}`;

    const result = await invokeLLM({
      messages: [{ role: "user", content: prompt }],
    });

    const response = result.choices[0]?.message?.content;
    if (typeof response === "string") {
      const jsonMatch = response.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.value && parsed.confidence > 50) {
          return {
            value: normalizeValue(parsed.value, field.normalizer),
            confidence: parsed.confidence,
            strategy: "llm",
            evidence: parsed.evidence || "LLM extraction",
          };
        }
      }
    }
  } catch (error) {
    console.error(`LLM extraction failed for ${field.name}:`, error);
  }

  return { value: null, confidence: 0, strategy: "llm", evidence: "" };
}

// ============================================================================
// ENSEMBLE EXTRACTION
// ============================================================================

/** UK-style asset / reg tokens that must not win signature/date conflicts. */
export function isAssetIdShaped(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (/^[A-Z]{2}\d{2}[A-Z]{3}(_[A-Z0-9]+)?$/i.test(v)) return true;
  if (/^[A-Z]{1,3}\d{1,4}[A-Z]{1,3}(_[A-Z0-9]+)?$/i.test(v) && v.includes("_"))
    return true;
  if (/_TL$/i.test(v) || /_FL$/i.test(v)) return true;
  // "BN21ACO_TL Make/Model" style bleed from next-line context grab
  if (
    /\b[A-Z]{2}\d{2}[A-Z]{3}(_[A-Z0-9]+)?\b/i.test(v) &&
    /make\/?model/i.test(v)
  )
    return true;
  if (/\b[A-Z0-9]+_TL\b/i.test(v) && v.split(/\s+/).length >= 2) return true;
  return false;
}

export function isPresenceSignatureField(fieldName: string): boolean {
  return (
    fieldName === "technician_signature" ||
    fieldName === "customer_signature" ||
    /signature/i.test(fieldName)
  );
}

export function isDateField(fieldName: string): boolean {
  return (
    fieldName === "date" ||
    fieldName === "dateOfService" ||
    /^date$/i.test(fieldName) ||
    /date_of|service.?date|job.?date/i.test(fieldName)
  );
}

/** True when value looks like a calendar date (not an asset/label bleed). */
export function looksLikeDateValue(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (isAssetIdShaped(v)) return false;
  if (/make\/?model|mileage|odometer|taillift|asset\s*no/i.test(v)) {
    return false;
  }
  if (/^\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}$/.test(v)) return true;
  if (/^\d{4}[/\-.]\d{1,2}[/\-.]\d{1,2}$/.test(v)) return true;
  if (
    /^\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{2,4}$/i.test(
      v
    )
  ) {
    return true;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return true;
  return false;
}

/** Keep only date-shaped values for date fields. */
export function normalizeDateExtractionValue(
  value: string | null
): string | null {
  if (!value) return null;
  const v = value.trim();
  if (!v) return null;
  if (!looksLikeDateValue(v)) return null;
  return v;
}

/** True when value is shaped like a username (firstname.lastname). */
export function isUsernameShaped(value: string): boolean {
  return /^[A-Za-z][A-Za-z0-9]*\.[A-Za-z][A-Za-z0-9]*$/.test(value.trim());
}

/** True when value is blank, null-like, or a field label word. */
function isBlankOrPlaceholder(value: string | null | undefined): boolean {
  if (!value) return true;
  const v = value.trim();
  if (!v) return true;
  return /^(null|n\/a|none|nil|-|—|–|\.+)$/i.test(v);
}

/** True when value looks like a field label rather than serial data. */
function isFieldLabelWord(value: string): boolean {
  return /^(Asset|Make|Model|Customer|Serial|Number|No|null|Null|N\/A)$/i.test(
    value.trim()
  );
}

/** Coerce signature extractions values to Present/Absent; drop asset IDs. */
export function normalizeSignatureExtractionValue(
  value: string | null
): string | null {
  if (!value) return null;
  const v = value.trim();
  if (!v) return null;
  if (/^(present|yes|signed|true)$/i.test(v)) return "Present";
  if (/^(absent|no|missing|false|unsigned)$/i.test(v)) return "Absent";
  if (isAssetIdShaped(v)) return null;
  // Long free-text after "Signed by:" that looks like a name — treat as Present
  if (v.length <= 60 && !/\d{4,}/.test(v) && !isAssetIdShaped(v)) {
    // If it looks like a person name (letters/spaces), keep as Present signal
    if (/^[A-Za-z][A-Za-z\s.'-]{1,50}$/.test(v)) return "Present";
  }
  if (isAssetIdShaped(v) || /mileage|odometer|hours/i.test(v)) return null;
  return "Present";
}

const CONFIDENCE_GAP_RESOLVE = 10;

export interface EnsembleExtractOptions {
  useLlm?: boolean;
  /** Confidence below which LLM fallback may run (default 70) */
  llmConfidenceThreshold?: number;
  /** When false, skip fuzzy strategy (default true) */
  fuzzyMatchingEnabled?: boolean;
  /** Minimum fuzzy ratio when fuzzy is enabled (default 70 for strategy; settings may raise) */
  fuzzyMatchThreshold?: number;
}

/**
 * Multi-strategy field extraction with consensus voting.
 * Exported for unit/contract tests and the ensembleExtraction adapter.
 */
export async function ensembleExtract(
  text: string,
  field: FieldDefinition,
  useLlmOrOptions: boolean | EnsembleExtractOptions = false
): Promise<FieldExtraction> {
  const options: EnsembleExtractOptions =
    typeof useLlmOrOptions === "boolean"
      ? { useLlm: useLlmOrOptions }
      : useLlmOrOptions;

  const useLlm = options.useLlm ?? false;
  const llmThreshold = options.llmConfidenceThreshold ?? 70;
  const fuzzyEnabled = options.fuzzyMatchingEnabled ?? true;

  const results: ExtractionResult[] = [];

  // Run extraction strategies
  const regexResult = extractWithRegex(text, field);
  if (regexResult.value) results.push(regexResult);

  if (fuzzyEnabled) {
    const fuzzyResult = extractWithFuzzy(text, field);
    if (fuzzyResult.value) results.push(fuzzyResult);
  }

  const contextResult = extractWithContext(text, field);
  if (contextResult.value) results.push(contextResult);

  // Use LLM for missing or low-confidence fields
  if (
    useLlm &&
    (results.length === 0 ||
      Math.max(...results.map(r => r.confidence)) < llmThreshold)
  ) {
    const llmResult = await extractWithLlm(text, field);
    if (llmResult.value) results.push(llmResult);
  }

  if (results.length === 0) {
    return {
      displayName: field.displayName,
      required: field.required,
      severity: field.severity,
      value: null,
      confidence: 0,
      strategy: "none",
      evidence: "No extraction strategy succeeded",
      reasonCode: field.required ? "LOW_CONFIDENCE" : null,
    };
  }

  // Signature hygiene: coerce to Present/Absent; drop asset-ID shaped noise
  if (isPresenceSignatureField(field.name)) {
    const normalized: ExtractionResult[] = [];
    for (const r of results) {
      const coerced = normalizeSignatureExtractionValue(r.value);
      if (coerced) {
        normalized.push({ ...r, value: coerced });
      }
    }
    results.length = 0;
    results.push(...normalized);
    if (results.length === 0) {
      return {
        displayName: field.displayName,
        required: field.required,
        severity: field.severity,
        value: null,
        confidence: 0,
        strategy: "none",
        evidence: "Signature strategies produced only asset-ID noise",
        reasonCode: field.required ? "LOW_CONFIDENCE" : null,
      };
    }
  }

  // Date hygiene: drop asset/label bleed (e.g. BN21ACO_TL Make/Model)
  if (isDateField(field.name)) {
    const normalized: ExtractionResult[] = [];
    for (const r of results) {
      const coerced = normalizeDateExtractionValue(r.value);
      if (coerced) {
        normalized.push({ ...r, value: coerced });
      }
    }
    results.length = 0;
    results.push(...normalized);
    if (results.length === 0) {
      return {
        displayName: field.displayName,
        required: field.required,
        severity: field.severity,
        value: null,
        confidence: 0,
        strategy: "none",
        evidence: "Date strategies produced only non-date / asset-ID noise",
        reasonCode: field.required ? "LOW_CONFIDENCE" : null,
      };
    }
  }

  // Job number digit normalization: if all values share the same digits,
  // coerce each to the canonical form so voting sees agreement (do not
  // collapse to a single result — that would wipe consensusCount).
  if (field.name === "job_no" || field.name === "job_number") {
    const digitValues = results
      .filter(r => r.value)
      .map(r => r.value!.replace(/\D/g, ""));
    const uniqueDigits = new Set(digitValues.filter(d => d.length > 0));
    if (uniqueDigits.size === 1 && results.length >= 2) {
      const canonical = Array.from(uniqueDigits)[0];
      const normalizedCanonical = normalizeValue(canonical, field.normalizer);
      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        if (!r.value) continue;
        const digits = r.value.replace(/\D/g, "");
        if (digits === canonical) {
          results[i] = { ...r, value: normalizedCanonical };
        }
      }
    }
  }

  // Serial number hygiene: if all values are blank/placeholder/label, return null (no CONFLICT)
  if (field.name === "serial_no") {
    const allBlank = results.every(
      r => isBlankOrPlaceholder(r.value) || isFieldLabelWord(r.value ?? "")
    );
    if (allBlank) {
      return {
        displayName: field.displayName,
        required: field.required,
        severity: field.severity,
        value: null,
        confidence: 0,
        strategy: "none",
        evidence:
          "Serial number values are all blank/placeholder/label — no data",
        reasonCode: null,
      };
    }
  }

  // Letterhead/footer chrome (phone, www, Email, PlantExpand) — discard for ALL fields
  {
    const cleaned: typeof results = [];
    for (const r of results) {
      const scrubbed = rejectLetterheadExtractedValue(r.value);
      if (scrubbed == null) continue;
      cleaned.push(scrubbed === r.value ? r : { ...r, value: scrubbed });
    }
    if (
      cleaned.length !== results.length ||
      cleaned.some((r, i) => r !== results[i])
    ) {
      results.length = 0;
      results.push(...cleaned);
    }
  }

  // Engineer name hygiene: prefer username-shaped values after letterhead discard
  if (field.name === "engineer_name") {
    const cleaned = results.filter(r => !isLetterheadNoise(r.value ?? ""));
    if (cleaned.length > 0 && cleaned.length < results.length) {
      const usernames = cleaned.filter(r => isUsernameShaped(r.value ?? ""));
      if (usernames.length > 0) {
        results.length = 0;
        results.push(...usernames);
      } else {
        results.length = 0;
        results.push(...cleaned);
      }
    } else if (cleaned.length > 0) {
      const usernames = cleaned.filter(r => isUsernameShaped(r.value ?? ""));
      if (usernames.length > 0) {
        results.length = 0;
        results.push(...usernames);
      }
    }
  }

  // Voting: if multiple strategies agree, boost confidence
  const valueCounts: Record<string, number> = {};
  for (const r of results) {
    if (r.value) {
      valueCounts[r.value] = (valueCounts[r.value] || 0) + 1;
    }
  }

  let mostCommonValue = "";
  let maxCount = 0;
  for (const value of Object.keys(valueCounts)) {
    const count = valueCounts[value];
    if (count > maxCount) {
      maxCount = count;
      mostCommonValue = value;
    }
  }

  // Disagreement: ≥2 distinct high-confidence values with no clear vote winner
  let highConfResults = results.filter(r => r.confidence >= llmThreshold);
  // Type-aware: for signature fields, only presence values participate in conflicts
  if (isPresenceSignatureField(field.name)) {
    highConfResults = highConfResults.filter(
      r =>
        r.value === "Present" ||
        r.value === "Absent" ||
        (!!r.value && !isAssetIdShaped(r.value))
    );
  }
  const highConfValues = Array.from(
    new Set(
      highConfResults
        .map(r => r.value)
        .filter((v): v is string => typeof v === "string" && v.length > 0)
    )
  );
  const tiedTopValues = Object.entries(valueCounts)
    .filter(([, count]) => count === maxCount)
    .map(([value]) => value);

  // Confidence-gap resolve: clear leader → no CONFLICT
  const rankedByConf = [...results]
    .filter(r => r.value)
    .sort((a, b) => b.confidence - a.confidence);
  const top = rankedByConf[0];
  const runner = rankedByConf.find(r => r.value !== top?.value);
  const gapResolved =
    top &&
    runner &&
    top.confidence - runner.confidence >= CONFIDENCE_GAP_RESOLVE;

  const hasConflict =
    !gapResolved &&
    highConfValues.length >= 2 &&
    (tiedTopValues.length > 1 ||
      (maxCount === 1 && highConfValues.length >= 2));

  if (hasConflict) {
    const conflictValues =
      highConfValues.length >= 2 ? highConfValues : tiedTopValues;
    // Drop Present|assetId / date|assetId nonsense conflicts
    let filteredConflicts = conflictValues;
    if (isPresenceSignatureField(field.name)) {
      filteredConflicts = conflictValues.filter(v => !isAssetIdShaped(v));
    } else if (isDateField(field.name)) {
      filteredConflicts = conflictValues.filter(v => looksLikeDateValue(v));
    }
    if (filteredConflicts.length < 2) {
      // Resolve to presence / date / top value instead of CONFLICT
      const resolved =
        filteredConflicts[0] ??
        (isDateField(field.name)
          ? normalizeDateExtractionValue(top?.value ?? null)
          : normalizeSignatureExtractionValue(top?.value ?? null)) ??
        mostCommonValue;
      const bestAmong = results
        .filter(r => r.value === resolved || r.value === top?.value)
        .reduce((a, b) => (a.confidence > b.confidence ? a : b), results[0]);
      return {
        displayName: field.displayName,
        required: field.required,
        severity: field.severity,
        value: resolved,
        confidence: Math.min(bestAmong.confidence + 5, 100),
        strategy: "ensemble(resolved)",
        evidence: bestAmong.evidence,
        consensusCount: maxCount,
        reasonCode:
          bestAmong.confidence < llmThreshold ? "LOW_CONFIDENCE" : null,
      };
    }

    const bestAmong = results
      .filter(r => r.value && filteredConflicts.includes(r.value))
      .reduce((a, b) => (a.confidence > b.confidence ? a : b));

    return {
      displayName: field.displayName,
      required: field.required,
      severity: field.severity,
      value: bestAmong.value,
      confidence: Math.min(bestAmong.confidence, llmThreshold - 1),
      strategy: "ensemble(CONFLICT)",
      evidence: `Conflicting values: ${filteredConflicts.join(" | ")}`,
      consensusCount: maxCount,
      conflictValues: filteredConflicts,
      reasonCode: "CONFLICT",
    };
  }

  const winningResults = results.filter(r => r.value === mostCommonValue);
  const bestResult = winningResults.reduce((a, b) =>
    a.confidence > b.confidence ? a : b
  );

  // Boost confidence for consensus
  const confidenceBoost = Math.min(10 * (maxCount - 1), 15);
  const finalConfidence = Math.min(
    bestResult.confidence + confidenceBoost,
    100
  );
  const reasonCode: FieldExtraction["reasonCode"] =
    finalConfidence > 0 && finalConfidence < llmThreshold
      ? "LOW_CONFIDENCE"
      : null;

  return {
    displayName: field.displayName,
    required: field.required,
    severity: field.severity,
    value: mostCommonValue,
    confidence: finalConfidence,
    strategy:
      maxCount > 1 ? `ensemble(${maxCount} agree)` : bestResult.strategy,
    evidence: bestResult.evidence,
    consensusCount: maxCount,
    reasonCode,
  };
}

// ============================================================================
// DOCUMENT PROCESSOR
// ============================================================================

export interface ProcessingOptions {
  useLlm?: boolean;
  extractionMethod?: "EMBEDDED_TEXT" | "OCR" | "HYBRID";
  settings?: ProcessingSettingsConfig;
}

export async function processDocument(
  text: string,
  filename: string,
  options: ProcessingOptions = {}
): Promise<DocumentExtractionResult> {
  const startTime = Date.now();

  // Load processing settings from database if not provided
  const settings = options.settings ?? (await getProcessingSettings());
  const useLlm = options.useLlm ?? settings.llmFallbackEnabled;
  const extractionMethod = options.extractionMethod ?? "EMBEDDED_TEXT";
  const llmConfidenceThreshold = settings.llmConfidenceThreshold ?? 70;
  const fuzzyMatchingEnabled = settings.fuzzyMatchingEnabled ?? true;
  const fuzzyMatchThreshold = settings.fuzzyMatchThreshold ?? 80;

  // Apply OCR error correction
  const correctedText = correctOcrErrors(text);

  // Detect document type
  const documentType = detectDocumentType(correctedText);

  // Extract all fields
  const extractedData: Record<string, string> = {};
  const fieldDetails: Record<string, FieldExtraction> = {};

  for (const field of FIELD_DEFINITIONS) {
    const result = await ensembleExtract(correctedText, field, {
      useLlm,
      llmConfidenceThreshold,
      fuzzyMatchingEnabled,
      fuzzyMatchThreshold,
    });
    if (result.value) {
      extractedData[field.name] = result.value;
    }
    fieldDetails[field.name] = result;
  }

  // Grid-aware hint for safe_to_use — matches the logic jobSummaryConsistency
  // uses, so ensemble extraction and JSR findings stay aligned.
  const safeField = fieldDetails["safe_to_use"];
  if (!safeField?.value || safeField.confidence < llmConfidenceThreshold) {
    const gridAnswer = extractCompletionYesNo(correctedText, [
      /Is\s+the\s+asset\s+safe\s+to\s+use\??/i,
      /Asset\s+Safe\s+To\s+Use\??/i,
    ]);
    if (gridAnswer !== "unknown") {
      const normalized = gridAnswer === "yes" ? "Yes" : "No";
      extractedData["safe_to_use"] = normalized;
      fieldDetails["safe_to_use"] = {
        displayName: safeField?.displayName ?? "Safe to Use",
        required: safeField?.required ?? true,
        severity: safeField?.severity ?? "S0",
        value: normalized,
        confidence: Math.max(safeField?.confidence ?? 0, 85),
        strategy: "ensemble(completionGrid)",
        evidence: `Completion-grid extraction: safe_to_use=${gridAnswer}`,
        reasonCode: null,
      };
    }
  }

  // Grid-aware hints for return_visit, all_works, service_completed
  const GRID_HINT_FIELDS: Array<{
    name: string;
    displayName: string;
    severity: string;
    labels: RegExp[];
  }> = [
    {
      name: "return_visit",
      displayName: "Return Visit Needed",
      severity: "S2",
      labels: [
        /Return\s+Visit\s+(?:Needed|Required)\??/i,
        /Is\s+a\s+return\s+visit\s+required\??/i,
      ],
    },
    {
      name: "all_works",
      displayName: "All Works Completed",
      severity: "S2",
      labels: [
        /All\s+Works\s+(?:Completed|Complete)\??/i,
        /Were\s+all\s+works\s+fully\s+completed\??/i,
      ],
    },
    {
      name: "service_completed",
      displayName: "Service Completed",
      severity: "S2",
      labels: [
        /Service\s+Completed\??/i,
        /Was\s+the\s+service\s+fully\s+completed\??/i,
      ],
    },
  ];

  for (const gh of GRID_HINT_FIELDS) {
    const existing = fieldDetails[gh.name];
    if (!existing?.value || existing.confidence < llmConfidenceThreshold) {
      const gridAnswer = extractCompletionYesNo(correctedText, gh.labels);
      if (gridAnswer !== "unknown") {
        const normalized = gridAnswer === "yes" ? "Yes" : "No";
        extractedData[gh.name] = normalized;
        fieldDetails[gh.name] = {
          displayName: existing?.displayName ?? gh.displayName,
          required: existing?.required ?? false,
          severity: existing?.severity ?? gh.severity,
          value: normalized,
          confidence: Math.max(existing?.confidence ?? 0, 85),
          strategy: "ensemble(completionGrid)",
          evidence: `Completion-grid extraction: ${gh.name}=${gridAnswer}`,
          reasonCode: null,
        };
      }
    }
  }

  // Calculate metrics
  const totalFields = FIELD_DEFINITIONS.length;
  const extractedCount = Object.keys(extractedData).length;
  const requiredFields = FIELD_DEFINITIONS.filter(f => f.required);
  const requiredExtracted = requiredFields.filter(
    f => extractedData[f.name]
  ).length;

  // Weighted quality score
  const requiredWeight = 0.7;
  const optionalWeight = 0.3;
  const requiredScore = (requiredExtracted / requiredFields.length) * 100;
  const optionalFields = FIELD_DEFINITIONS.filter(f => !f.required);
  const optionalExtracted = optionalFields.filter(
    f => extractedData[f.name]
  ).length;
  const optionalScore =
    optionalFields.length > 0
      ? (optionalExtracted / optionalFields.length) * 100
      : 100;
  const qualityScore =
    requiredScore * requiredWeight + optionalScore * optionalWeight;

  // Average confidence
  const confidences = Object.values(fieldDetails)
    .filter(d => d.confidence > 0)
    .map(d => d.confidence);
  const averageConfidence =
    confidences.length > 0
      ? confidences.reduce((a, b) => a + b, 0) / confidences.length
      : 0;

  // Determine status
  const missingRequired = requiredFields
    .filter(f => !extractedData[f.name])
    .map(f => f.displayName);
  const lowConfidenceFields = Object.values(fieldDetails)
    .filter(d => d.confidence > 0 && d.confidence < llmConfidenceThreshold)
    .map(d => d.displayName);
  const conflictFields = Object.values(fieldDetails)
    .filter(d => d.reasonCode === "CONFLICT")
    .map(d => d.displayName);

  let status: "PASS" | "FAIL" | "REVIEW_QUEUE";
  if (missingRequired.length > 0) {
    status = "FAIL";
  } else if (conflictFields.length > 0 || lowConfidenceFields.length > 0) {
    status = "REVIEW_QUEUE";
  } else if (qualityScore >= 90) {
    status = "PASS";
  } else {
    status = "REVIEW_QUEUE";
  }

  return {
    filename,
    status,
    qualityScore: Math.round(qualityScore * 10) / 10,
    averageConfidence: Math.round(averageConfidence * 10) / 10,
    extractedCount,
    totalFields,
    requiredExtracted,
    requiredTotal: requiredFields.length,
    missingRequired,
    lowConfidenceFields,
    extractedData,
    fieldDetails,
    documentType,
    extractionMethod,
    processingTimeMs: Date.now() - startTime,
  };
}

function detectDocumentType(text: string): string {
  const textLower = text.toLowerCase();

  if (
    textLower.includes("thorough examination report") ||
    textLower.includes("loler")
  ) {
    return "LOLER_COMPLIANCE";
  }
  if (
    textLower.includes("compliance report") ||
    textLower.includes("compliance test")
  ) {
    return "COMPLIANCE_REPORT";
  }
  if (
    textLower.includes("repair report") ||
    textLower.includes("repair duration")
  ) {
    return "REPAIR_REPORT";
  }
  if (
    textLower.includes("service report") ||
    textLower.includes("service detail")
  ) {
    return "SERVICE_REPORT";
  }

  return "UNKNOWN";
}

// ============================================================================
// BATCH PROCESSING
// ============================================================================

export async function processBatch(
  documents: Array<{ text: string; filename: string }>,
  options: { useLlm?: boolean } = {}
): Promise<{
  results: DocumentExtractionResult[];
  summary: {
    total: number;
    pass: number;
    fail: number;
    reviewQueue: number;
    avgQualityScore: number;
    avgConfidence: number;
  };
}> {
  const results: DocumentExtractionResult[] = [];

  for (const doc of documents) {
    const result = await processDocument(doc.text, doc.filename, options);
    results.push(result);
  }

  const summary = {
    total: results.length,
    pass: results.filter(r => r.status === "PASS").length,
    fail: results.filter(r => r.status === "FAIL").length,
    reviewQueue: results.filter(r => r.status === "REVIEW_QUEUE").length,
    avgQualityScore:
      results.length > 0
        ? Math.round(
            (results.reduce((a, b) => a + b.qualityScore, 0) / results.length) *
              10
          ) / 10
        : 0,
    avgConfidence:
      results.length > 0
        ? Math.round(
            (results.reduce((a, b) => a + b.averageConfidence, 0) /
              results.length) *
              10
          ) / 10
        : 0,
  };

  return { results, summary };
}
