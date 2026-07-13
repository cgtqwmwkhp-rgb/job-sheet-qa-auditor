/**
 * Evaluate template "implies" (if/then) consistency rules.
 *
 * Example (VOR-style):
 *   when vorStatus = Present → safeToUse must be No
 */

import type { Finding } from "../analyzer";
import type { RuleSpec } from "../templateRegistry/types";

export const IMPLIES_RULE_PREFIX = "IMPLIES";

function normalizeComparable(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value).trim().toLowerCase();
}

function valuesMatch(actual: unknown, expected: string): boolean {
  const a = normalizeComparable(actual);
  const e = normalizeComparable(expected);
  if (!e) return a.length > 0;
  if (a === e) return true;
  // Friendly aliases
  const truthy = new Set(["true", "yes", "y", "present", "1"]);
  const falsy = new Set(["false", "no", "n", "absent", "0"]);
  if (truthy.has(e) && truthy.has(a)) return true;
  if (falsy.has(e) && falsy.has(a)) return true;
  return false;
}

function severityToFinding(
  severity: RuleSpec["severity"]
): Finding["severity"] {
  if (severity === "critical") return "S0";
  if (severity === "major") return "S1";
  if (severity === "minor") return "S2";
  return "S3";
}

/**
 * Evaluate enabled implies rules against extracted field map.
 */
export function evaluateImpliesRules(
  rules: RuleSpec[] | undefined,
  fields: Record<string, unknown>
): Finding[] {
  if (!rules?.length) return [];

  const findings: Finding[] = [];

  for (const rule of rules) {
    if (!rule.enabled || rule.type !== "implies") continue;
    const whenField = rule.whenField;
    const thenField = rule.thenField ?? rule.field;
    const whenValue = rule.whenValue ?? "";
    const thenValue = rule.thenValue ?? "";
    if (!whenField || !thenField) continue;

    const whenActual = fields[whenField];
    if (!valuesMatch(whenActual, whenValue)) continue;

    const thenActual = fields[thenField];
    if (valuesMatch(thenActual, thenValue)) continue;

    findings.push({
      ruleId: rule.ruleId || `${IMPLIES_RULE_PREFIX}-${whenField}-${thenField}`,
      fieldName: thenField,
      severity: severityToFinding(rule.severity),
      reasonCode: "OUT_OF_POLICY",
      rawSnippet: `If ${whenField}=${whenValue} then ${thenField} must be ${thenValue} (got ${String(thenActual ?? "missing")})`,
      normalisedSnippet: String(thenActual ?? ""),
      confidence: 90,
      pageNumber: 1,
      whyItMatters:
        rule.description ||
        `Consistency: when ${whenField} is ${whenValue}, ${thenField} must be ${thenValue}.`,
      suggestedFix: `Set ${thenField} to ${thenValue} (or correct ${whenField}).`,
    });
  }

  return findings;
}

/** Build a human-readable if/then sentence for Studio UI. */
export function formatImpliesRule(rule: Pick<
  RuleSpec,
  "whenField" | "whenValue" | "thenField" | "thenValue" | "field"
>): string {
  const whenField = rule.whenField ?? "?";
  const whenValue = rule.whenValue ?? "?";
  const thenField = rule.thenField ?? rule.field ?? "?";
  const thenValue = rule.thenValue ?? "?";
  return `If ${whenField} is “${whenValue}” → ${thenField} must be “${thenValue}”`;
}
