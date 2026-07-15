/**
 * Bridge GoldSpec (live judgment path) → deterministic validateFields.
 *
 * The validation module was previously orphaned from documentProcessor.
 * This adapter maps GoldSpec rules + extracted fields into ValidationRule /
 * ExtractedField shapes, then maps failures back to analyzer Finding so
 * AUTO_PASS cannot promote past real required/format defects.
 */

import type { ExtractedField } from "../extraction/types";
import type { GoldSpec, Finding } from "../analyzer";
import type { ValidationRule, RuleSeverity } from "../specResolver/types";
import { validateFields, type ValidationResult } from "./index";

function mapGoldTypeToValidationType(
  type: GoldSpec["rules"][number]["type"]
): ValidationRule["type"] {
  switch (type) {
    case "presence":
      return "required";
    case "regex":
      return "pattern";
    case "format":
      return "format";
    case "range":
      return "range";
    case "enum":
      return "format";
    default:
      return "required";
  }
}

function severityForRule(rule: GoldSpec["rules"][number]): RuleSeverity {
  if (rule.required) return "critical";
  if (
    rule.type === "format" ||
    rule.type === "regex" ||
    rule.type === "range"
  ) {
    return "major";
  }
  return "minor";
}

function severityToAnalyzer(severity: RuleSeverity): Finding["severity"] {
  switch (severity) {
    case "critical":
      return "S1";
    case "major":
      return "S2";
    case "minor":
      return "S2";
    case "info":
      return "S3";
    default:
      return "S2";
  }
}

function reasonCodeForRule(
  ruleType: ValidationRule["type"],
  message: string
): Finding["reasonCode"] {
  if (ruleType === "required" || /missing|empty/i.test(message)) {
    return "MISSING_FIELD";
  }
  if (ruleType === "format" || ruleType === "pattern" || ruleType === "range") {
    return "INVALID_FORMAT";
  }
  return "OUT_OF_POLICY";
}

/**
 * Convert live GoldSpec rules into deterministic ValidationRule list.
 */
export function goldSpecToValidationRules(spec: GoldSpec): ValidationRule[] {
  return spec.rules.map(rule => {
    const type = mapGoldTypeToValidationType(rule.type);
    const validationRule: ValidationRule = {
      ruleId: rule.id,
      field: rule.field,
      description: rule.description,
      severity: severityForRule(rule),
      type,
      enabled: true,
      tags: ["deterministic", "goldSpec"],
    };
    if (rule.pattern) {
      validationRule.pattern = rule.pattern;
    }
    if (rule.minValue != null || rule.maxValue != null) {
      validationRule.range = {
        min: rule.minValue,
        max: rule.maxValue,
      };
    }
    return validationRule;
  });
}

/**
 * Convert analyzer extractedFields record → Map for validateFields.
 */
export function extractedFieldsToMap(
  fields: Record<
    string,
    { value: string; confidence: number; pageNumber: number }
  >
): Map<string, ExtractedField> {
  const map = new Map<string, ExtractedField>();
  for (const [field, data] of Object.entries(fields)) {
    const confidence01 =
      data.confidence > 1 ? data.confidence / 100 : data.confidence;
    map.set(field, {
      field,
      value: data.value,
      rawValue: data.value,
      confidence: confidence01,
      confidenceLevel:
        confidence01 >= 0.85
          ? "high"
          : confidence01 >= 0.6
            ? "medium"
            : confidence01 > 0
              ? "low"
              : "none",
      pageNumber: data.pageNumber,
      method: "llm",
      normalized: true,
    });
  }
  return map;
}

/**
 * Map deterministic validation failures → analyzer Finding[].
 */
export function validationFindingsToAnalyzer(
  result: ValidationResult
): Finding[] {
  return result.findings.map(f => {
    const severity = severityToAnalyzer(f.severity);
    const reasonCode = reasonCodeForRule(
      // Infer type from message / severity pairing via ruleId look-aside not available;
      // use message heuristics + severity.
      f.severity === "critical" && /missing|empty/i.test(f.message)
        ? "required"
        : "format",
      f.message
    );
    return {
      ruleId: f.ruleId,
      fieldName: f.field,
      severity,
      reasonCode,
      rawSnippet: f.actualValue != null ? String(f.actualValue) : "",
      normalisedSnippet: f.actualValue != null ? String(f.actualValue) : "",
      confidence: 100,
      pageNumber: f.pageNumber ?? 1,
      whyItMatters: f.message,
      suggestedFix:
        f.expectedValue != null
          ? `Expected: ${f.expectedValue}`
          : "Correct the field to satisfy the gold-spec rule.",
      failClass:
        f.severity === "critical" || f.severity === "major"
          ? "major"
          : f.severity === "info"
            ? "informational"
            : "minor",
      blocksOverallPass: f.severity === "critical" || f.severity === "major",
    };
  });
}

export interface DeterministicValidationOutcome {
  result: ValidationResult;
  findings: Finding[];
  /** True when no critical/major validation failures. */
  passed: boolean;
}

/**
 * Run deterministic gold-spec validation against extracted fields.
 */
export function runDeterministicValidation(params: {
  spec: GoldSpec;
  extractedFields: Record<
    string,
    { value: string; confidence: number; pageNumber: number }
  >;
}): DeterministicValidationOutcome {
  const rules = goldSpecToValidationRules(params.spec);
  const fieldMap = extractedFieldsToMap(params.extractedFields);
  const result = validateFields(
    fieldMap,
    rules,
    params.spec.name,
    params.spec.version
  );
  return {
    result,
    findings: validationFindingsToAnalyzer(result),
    passed: result.passed,
  };
}

/**
 * AUTO_PASS gate: only S3 (informational) findings, validation passed,
 * score at/above threshold, no blocking selection marks.
 */
export function canPromoteAutoPass(params: {
  overallResult: "PASS" | "FAIL" | "REVIEW_QUEUE";
  score: number;
  threshold: number;
  findings: Finding[];
  validationPassed: boolean;
  hasBlockingFailMarks: boolean;
  onlyInformational: boolean;
}): boolean {
  return (
    params.overallResult === "REVIEW_QUEUE" &&
    params.score >= params.threshold &&
    params.onlyInformational &&
    params.validationPassed &&
    !params.hasBlockingFailMarks
  );
}
