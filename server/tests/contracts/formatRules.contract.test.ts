/**
 * PX-113: Format Rule Compilation Contract Tests
 *
 * R015 Wave A / PR-C: Verifies validator.ts compiles known human-readable
 * format tokens (e.g. "DD/MM/YYYY", "YYYY-MM-DD") to real regexes instead
 * of treating them as literal regex source via `new RegExp("DD/MM/YYYY")`
 * (which can never match real data). Also verifies the default template's
 * legacy serial/job-number pattern rules (R-003, R-010) are softened so
 * they never false-fail real PlantExpand data.
 *
 * NON-NEGOTIABLES:
 * - "14/07/2026" must validate as a real DD/MM/YYYY date.
 * - "2026-07-14" must validate as a real YYYY-MM-DD date.
 * - Literal token text (e.g. the string "DD/MM/YYYY" itself) must NOT
 *   pass the compiled date regex — proves it isn't literal-string matching.
 * - R-003 / R-010 must be disabled (non-blocking) for realistic
 *   PlantExpand serial/job identifiers that don't fit the legacy shapes.
 */

import { describe, it, expect } from "vitest";
import { validateFields } from "../../services/validation/validator";
import type { ValidationRule } from "../../services/specResolver/types";
import type { ExtractedField } from "../../services/extraction/types";
import { DEFAULT_SPEC_JSON } from "../../services/templateRegistry/defaultTemplate";

function makeField(value: string): ExtractedField {
  return {
    field: "value",
    value,
    confidence: 0.9,
    confidenceLevel: "high",
    method: "pattern",
    normalized: true,
  };
}

function makeRule(overrides: Partial<ValidationRule>): ValidationRule {
  return {
    ruleId: "R-TEST",
    field: "dateOfService",
    description: "test",
    severity: "critical",
    type: "format",
    enabled: true,
    ...overrides,
  };
}

describe("PX-113: format token compilation", () => {
  it("accepts a real DD/MM/YYYY date (14/07/2026)", () => {
    const rule = makeRule({ pattern: "DD/MM/YYYY" });
    const fields = new Map([["dateOfService", makeField("14/07/2026")]]);

    const result = validateFields(fields, [rule], "spec", "1.0.0");

    expect(result.validatedFields[0]!.status).toBe("passed");
    expect(result.findings).toHaveLength(0);
  });

  it("accepts a real YYYY-MM-DD date (2026-07-14)", () => {
    const rule = makeRule({ pattern: "YYYY-MM-DD" });
    const fields = new Map([["dateOfService", makeField("2026-07-14")]]);

    const result = validateFields(fields, [rule], "spec", "1.0.0");

    expect(result.validatedFields[0]!.status).toBe("passed");
  });

  it("accepts a real HH:MM time (09:30)", () => {
    const rule = makeRule({ field: "timeIn", pattern: "HH:MM" });
    const fields = new Map([["timeIn", makeField("09:30")]]);

    const result = validateFields(fields, [rule], "spec", "1.0.0");

    expect(result.validatedFields[0]!.status).toBe("passed");
  });

  it("rejects an invalid date string for DD/MM/YYYY", () => {
    const rule = makeRule({ pattern: "DD/MM/YYYY" });
    const fields = new Map([["dateOfService", makeField("not a date")]]);

    const result = validateFields(fields, [rule], "spec", "1.0.0");

    expect(result.validatedFields[0]!.status).toBe("failed");
  });

  it("does NOT literal-string-match the token text itself against the compiled regex", () => {
    // Sanity check: if the token were passed straight to `new RegExp(...)`
    // it would compile to a matcher for the literal text "DD/MM/YYYY" and
    // WOULD match the string "DD/MM/YYYY" itself. The compiled date regex
    // must reject it, proving it's a real date pattern, not literal text.
    const rule = makeRule({ pattern: "DD/MM/YYYY" });
    const fields = new Map([["dateOfService", makeField("DD/MM/YYYY")]]);

    const result = validateFields(fields, [rule], "spec", "1.0.0");

    expect(result.validatedFields[0]!.status).toBe("failed");
  });

  it("still treats unknown patterns as literal regex source (pattern-type rules)", () => {
    const rule = makeRule({
      field: "serialNumber",
      type: "pattern",
      pattern: "^SN-\\d{5}-[A-Z]{2}$",
    });
    const fields = new Map([["serialNumber", makeField("SN-12345-AB")]]);

    const result = validateFields(fields, [rule], "spec", "1.0.0");

    expect(result.validatedFields[0]!.status).toBe("passed");
  });
});

describe("PX-113: default template R-003 / R-010 softened for real PlantExpand data", () => {
  it("R-003 (serial number legacy pattern) is disabled", () => {
    const rule = DEFAULT_SPEC_JSON.rules.find(r => r.ruleId === "R-003");
    expect(rule).toBeDefined();
    expect(rule!.enabled).toBe(false);
  });

  it("R-010 (job number legacy pattern) is disabled", () => {
    const rule = DEFAULT_SPEC_JSON.rules.find(r => r.ruleId === "R-010");
    expect(rule).toBeDefined();
    expect(rule!.enabled).toBe(false);
  });

  it("real PlantExpand-style serial/job identifiers never false-fail via validateFields", () => {
    const rules = DEFAULT_SPEC_JSON.rules.filter(
      r => r.ruleId === "R-003" || r.ruleId === "R-010"
    ) as unknown as ValidationRule[];
    const fields = new Map<string, ExtractedField>([
      ["serialNumber", makeField("WX65VMH")],
      ["jobNumber", makeField("218")],
    ]);

    const result = validateFields(fields, rules, "spec", "1.0.0");

    expect(result.passed).toBe(true);
    expect(result.summary.criticalFailures).toBe(0);
    expect(result.summary.majorFailures).toBe(0);
    expect(result.validatedFields.every(f => f.status === "skipped")).toBe(
      true
    );
  });

  it("date-of-service rule (R-002, DD/MM/YYYY) still validates real UK dates end-to-end", () => {
    const rule = DEFAULT_SPEC_JSON.rules.find(
      r => r.ruleId === "R-002"
    ) as unknown as ValidationRule | undefined;
    expect(rule).toBeDefined();
    const fields = new Map([["dateOfService", makeField("14/07/2026")]]);

    const result = validateFields(fields, [rule!], "spec", "1.0.0");

    expect(result.passed).toBe(true);
    expect(result.validatedFields[0]!.status).toBe("passed");
  });
});
