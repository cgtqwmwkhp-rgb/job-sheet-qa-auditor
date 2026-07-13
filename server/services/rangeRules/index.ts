/**
 * Evaluate template "range" threshold rules (min/max/between/under + unit).
 *
 * Example (wheel nut torque):
 *   field wheelNutTorque must be between 100–130 NM
 */

import type { Finding } from "../analyzer";
import type { FieldSpec, RuleSpec } from "../templateRegistry/types";

export const RANGE_RULE_PREFIX = "RANGE";

function severityToFinding(
  severity: RuleSpec["severity"]
): Finding["severity"] {
  if (severity === "critical") return "S0";
  if (severity === "major") return "S1";
  if (severity === "minor") return "S2";
  return "S3";
}

function toNumber(raw: number | string | undefined): number | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const n = typeof raw === "number" ? raw : parseFloat(String(raw).trim());
  return Number.isFinite(n) ? n : undefined;
}

/** Strip known unit suffixes and parse the first numeric token. */
export function parseNumericFieldValue(
  value: unknown,
  unit?: string
): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  let text = String(value).trim();
  if (!text) return null;

  if (unit) {
    const unitEsc = unit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    text = text.replace(new RegExp(`\\b${unitEsc}\\b`, "gi"), " ");
  }
  // Common torque / pressure / depth suffixes
  text = text.replace(
    /\b(n\.?\s*m\.?|nm|newton[\s-]*metres?|psi|bar|mm|kg|kpa|°?c)\b/gi,
    " "
  );

  const match = text.match(/-?\d+(?:[.,]\d+)?/);
  if (!match) return null;
  const n = parseFloat(match[0].replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function humanizeFieldKey(field: string): string {
  return field
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim();
}

/**
 * Pull a labeled numeric value from full OCR/document text.
 * Matches lines like "Wheel Nut Torque (NM): 115".
 */
export function extractLabeledNumericFromText(
  text: string,
  field: string,
  options?: {
    unit?: string;
    labels?: string[];
    fieldSpecs?: FieldSpec[];
  }
): number | null {
  if (!text?.trim() || !field) return null;

  const spec = options?.fieldSpecs?.find(f => f.field === field);
  const labels = Array.from(
    new Set(
      [
        field,
        humanizeFieldKey(field),
        spec?.label,
        ...(spec?.aliases ?? []),
        ...(spec?.extractionHints ?? []),
        ...(options?.labels ?? []),
      ]
        .filter(Boolean)
        .map(s => String(s).trim())
        .filter(s => s.length >= 2)
    )
  );

  for (const label of labels) {
    const esc = escapeRegExp(label);
    const unitHint = options?.unit
      ? `(?:\\s*\\(?\\s*${escapeRegExp(options.unit)}\\s*\\)?)?`
      : "(?:\\s*\\([^)]{0,12}\\))?";
    const re = new RegExp(
      `${esc}${unitHint}\\s*[:\\-]?\\s*(-?\\d+(?:[.,]\\d+)?)`,
      "i"
    );
    const m = text.match(re);
    if (m?.[1]) {
      const n = parseFloat(m[1].replace(",", "."));
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function formatBounds(rule: RuleSpec): string {
  const min = toNumber(rule.range?.min);
  const max = toNumber(rule.range?.max);
  const unit = rule.unit ? ` ${rule.unit}` : "";
  const mode = rule.boundsMode;

  if (mode === "under" && max !== undefined) return `≤ ${max}${unit}`;
  if (mode === "at_least" && min !== undefined) return `≥ ${min}${unit}`;
  if (mode === "over" && min !== undefined) return `> ${min}${unit}`;
  if (min !== undefined && max !== undefined) {
    return `${min}${unit}–${max}${unit}`.replace(`${unit}–`, `${unit} – `);
  }
  if (min !== undefined) return `≥ ${min}${unit}`;
  if (max !== undefined) return `≤ ${max}${unit}`;
  return "configured bounds";
}

function valuePasses(rule: RuleSpec, value: number): boolean {
  const min = toNumber(rule.range?.min);
  const max = toNumber(rule.range?.max);
  const mode = rule.boundsMode;

  if (mode === "under") {
    if (max === undefined) return true;
    return value <= max;
  }
  if (mode === "at_least") {
    if (min === undefined) return true;
    return value >= min;
  }
  if (mode === "over") {
    if (min === undefined) return true;
    return value > min;
  }
  if (mode === "between") {
    if (min !== undefined && value < min) return false;
    if (max !== undefined && value > max) return false;
    return min !== undefined || max !== undefined;
  }

  // Classic range: enforce any present bound
  if (min !== undefined && value < min) return false;
  if (max !== undefined && value > max) return false;
  return true;
}

export function formatRangeRule(rule: Pick<
  RuleSpec,
  "field" | "range" | "boundsMode" | "unit"
>): string {
  return `${rule.field} must be ${formatBounds(rule as RuleSpec)}`;
}

/**
 * Evaluate enabled range/threshold rules against extracted field map.
 * Missing/non-numeric values do not fail the rule (presence is separate).
 */
export function evaluateRangeRules(
  rules: RuleSpec[] | undefined,
  fields: Record<string, unknown>
): Finding[] {
  if (!rules?.length) return [];

  const findings: Finding[] = [];

  for (const rule of rules) {
    if (!rule.enabled || rule.type !== "range") continue;
    if (!rule.field) continue;
    const min = toNumber(rule.range?.min);
    const max = toNumber(rule.range?.max);
    if (min === undefined && max === undefined) continue;

    const raw = fields[rule.field];
    const value = parseNumericFieldValue(raw, rule.unit);
    if (value === null) continue;

    if (valuePasses(rule, value)) continue;

    const bounds = formatBounds(rule);
    findings.push({
      ruleId: rule.ruleId || `${RANGE_RULE_PREFIX}-${rule.field}`,
      fieldName: rule.field,
      severity: severityToFinding(rule.severity),
      reasonCode: "OUT_OF_POLICY",
      rawSnippet: `${rule.field}=${String(raw)} (parsed ${value}${rule.unit ? ` ${rule.unit}` : ""}); expected ${bounds}`,
      normalisedSnippet: String(value),
      confidence: 92,
      pageNumber: 1,
      whyItMatters:
        rule.description ||
        `Threshold: ${rule.field} must be ${bounds}.`,
      suggestedFix: `Correct ${rule.field} to satisfy ${bounds}.`,
    });
  }

  return findings;
}

/**
 * Enrich a field map with OCR-parsed numerics for enabled range rules
 * when the ensemble/LLM map is missing that field.
 */
export function enrichFieldMapFromRangeRules(
  fields: Record<string, unknown>,
  rules: RuleSpec[] | undefined,
  documentText: string,
  fieldSpecs?: FieldSpec[]
): Record<string, unknown> {
  if (!rules?.length || !documentText) return fields;
  const next = { ...fields };

  for (const rule of rules) {
    if (!rule.enabled || rule.type !== "range" || !rule.field) continue;
    if (next[rule.field] != null && String(next[rule.field]).trim() !== "") {
      continue;
    }
    const parsed = extractLabeledNumericFromText(documentText, rule.field, {
      unit: rule.unit,
      fieldSpecs,
    });
    if (parsed !== null) {
      next[rule.field] = rule.unit ? `${parsed} ${rule.unit}` : parsed;
    }
  }

  return next;
}
