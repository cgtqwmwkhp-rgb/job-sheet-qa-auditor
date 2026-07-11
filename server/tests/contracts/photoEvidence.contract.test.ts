/**
 * Photo evidence consistency scaffold contracts.
 */

import { describe, it, expect } from "vitest";
import {
  evaluatePhotoEvidenceConsistency,
  detectPhotoLabels,
} from "../../services/photoEvidence";
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

const JOB_SHEET_WITH_PHOTO_LABELS = `
Job Summary Report
Asset No: BN21ACO_TL
Make/Model: TAILLIFT

Repairs Required: Replace cracked hinge assembly on tail lift platform.

Parts Used: 1x hinge assembly PN-4421, 2x M12 bolts

Before Photo 1: Cracked hinge visible on platform edge.
After Photo 2: New hinge assembly installed and secured.

Technician Signature
`;

const JOB_SHEET_WITH_BEFORE_AFTER_LABELS = `
Job Summary Report
Asset No: AB34CDE

Repairs Required: Rewire faulty indicator relay.

Parts Used: 1x relay unit RL-990

Photographic Evidence:
Before - relay housing corroded
After - new relay wired and tested

Technician Signature
`;

const JOB_SHEET_PARTS_SINGLE_LABEL_ONLY = `
Job Summary Report
Asset No: QQ11ZZZ

Parts Used: 2x brake pads BP-100

Repairs Required: Replaced front brake pads.

Photo 1: New pads fitted.

Technician Signature
`;

describe("photoEvidenceConsistency", () => {
  it("emits PHOTO-C010 when both Parts Used and Repairs Required have content but no photo labels", () => {
    const result = evaluatePhotoEvidenceConsistency(
      JOB_SHEET_WITH_PARTS_AND_REPAIRS
    );

    expect(result.hasPartsOrRepairs).toBe(true);
    expect(result.partsUsedPresent).toBe(true);
    expect(result.repairsRequiredPresent).toBe(true);
    expect(result.photoLabelsDetected).toBe(false);
    expect(result.findings).toHaveLength(1);

    const finding = result.findings[0];
    expect(finding.ruleId).toBe("PHOTO-C010");
    expect(finding.fieldName).toBe("Photo Evidence");
    expect(finding.severity).toBe("S2");
    expect(finding.reasonCode).toBe("INCOMPLETE_EVIDENCE");
    expect(finding.confidence).toBeGreaterThanOrEqual(50);
  });

  it("emits PHOTO-C010 when only Parts Used is present and no photo labels", () => {
    const result = evaluatePhotoEvidenceConsistency(JOB_SHEET_PARTS_ONLY);

    expect(result.hasPartsOrRepairs).toBe(true);
    expect(result.partsUsedPresent).toBe(true);
    expect(result.repairsRequiredPresent).toBe(false);
    expect(result.photoLabelsDetected).toBe(false);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].ruleId).toBe("PHOTO-C010");
  });

  it("emits PHOTO-C010 when only Repairs Required is present and no photo labels", () => {
    const result = evaluatePhotoEvidenceConsistency(JOB_SHEET_REPAIRS_ONLY);

    expect(result.hasPartsOrRepairs).toBe(true);
    expect(result.partsUsedPresent).toBe(false);
    expect(result.repairsRequiredPresent).toBe(true);
    expect(result.photoLabelsDetected).toBe(false);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].ruleId).toBe("PHOTO-C010");
  });

  it("emits no findings when neither Parts Used nor Repairs Required has content", () => {
    const result = evaluatePhotoEvidenceConsistency(
      JOB_SHEET_NO_PARTS_NO_REPAIRS
    );

    expect(result.hasPartsOrRepairs).toBe(false);
    expect(result.photoLabelsDetected).toBe(false);
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

  it("rawSnippet captures the triggering section content when PHOTO-C010", () => {
    const result = evaluatePhotoEvidenceConsistency(
      JOB_SHEET_WITH_PARTS_AND_REPAIRS
    );
    const finding = result.findings[0];

    expect(finding.rawSnippet).toMatch(/Parts Used/);
    expect(finding.rawSnippet).toMatch(/Repairs Required/);
  });
});

