import { describe, it, expect } from "vitest";
import { computeDocumentationQualityScore } from "../../services/documentationQuality";
import type { Finding } from "../../services/analyzer";

function finding(
  partial: Partial<Finding> & Pick<Finding, "fieldName" | "severity">
): Finding {
  return {
    ruleId: partial.ruleId ?? "T",
    fieldName: partial.fieldName,
    severity: partial.severity,
    reasonCode: partial.reasonCode ?? "INCOMPLETE_EVIDENCE",
    rawSnippet: partial.rawSnippet ?? "",
    normalisedSnippet: partial.normalisedSnippet ?? "",
    confidence: partial.confidence ?? 90,
    pageNumber: partial.pageNumber ?? 1,
    whyItMatters: partial.whyItMatters ?? "test",
    suggestedFix: partial.suggestedFix ?? "test",
  };
}

describe("documentationQuality", () => {
  it("scores 100 when only Passed/informational findings exist", () => {
    const result = computeDocumentationQualityScore(
      [
        finding({ fieldName: "vorStatus", severity: "S3" }),
        finding({
          fieldName: "OCR Confidence",
          severity: "S2",
          reasonCode: "LOW_CONFIDENCE",
        }),
      ],
      { llmConfidence: 100 }
    );
    expect(result.score).toBe(100);
    expect(result.llmConfidence).toBe(100);
  });

  it("deducts 15 for a single S1 engineer-comments Issue (QOGRX3-like)", () => {
    const result = computeDocumentationQualityScore(
      [
        finding({ fieldName: "Works Completion", severity: "S3" }),
        finding({
          fieldName: "Engineer Comments (Failure Path)",
          severity: "S1",
          reasonCode: "INCOMPLETE_EVIDENCE",
        }),
      ],
      { llmConfidence: 100, overallResult: "FAIL" }
    );
    expect(result.score).toBe(85);
    expect(result.penalties).toHaveLength(1);
  });

  it("stacks penalties for multiple Issues", () => {
    const result = computeDocumentationQualityScore([
      finding({ fieldName: "VOR ↔ Safe to Use", severity: "S1" }),
      finding({ fieldName: "Return Visit Required", severity: "S1" }),
      finding({ fieldName: "Critical safety", severity: "S0" }),
    ]);
    expect(result.score).toBe(100 - 15 - 15 - 25);
  });
});
