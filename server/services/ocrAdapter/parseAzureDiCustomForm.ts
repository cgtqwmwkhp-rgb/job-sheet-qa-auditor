/**
 * Pure parser for Azure DI custom neural model analyzeResult documents/fields.
 *
 * Custom models return structured fields under analyzeResult.documents[].fields
 * (string / date / selectionMark / selectionGroup / …). Page-level selectionMarks
 * and lines are still available via parseAzureDiResponse.
 *
 * No HTTP — safe for unit / contract tests.
 */

import {
  parseAzureDiResponse,
  type AzureSelectionMark,
  type AzureTextLine,
  type ParsedAzureDiResult,
} from "./parseAzureDiResponse";
import type { OCRPage } from "./types";

export type AzureCustomFieldType =
  | "string"
  | "date"
  | "number"
  | "integer"
  | "boolean"
  | "selectionMark"
  | "selectionGroup"
  | "signature"
  | "array"
  | "object"
  | string;

export interface AzureCustomFormField {
  name: string;
  type: AzureCustomFieldType;
  /** Human-readable / raw content when present. */
  content?: string;
  /** Normalized scalar when Azure provides value* properties. */
  value?: string | number | boolean | null;
  /** 0–100 confidence. */
  confidence: number;
  pageNumber?: number;
}