describe("photoEvidenceConsistency — PHOTO-C011 (photo labels detected)", () => {
  it("emits PHOTO-C011 Passed S3 when parts present AND before/after labels found", () => {
    const result = evaluatePhotoEvidenceConsistency(
      JOB_SHEET_WITH_PHOTO_LABELS
    );

    expect(result.hasPartsOrRepairs).toBe(true);
    expect(result.photoLabelsDetected).toBe(true);
    expect(result.matchedLabels.length).toBeGreaterThanOrEqual(2);
    expect(result.findings).toHaveLength(1);

    const finding = result.findings[0];
    expect(finding.ruleId).toBe("PHOTO-C011");
    expect(finding.fieldName).toBe("Photo Evidence");
    expect(finding.severity).toBe("S3");
    expect(finding.reasonCode).toBe("INCOMPLETE_EVIDENCE");
    expect(finding.normalisedSnippet).toMatch(/photo evidence labels present/i);
  });

  it("emits PHOTO-C011 when before/after text labels present", () => {
    const result = evaluatePhotoEvidenceConsistency(
      JOB_SHEET_WITH_BEFORE_AFTER_LABELS
    );

    expect(result.hasPartsOrRepairs).toBe(true);
    expect(result.photoLabelsDetected).toBe(true);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].ruleId).toBe("PHOTO-C011");
    expect(result.summary).toMatch(/PHOTO-C011 passed/);
  });

  it("emits PHOTO-C010 (not C011) when only a single photo label found (insufficient evidence)", () => {
    const result = evaluatePhotoEvidenceConsistency(
      JOB_SHEET_PARTS_SINGLE_LABEL_ONLY
    );

    expect(result.hasPartsOrRepairs).toBe(true);
    expect(result.photoLabelsDetected).toBe(false);
    expect(result.matchedLabels.length).toBeLessThan(2);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].ruleId).toBe("PHOTO-C010");
  });

  it("PHOTO-C011 rawSnippet contains matched photo labels", () => {
    const result = evaluatePhotoEvidenceConsistency(
      JOB_SHEET_WITH_PHOTO_LABELS
    );
    const finding = result.findings[0];

    expect(finding.rawSnippet.length).toBeGreaterThan(0);
  });

  it("PHOTO-C011 suggestedFix indicates no action required", () => {
    const result = evaluatePhotoEvidenceConsistency(
      JOB_SHEET_WITH_PHOTO_LABELS
    );
    const finding = result.findings[0];

    expect(finding.suggestedFix).toMatch(/no action required/i);
  });
});

describe("detectPhotoLabels", () => {
  it("detects 'Before' and 'After' labels", () => {
    const labels = detectPhotoLabels("Before: old part. After: new part.");
    expect(labels).toContain("Before");
    expect(labels).toContain("After");
  });

  it("detects 'Photo 1', 'Photo 2' style labels", () => {
    const labels = detectPhotoLabels("Photo 1: cracked. Photo 2: repaired.");
    expect(labels.some(l => /photo\s*1/i.test(l))).toBe(true);
    expect(labels.some(l => /photo\s*2/i.test(l))).toBe(true);
  });

  it("detects 'pre-repair' and 'post-repair' labels", () => {
    const labels = detectPhotoLabels(
      "Pre-repair condition noted. Post-repair verification complete."
    );
    expect(labels.some(l => /pre[\s-]?repair/i.test(l))).toBe(true);
    expect(labels.some(l => /post[\s-]?repair/i.test(l))).toBe(true);
  });

  it("returns empty array for text with no photo labels", () => {
    const labels = detectPhotoLabels("Standard maintenance completed. All OK.");
    expect(labels).toHaveLength(0);
  });

  it("deduplicates repeated identical matches", () => {
    const labels = detectPhotoLabels("Before the work. Then before the test.");
    const exactBefore = labels.filter(l => l.toLowerCase() === "before");
    expect(exactBefore.length).toBe(1);
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

describe("PHOTO-C011 audit policy seed", () => {
  it("is seeded as informational in job-summary-v1 defaults", () => {
    const jsRules = DEFAULT_AUDIT_POLICY.forms["job-summary-v1"].rules;
    const photoRule = jsRules.find(r => r.ruleId === "PHOTO-C011");

    expect(photoRule).toBeDefined();
    expect(photoRule!.failClass).toBe("informational");
    expect(photoRule!.enabled).toBe(true);
    expect(photoRule!.fieldAliases).toContain("Photo Evidence");
  });

  it("is NOT present in wasted-journey-v1 defaults", () => {
    const wjRules = DEFAULT_AUDIT_POLICY.forms["wasted-journey-v1"].rules;
    expect(wjRules.find(r => r.ruleId === "PHOTO-C011")).toBeUndefined();
  });
});
