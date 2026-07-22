/**
 * Pack v1 — document raster path + interim SYSTEM demote on image_qa_unavailable.
 */

import { describe, expect, it } from "vitest";
import { demoteSignatureSystemWhenImageQaUnavailable } from "../../services/selectionMarks/signOffHonesty";
import type { Finding } from "../../services/analyzer";

function sigFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    ruleId: "SYSTEM",
    fieldName: "engineerSignOff",
    severity: "S1",
    reasonCode: "MISSING_FIELD",
    rawSnippet: "Absent",
    normalisedSnippet: "Absent",
    confidence: 40,
    pageNumber: 1,
    whyItMatters: "Signature missing",
    suggestedFix: "Sign the form",
    ...overrides,
  };
}

describe("Pack v1 document-image honesty", () => {
  it("demotes LOLER signature SYSTEM major when skippedReason=image_qa_unavailable", () => {
    const cleaned = demoteSignatureSystemWhenImageQaUnavailable(
      [sigFinding()],
      {
        skippedReason: "image_qa_unavailable",
        templateSlug: "loler-examination-v1",
      }
    );
    expect(cleaned[0]?.severity).toBe("S2");
    expect(cleaned[0]?.honestyDemoted).toBe(true);
    expect(cleaned[0]?.whyItMatters).toMatch(/image_qa_unavailable/i);
  });

  it("demotes PTO signature SYSTEM major on image_qa_unavailable", () => {
    const cleaned = demoteSignatureSystemWhenImageQaUnavailable(
      [sigFinding({ fieldName: "Technician Signature" })],
      {
        skippedReason: "image_qa_unavailable",
        templateSlug: "pto-service-v1",
      }
    );
    expect(cleaned[0]?.severity).toBe("S2");
    expect(cleaned[0]?.honestyDemoted).toBe(true);
  });

  it("does not demote job-summary on image_qa_unavailable", () => {
    const cleaned = demoteSignatureSystemWhenImageQaUnavailable(
      [sigFinding()],
      {
        skippedReason: "image_qa_unavailable",
        templateSlug: "job-summary-v1",
      }
    );
    expect(cleaned[0]?.severity).toBe("S1");
    expect(cleaned[0]?.honestyDemoted).toBeUndefined();
  });

  it("does not demote when skip reason is unrelated", () => {
    const cleaned = demoteSignatureSystemWhenImageQaUnavailable(
      [sigFinding()],
      {
        skippedReason: "FEATURE_VLM_VERIFICATION off",
        templateSlug: "loler-examination-v1",
      }
    );
    expect(cleaned[0]?.severity).toBe("S1");
  });

  it("documentProcessor wires buildDocumentImageBundle into verifySignatureInk", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const src = await fs.readFile(
      path.resolve(
        __dirname,
        "../../services/documentProcessor.ts"
      ),
      "utf8"
    );
    expect(src).toContain("buildDocumentImageBundle");
    expect(src).toContain("demoteSignatureSystemWhenImageQaUnavailable");
    expect(src).toContain("evaluateDateCompliance");
    expect(src).toMatch(/cropImages:\s*\n\s*Object\.keys\(documentImageBundle/);
  });
});