export interface ParsedAzureCustomFormResult {
  pages: OCRPage[];
  model: string;
  docType?: string;
  documentConfidence?: number;
  fields: AzureCustomFormField[];
  selectionMarks: AzureSelectionMark[];
  lines: AzureTextLine[];
  usageInfo?: ParsedAzureDiResult["usageInfo"];
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function confidenceToPercent(raw: number | undefined): number {
  if (raw === undefined) return 0;
  return raw <= 1 ? Math.round(raw * 100) : Math.round(raw);
}

/**
 * Extract a displayable scalar from a DocumentField object.
 * Prefer normalized value* properties, then content.
 */
export function extractCustomFieldValue(
  field: Record<string, unknown>
): string | number | boolean | null {
  const type = asString(field.type)?.toLowerCase() ?? "";

  if (type === "selectionmark") {
    const mark =
      asString(field.valueSelectionMark) ??
      asString(field.value) ??
      asString(field.content);
    if (!mark) return null;
    const normalized = mark.replace(/^:/, "").replace(/:$/, "").toLowerCase();
    if (normalized === "selected" || normalized === "signed") return "selected";
    if (
      normalized === "unselected" ||
      normalized === "unsigned" ||
      normalized === "notselected"
    ) {
      return "unselected";
    }
    return normalized;
  }

  if (type === "selectiongroup") {
    return (
      asString(field.valueSelectionGroup) ??
      asString(field.valueString) ??
      asString(field.content) ??
      null
    );
  }

  if (type === "date") {
    return (
      asString(field.valueDate) ??
      asString(field.valueString) ??
      asString(field.content) ??
      null
    );
  }

  if (type === "number") {
    const n = asNumber(field.valueNumber);
    if (n !== undefined) return n;
    return asString(field.content) ?? null;
  }

  if (type === "integer") {
    const n = asNumber(field.valueInteger);
    if (n !== undefined) return n;
    return asString(field.content) ?? null;
  }

  if (type === "boolean") {
    if (typeof field.valueBoolean === "boolean") return field.valueBoolean;
    return asString(field.content) ?? null;
  }

  if (type === "signature") {
    return (
      asString(field.valueSignature) ??
      asString(field.content) ??
      (field.value ? String(field.value) : null)
    );
  }

  return (
    asString(field.valueString) ??
    asString(field.content) ??
    (field.value != null &&
    (typeof field.value === "string" ||
      typeof field.value === "number" ||
      typeof field.value === "boolean")
      ? field.value
      : null)
  );
}

function pageNumberFromField(
  field: Record<string, unknown>
): number | undefined {
  const regions = Array.isArray(field.boundingRegions)
    ? field.boundingRegions
    : [];
  for (const region of regions) {
    if (!region || typeof region !== "object") continue;
    const page = asNumber((region as Record<string, unknown>).pageNumber);
    if (page !== undefined) return page;
  }
  return undefined;
}

/**
 * PlantExpand JSR scaffold field names → GoldSpec / preExtracted keys.
 * Custom model labels should prefer these names when labeling training data.
 */
export const PLANTEXPAND_JSR_FIELD_MAP: Record<string, string> = {
  jobNumber: "jobNumber",
  job_no: "jobNumber",
  JobNumber: "jobNumber",
  serialNumber: "serialNumber",
  asset_no: "serialNumber",
  AssetNumber: "serialNumber",
  dateOfService: "dateOfService",
  date: "dateOfService",
  DateOfService: "dateOfService",
  technicianName: "technicianName",
  engineer_name: "technicianName",
  EngineerName: "technicianName",
  customerName: "customerName",
  makeModel: "makeModel",
  make_model: "makeModel",
  mileageHours: "mileageHours",
  safeToUse: "safeToUse",
  SafeToUse: "safeToUse",
  returnVisit: "returnVisit",
  ReturnVisit: "returnVisit",
  allWorksCompleted: "allWorksCompleted",
  workDescription: "workDescription",
  engineer_comments: "workDescription",
};

/** Checklist choice tokens accepted from selectionGroup / string fields. */
const CHECKLIST_CHOICE_RE = /^(ok|pass|adv\.?|fail|n\/?a|unreadable)$/i;

export function normalizeChecklistChoice(
  raw: string | null | undefined
): "Ok" | "Adv" | "Fail" | "N/A" | "UNREADABLE" | null {
  if (!raw?.trim()) return null;
  const t = raw.trim();
  if (!CHECKLIST_CHOICE_RE.test(t)) return null;
  if (/^(ok|pass)$/i.test(t)) return "Ok";
  if (/^adv\.?$/i.test(t)) return "Adv";
  if (/^fail$/i.test(t)) return "Fail";
  if (/^n\/?a$/i.test(t)) return "N/A";
  return "UNREADABLE";
}

/**
 * Parse Azure DI custom neural analyzeResult into pages + structured fields.
 */
export function parseAzureDiCustomForm(
  raw: unknown
): ParsedAzureCustomFormResult {
  const base = parseAzureDiResponse(raw);

  if (!raw || typeof raw !== "object") {
    return {
      pages: base.pages,
      model: base.model,
      fields: [],
      selectionMarks: base.selectionMarks,
      lines: base.lines,
      usageInfo: base.usageInfo,
    };
  }

  const root = raw as Record<string, unknown>;
  const analyzeResult =
    root.analyzeResult && typeof root.analyzeResult === "object"
      ? (root.analyzeResult as Record<string, unknown>)
      : root;

  const documents = Array.isArray(analyzeResult.documents)
    ? analyzeResult.documents
    : [];

  const fields: AzureCustomFormField[] = [];
  let docType: string | undefined;
  let documentConfidence: number | undefined;

  for (const doc of documents) {
    if (!doc || typeof doc !== "object") continue;
    const d = doc as Record<string, unknown>;
    if (!docType) docType = asString(d.docType);
    if (documentConfidence === undefined) {
      documentConfidence = confidenceToPercent(asNumber(d.confidence));
    }

    const fieldMap =
      d.fields && typeof d.fields === "object"
        ? (d.fields as Record<string, unknown>)
        : {};

    for (const [name, fieldRaw] of Object.entries(fieldMap)) {
      if (!fieldRaw || typeof fieldRaw !== "object") continue;
      const field = fieldRaw as Record<string, unknown>;
      const type = asString(field.type) ?? "string";
      const value = extractCustomFieldValue(field);
      fields.push({
        name,
        type,
        content: asString(field.content),
        value,
        confidence: confidenceToPercent(asNumber(field.confidence)),
        pageNumber: pageNumberFromField(field),
      });
    }
  }

  return {
    pages: base.pages,
    model: base.model,
    docType,
    documentConfidence,
    fields,
    selectionMarks: base.selectionMarks,
    lines: base.lines,
    usageInfo: base.usageInfo,
  };
}

/**
 * Map custom-form fields into GoldSpec-shaped preExtracted entries.
 * Checklist_* selection groups are excluded (handled by selectionMarks voter).
 */
export function customFieldsToPreExtracted(
  fields: AzureCustomFormField[]
): Record<string, { value: string; confidence: number; pageNumber: number }> {
  const out: Record<
    string,
    { value: string; confidence: number; pageNumber: number }
  > = {};

  for (const field of fields) {
    if (/^checklist[_:]/i.test(field.name)) continue;
    const mapped = PLANTEXPAND_JSR_FIELD_MAP[field.name];
    if (!mapped) continue;

    let valueStr: string | null = null;
    if (field.type === "selectionMark" || field.type === "selectionGroup") {
      if (mapped === "safeToUse" || mapped === "returnVisit") {
        const v =
          typeof field.value === "string"
            ? field.value.toLowerCase()
            : String(field.value ?? "");
        if (v === "selected") valueStr = "Yes";
        else if (v === "unselected") valueStr = "No";
        else valueStr = field.content ?? String(field.value ?? "");
      } else {
        valueStr =
          typeof field.value === "string"
            ? field.value
            : (field.content ?? String(field.value ?? ""));
      }
    } else if (field.value != null && field.value !== "") {
      valueStr = String(field.value);
    } else if (field.content) {
      valueStr = field.content;
    }

    if (!valueStr?.trim()) continue;
    out[mapped] = {
      value: valueStr.trim().slice(0, 200),
      confidence: field.confidence,
      pageNumber: field.pageNumber ?? 1,
    };
  }

  return out;
}

/**
 * Convert checklist_* custom fields into row-like choices for the voter.
 */
export function customChecklistFieldsToChoices(
  fields: AzureCustomFormField[]
): Array<{
  label: string;
  choice: "Ok" | "Adv" | "Fail" | "N/A" | "UNREADABLE";
  confidence: number;
  pageNumber: number;
  fieldName: string;
}> {
  const rows: Array<{
    label: string;
    choice: "Ok" | "Adv" | "Fail" | "N/A" | "UNREADABLE";
    confidence: number;
    pageNumber: number;
    fieldName: string;
  }> = [];

  for (const field of fields) {
    if (!/^checklist[_:]/i.test(field.name)) continue;
    const raw =
      typeof field.value === "string"
        ? field.value
        : (field.content ?? String(field.value ?? ""));
    const choice = normalizeChecklistChoice(raw) ?? "UNREADABLE";
    const label = field.name
      .replace(/^checklist[_:]/i, "")
      .replace(/[_-]+/g, " ")
      .trim();
    rows.push({
      label: label || field.name,
      choice,
      confidence: field.confidence,
      pageNumber: field.pageNumber ?? 1,
      fieldName: field.name,
    });
  }

  return rows;
}
