/**
 * Photo evidence consistency scaffold contracts.
 */

import { describe, it, expect } from "vitest";
import { evaluatePhotoEvidenceConsistency } from "../../services/photoEvidence";
import { DEFAULT_AUDIT_POLICY } from "../../services/auditPolicy/defaults";

const JOB_SHEET_WITH_PARTS_AND_REPAIRS = `
Job Summary Report
Asset No: BN21ACO_TL
Make/Model: TAILLIFT

Repairs Required: Replace cracked hinge assembly on tail lift platform.

Parts Used: 1x hinge assembly PN-4421, 2x M12 bolts

Technician Signature
`;

const JOB_SHEET_NO_PARTS_NO_REPAIRS = `
Job Summary Report
Asset No: BN21ACO_TL
Make/Model: TAILLIFT

Repairs Required: None

Parts Used: N/A

Technician Signature
`;

const JOB_SHEET_PARTS_ONLY = `
Job Summary Report
Asset No: XY12DEF

Parts Used: 1x oil filter, 3L engine oil

Repairs Required:

Technician Signature
`;

const JOB_SHEET_REPAIRS_ONLY = `
Job Summary Report
Asset No: ZZ99ABC

Repairs Required: Replaced nearside brake pads and discs.

Parts Used: None

Technician Signature
`;

describe("photoEvidenceConsistency", () => {
  it("emits PHOTO-C010 when both Parts Used and Repairs Required have content", () => {
    const result = evaluatePhotoEvidenceConsistency(
      JOB_SHEET_WITH_PARTS_AND_REPAIRS
    );

    expect(result.hasPartsOrRepairs).toBe(true);
    expect(result.partsUsedPresent).toBe(true);
    expect(result.repairsRequiredPresent).toBe(true);
    expect(result.findings).toHaveLength(1);

    const finding = result.findings[0];
    expect(finding.ruleId).toBe("PHOTO-C010");
    expect(finding.fieldName).toBe("Photo Evidence");
    expect(finding.severity).toBe("S2");
    expect(finding.reasonCode).toBe("INCOMPLETE_EVIDENCE");
    expect(finding.confidence).toBeGreaterThanOrEqual(50);
  });

  it("emits PHOTO-C010 when only Parts Used is present", () => {
    const result = evaluatePhotoEvidenceConsistency(JOB_SHEET_PARTS_ONLY);

    expect(result.hasPartsOrRepairs).toBe(true);
    expect(result.partsUsedPresent).toBe(true);
    expect(result.repairsRequiredPresent).toBe(false);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].ruleId).toBe("PHOTO-C010");
  });

  it("emits PHOTO-C010 when only Repairs Required is present", () => {
    const result = evaluatePhotoEvidenceConsistency(JOB_SHEET_REPAIRS_ONLY);

    expect(result.hasPartsOrRepairs).toBe(true);
    expect(result.partsUsedPresent).toBe(false);
    expect(result.repairsRequiredPresent).toBe(true);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].ruleId).toBe("PHOTO-C010");
  });

  it("emits no findings when neither Parts Used nor Repairs Required has content", () => {
    const result = evaluatePhotoEvidenceConsistency(
      JOB_SHEET_NO_PARTS_NO_REPAIRS
    );

    expect(result.hasPartsOrRepairs).toBe(false);
    expect(result.findings).toHaveLength(0);
    expect(result.summary).toMatch(/skipped/i);
  });

  it("finding includes actionable whyItMatters and suggestedFix", () => {
    const result = evaluatePhotoEvidenceConsistency(
      JOB_SHEET_WITH_PARTS_AND_REPAIRS
    );
    const finding = result.findings[0];

    expect(finding.whyItMatters).toBeTruthy();
    expect(finding.whyItMatters.length).toBeGreaterThan(20);
    expect(finding.suggestedFix).toBeTruthy();
    expect(finding.suggestedFix!.length).toBeGreaterThan(10);
  });

  it("rawSnippet captures the triggering section content", () => {
    const result = evaluatePhotoEvidenceConsistency(
      JOB_SHEET_WITH_PARTS_AND_REPAIRS
    );
    const finding = result.findings[0];

    expect(finding.rawSnippet).toMatch(/Parts Used/);
    expect(finding.rawSnippet).toMatch(/Repairs Required/);
  });
});

describe("PHOTO-C010 audit policy seed", () => {
  it("is seeded as Minor in job-summary-v1 defaults", () => {
    const jsRules = DEFAULT_AUDIT_POLICY.forms["job-summary-v1"].rules;
    const photoRule = jsRules.find(r => r.ruleId === "PHOTO-C010");

    expect(photoRule).toBeDefined();
    expect(photoRule!.failClass).toBe("minor");
    expect(photoRule!.enabled).toBe(true);
    expect(photoRule!.fieldAliases).toContain("Photo Evidence");
  });

  it("is NOT present in wasted-journey-v1 defaults", () => {
    const wjRules = DEFAULT_AUDIT_POLICY.forms["wasted-journey-v1"].rules;
    expect(wjRules.find(r => r.ruleId === "PHOTO-C010")).toBeUndefined();
  });
});
