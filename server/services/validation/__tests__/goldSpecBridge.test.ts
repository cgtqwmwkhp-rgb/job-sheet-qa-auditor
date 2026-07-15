import { describe, expect, it } from "vitest";
import type { GoldSpec, Finding } from "../../analyzer";
import {
  canPromoteAutoPass,
  goldSpecToValidationRules,
  runDeterministicValidation,
} from "../goldSpecBridge";

const SPEC: GoldSpec = {
  name: "Test Spec",
  version: "1.0.0",
  rules: [
    {
      id: "R-REQ",
      field: "customerSignature",
      type: "presence",
      required: true,
      description: "Customer signature required",
    },
    {
      id: "R-FMT",
      field: "serialNumber",
      type: "regex",
      required: true,
      description: "Serial pattern",
      pattern: "^SN-\\d{5}-[A-Z]{2}$",
    },
  ],
};

describe("goldSpecBridge deterministic validation", () => {
  it("maps gold rules to validation rules", () => {
    const rules = goldSpecToValidationRules(SPEC);
    expect(rules).toHaveLength(2);
    expect(rules[0]!.type).toBe("required");
    expect(rules[0]!.severity).toBe("critical");
    expect(rules[1]!.type).toBe("pattern");
  });

  it("fails closed when required fields are missing", () => {
    const outcome = runDeterministicValidation({
      spec: SPEC,
      extractedFields: {},
    });
    expect(outcome.passed).toBe(false);
    expect(outcome.findings.length).toBeGreaterThan(0);
    expect(outcome.findings.some(f => f.reasonCode === "MISSING_FIELD")).toBe(
      true
    );
    expect(
      outcome.findings.every(f => f.severity === "S1" || f.severity === "S2")
    ).toBe(true);
  });

  it("passes when required fields satisfy rules", () => {
    const outcome = runDeterministicValidation({
      spec: SPEC,
      extractedFields: {
        customerSignature: {
          value: "Present",
          confidence: 90,
          pageNumber: 1,
        },
        serialNumber: {
          value: "SN-12345-AB",
          confidence: 95,
          pageNumber: 1,
        },
      },
    });
    expect(outcome.passed).toBe(true);
    expect(outcome.findings).toHaveLength(0);
  });

  it("blocks AUTO_PASS when validation failed or S2 remains", () => {
    const s3Only: Finding[] = [
      {
        ruleId: "info",
        fieldName: "note",
        severity: "S3",
        reasonCode: "LOW_CONFIDENCE",
        rawSnippet: "",
        normalisedSnippet: "",
        confidence: 80,
        pageNumber: 1,
        whyItMatters: "soft",
        suggestedFix: "n/a",
      },
    ];
    const s2Soft: Finding[] = [
      {
        ...s3Only[0]!,
        severity: "S2",
      },
    ];

    expect(
      canPromoteAutoPass({
        overallResult: "REVIEW_QUEUE",
        score: 90,
        threshold: 80,
        findings: s3Only,
        validationPassed: true,
        hasBlockingFailMarks: false,
        onlyInformational: true,
      })
    ).toBe(true);

    expect(
      canPromoteAutoPass({
        overallResult: "REVIEW_QUEUE",
        score: 90,
        threshold: 80,
        findings: s3Only,
        validationPassed: false,
        hasBlockingFailMarks: false,
        onlyInformational: true,
      })
    ).toBe(false);

    expect(
      canPromoteAutoPass({
        overallResult: "REVIEW_QUEUE",
        score: 90,
        threshold: 80,
        findings: s2Soft,
        validationPassed: true,
        hasBlockingFailMarks: false,
        onlyInformational: false,
      })
    ).toBe(false);
  });
});
