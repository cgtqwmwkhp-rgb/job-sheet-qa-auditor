/**
 * Wave-6 P1 — Issues / AUTO_PASS honesty.
 * PHOTO-C014 and PARTS-C022 must stay Issues; honesty rules block AUTO_PASS.
 */

import { describe, it, expect } from "vitest";
import {
  applyAuditPolicy,
  classifyFinding,
  classifyFindings,
  DEFAULT_AUDIT_POLICY,
} from "../../services/auditPolicy";
import {
  canPromoteAutoPass,
  findingsBlockAutoPass,
} from "../../services/validation/goldSpecBridge";
import type { Finding } from "../../services/analyzer";

function finding(
  partial: Partial<Finding> & Pick<Finding, "fieldName" | "severity" | "ruleId">
): Finding {
  return {
    ruleId: partial.ruleId,
    fieldName: partial.fieldName,
    severity: partial.severity,
    reasonCode: partial.reasonCode ?? "INCOMPLETE_EVIDENCE",
    rawSnippet: partial.rawSnippet ?? "",
    normalisedSnippet: partial.normalisedSnippet ?? "",
    confidence: partial.confidence ?? 80,
    pageNumber: partial.pageNumber ?? 1,
    whyItMatters: partial.whyItMatters ?? "test",
    suggestedFix: partial.suggestedFix ?? "test",
  };
}

describe("Wave-6 Issues honesty", () => {
  it("PHOTO-C014 with LOW_CONFIDENCE still classifies as minor (Issues)", () => {
    const f = finding({
      ruleId: "PHOTO-C014",
      fieldName: "Before/After Pair Compare",
      severity: "S2",
      reasonCode: "LOW_CONFIDENCE",
    });
    expect(classifyFinding(f, "job-summary-v1", DEFAULT_AUDIT_POLICY)).toBe(
      "minor"
    );
    const classified = classifyFindings(
      [f],
      "job-summary-v1",
      DEFAULT_AUDIT_POLICY
    );
    expect(classified[0].failClass).toBe("minor");
    expect(classified[0].severity).toBe("S2");
  });

  it("PARTS-C022 seeds as minor and stays Issues after policy", () => {
    const rule = DEFAULT_AUDIT_POLICY.forms["job-summary-v1"].rules.find(
      r => r.ruleId === "PARTS-C022"
    );
    expect(rule?.failClass).toBe("minor");

    const f = finding({
      ruleId: "PARTS-C022",
      fieldName: "Parts Used",
      severity: "S2",
      reasonCode: "INCOMPLETE_EVIDENCE",
    });
    const applied = applyAuditPolicy({
      findings: [f],
      formFamily: "job-summary-v1",
      policy: DEFAULT_AUDIT_POLICY,
      currentResult: "PASS",
    });
    expect(applied.findings[0].failClass).toBe("minor");
    expect(applied.findings[0].severity).toBe("S2");
  });

  it("AUTO_PASS blocked by FAULT-C010 / ATTR-C010 / PARTS-C022 / PHOTO-C014", () => {
    for (const ruleId of [
      "FAULT-C010",
      "ATTR-C010",
      "PARTS-C020",
      "PARTS-C022",
      "PHOTO-C014",
    ]) {
      const findings = [
        finding({
          ruleId,
          fieldName: "Honesty",
          severity: "S3", // even if remapped soft
        }),
      ];
      expect(findingsBlockAutoPass(findings)).toBe(true);
      expect(
        canPromoteAutoPass({
          overallResult: "REVIEW_QUEUE",
          score: 95,
          threshold: 80,
          findings,
          validationPassed: true,
          hasBlockingFailMarks: false,
          onlyInformational: true,
        })
      ).toBe(false);
    }
  });

  it("PX-067: ATTR-C011 (unmatched engineer name) no longer blocks AUTO_PASS", () => {
    const findings = [
      finding({
        ruleId: "ATTR-C011",
        fieldName: "Engineer Attribution (Unmatched)",
        severity: "S2",
      }),
    ];
    expect(findingsBlockAutoPass(findings)).toBe(false);
    expect(
      canPromoteAutoPass({
        overallResult: "REVIEW_QUEUE",
        score: 95,
        threshold: 80,
        findings,
        validationPassed: true,
        hasBlockingFailMarks: false,
        onlyInformational: true,
      })
    ).toBe(true);
  });

  it("AUTO_PASS still allowed for pure informational PARTS-C013 / COMMENT-C041", () => {
    const findings = [
      finding({
        ruleId: "PARTS-C013",
        fieldName: "Parts Used",
        severity: "S3",
        reasonCode: "LOW_CONFIDENCE",
      }),
      finding({
        ruleId: "COMMENT-C041",
        fieldName: "Engineer Comments",
        severity: "S3",
        reasonCode: "LOW_CONFIDENCE",
      }),
    ];
    expect(findingsBlockAutoPass(findings)).toBe(false);
    expect(
      canPromoteAutoPass({
        overallResult: "REVIEW_QUEUE",
        score: 95,
        threshold: 80,
        findings,
        validationPassed: true,
        hasBlockingFailMarks: false,
        onlyInformational: true,
      })
    ).toBe(true);
  });
});
