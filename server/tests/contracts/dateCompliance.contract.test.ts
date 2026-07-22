/**
 * Pack v1 — DATE-C020 (LOLER next exam) + DATE-C010 (inspection shadow).
 */

import { describe, expect, it } from "vitest";
import { evaluateDateCompliance } from "../../services/dateCompliance";
import { extractField } from "../../services/extraction/criticalFieldExtractor";
import { classifyFinding } from "../../services/auditPolicy";
import { DEFAULT_AUDIT_POLICY } from "../../services/auditPolicy/defaults";

describe("dateCompliance Pack v1", () => {
  const now = new Date("2026-07-21T12:00:00.000Z");

  it("DATE-C020 major when LOLER Next Examination Due is missing", () => {
    const result = evaluateDateCompliance({
      text: `
        LOLER Thorough Examination Report
        Asset: WINCH-45
        Date of Examination: 01/01/2026
        Safe to Use: Yes
      `,
      templateSlug: "loler-examination-v1",
      now,
    });
    const c020 = result.findings.filter(f => f.ruleId === "DATE-C020");
    expect(c020.length).toBe(1);
    expect(c020[0]?.severity).toBe("S1");
    // Exam date 01/01/2026 + 6m lapsed by fixture `now` → OUT_OF_POLICY
    expect(["MISSING_FIELD", "OUT_OF_POLICY"]).toContain(c020[0]?.reasonCode);
    expect(
      classifyFinding(c020[0]!, "loler-examination-v1", DEFAULT_AUDIT_POLICY)
    ).toBe("major");
  });

  it("DATE-C020 major when Next Examination Due is overdue", () => {
    const result = evaluateDateCompliance({
      text: `
        LOLER Thorough Examination
        Date of Examination: 01/01/2025
        Next Examination Due: 01/06/2025
      `,
      templateSlug: "loler-examination-v1",
      now,
    });
    const c020 = result.findings.filter(f => f.ruleId === "DATE-C020");
    expect(c020.length).toBe(1);
    expect(c020[0]?.reasonCode).toBe("OUT_OF_POLICY");
  });

  it("DATE-C020 silent when next exam due is in the future", () => {
    const result = evaluateDateCompliance({
      text: `
        LOLER Thorough Examination
        Date of Examination: 01/06/2026
        Next Examination Due: 01/12/2026
      `,
      templateSlug: "loler-examination-v1",
      now,
    });
    expect(result.findings.filter(f => f.ruleId === "DATE-C020")).toHaveLength(
      0
    );
  });

  it("extracts Next Examination Due via criticalFieldExtractor expiryDate", () => {
    const extracted = extractField(
      "expiryDate",
      "Next Examination Due: 15/09/2026\nAsset WINCH"
    );
    expect(extracted?.value).toMatch(/2026/);
  });

  it("DATE-C010 informational shadow when Next Service Date missing on job-summary", () => {
    const result = evaluateDateCompliance({
      text: `
        Job Summary Sheet
        Asset: 110V-GEN
        Next Service Date:
        Safe to Use: Yes
      `,
      templateSlug: "job-summary-v1",
      now,
    });
    const c010 = result.findings.filter(f => f.ruleId === "DATE-C010");
    expect(c010.length).toBe(1);
    expect(c010[0]?.severity).toBe("S3");
    expect(
      classifyFinding(c010[0]!, "job-summary-v1", DEFAULT_AUDIT_POLICY)
    ).toBe("informational");
  });

  it("DATE-C010 does not emit on LOLER (DATE-C020 owns that family)", () => {
    const result = evaluateDateCompliance({
      text: `
        LOLER Thorough Examination
        Next Service Date: 01/01/2020
      `,
      templateSlug: "loler-examination-v1",
      now,
    });
    expect(result.findings.some(f => f.ruleId === "DATE-C010")).toBe(false);
  });
});
