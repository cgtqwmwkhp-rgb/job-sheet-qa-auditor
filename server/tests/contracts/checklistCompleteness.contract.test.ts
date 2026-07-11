/**
 * Checklist completeness contract tests.
 *
 * Verifies that "Please select" placeholder values on compliance
 * checklist fields produce a Minor/S2 INCOMPLETE_EVIDENCE finding
 * (CHECK-C010), not a tread-depth or substantive field failure.
 */

import { describe, it, expect } from "vitest";
import { evaluateChecklistCompleteness } from "../../services/checklistCompleteness";
import {
  classifyFinding,
  DEFAULT_AUDIT_POLICY,
} from "../../services/auditPolicy";
import type { Finding } from "../../services/analyzer";

/** Realistic trailer checklist with "Please select" placeholders. */
const CHECKLIST_PLEASE_SELECT = `
Job Summary Report
Asset No: DV23TRL Make/Model: PlantExpand General Trailer
Asset Mileage/Hours: 4820

Tyre Checklist
3rd Axle NS Tyre Tread Depth: Please select
3rd Axle OS Tyre Tread Depth: Please select
OSF Tyre Tread Depth: 6mm
NSF Tyre Tread Depth: 6mm
OSR Tyre Tread Depth: 6mm
NSR Tyre Tread Depth: 6mm

Completion Details
Service Completed? Yes
All Works Completed? Yes
Asset Safe To Use? Yes
`;

/** Multiple fields still showing placeholder values. */
const MULTIPLE_PLEASE_SELECT = `
Job Summary Report
Asset No: DV23TRL

3rd Axle NS Tyre Tread Depth: Please select
3rd Axle OS Tyre Tread Depth: Please select
Brake Condition: Please select
Lighting Check: Please select
`;

/** All checklist fields completed — no placeholders. */
const CHECKLIST_ALL_COMPLETED = `
Job Summary Report
Asset No: DV23TRL Make/Model: PlantExpand General Trailer

OSF Tyre Tread Depth: 6mm
NSF Tyre Tread Depth: 6mm
OSR Tyre Tread Depth: 6mm
NSR Tyre Tread Depth: 6mm
Brake Condition: Good
Lighting Check: Pass
`;

/** OCR artifact: "seIect" (capital-I instead of lowercase-l). */
const CHECKLIST_OCR_ARTEFACT = `
Brake Condition: Please seIect
`;

/** No checklist data at all. */
const NO_CHECKLIST_DATA = `
Job Summary Report
Asset No: DV23VSJ Make/Model: Inverter Unit
Completion Details
All Works Completed? Yes
`;

/** "Please select" in a free-text comment — should NOT trigger. */
const PLEASE_SELECT_IN_PROSE = `
Engineer Comments: Please select the right gasket from the parts catalogue.
All Works Completed? Yes
`;

/** Duplicate field labels — should deduplicate. */
const DUPLICATE_FIELDS = `
3rd Axle NS Tyre Tread Depth: Please select
3rd Axle NS Tyre Tread Depth: Please select
`;

describe("checklistCompleteness", () => {
  describe("evaluateChecklistCompleteness", () => {
    it("detects 'Please select' on 3rd Axle tread fields → S2 Minor", () => {
      const result = evaluateChecklistCompleteness(CHECKLIST_PLEASE_SELECT);
      expect(result.incompleteFields.length).toBe(2);
      expect(result.incompleteFields).toContain("3rd Axle NS Tyre Tread Depth");
      expect(result.incompleteFields).toContain("3rd Axle OS Tyre Tread Depth");

      expect(result.findings).toHaveLength(1);
      const f = result.findings[0];
      expect(f.ruleId).toBe("CHECK-C010");
      expect(f.severity).toBe("S2");
      expect(f.reasonCode).toBe("INCOMPLETE_EVIDENCE");
      expect(f.normalisedSnippet).toContain("Please select");
      expect(f.normalisedSnippet).toContain("3rd Axle NS Tyre Tread Depth");
    });

    it("detects multiple incomplete checklist fields", () => {
      const result = evaluateChecklistCompleteness(MULTIPLE_PLEASE_SELECT);
      expect(result.incompleteFields).toHaveLength(4);
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].severity).toBe("S2");
      expect(result.summary).toContain("4 field(s)");
    });

    it("passes when all checklist fields are completed", () => {
      const result = evaluateChecklistCompleteness(CHECKLIST_ALL_COMPLETED);
      expect(result.incompleteFields).toHaveLength(0);
      expect(result.findings).toHaveLength(0);
      expect(result.summary).toContain("passed");
    });

    it("handles OCR artefact 'seIect' (capital-I)", () => {
      const result = evaluateChecklistCompleteness(CHECKLIST_OCR_ARTEFACT);
      expect(result.incompleteFields).toHaveLength(1);
      expect(result.incompleteFields[0]).toBe("Brake Condition");
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].severity).toBe("S2");
    });

    it("returns empty when no checklist data present", () => {
      const result = evaluateChecklistCompleteness(NO_CHECKLIST_DATA);
      expect(result.incompleteFields).toHaveLength(0);
      expect(result.findings).toHaveLength(0);
    });

    it("does not false-positive on 'Please select' in free-text comments", () => {
      const result = evaluateChecklistCompleteness(PLEASE_SELECT_IN_PROSE);
      expect(result.incompleteFields).toHaveLength(0);
      expect(result.findings).toHaveLength(0);
    });

    it("deduplicates repeated field labels", () => {
      const result = evaluateChecklistCompleteness(DUPLICATE_FIELDS);
      expect(result.incompleteFields).toHaveLength(1);
      expect(result.findings).toHaveLength(1);
    });
  });

  describe("audit policy integration", () => {
    it("CHECK-C010 is classified as minor on job-summary-v1", () => {
      const f: Finding = {
        ruleId: "CHECK-C010",
        fieldName: "Checklist Completion",
        severity: "S2",
        reasonCode: "INCOMPLETE_EVIDENCE",
        rawSnippet: "3rd Axle NS Tyre Tread Depth: Please select",
        normalisedSnippet: "1 checklist field(s) still show placeholder",
        confidence: 95,
        pageNumber: 1,
        whyItMatters: "test",
        suggestedFix: "test",
      };

      const failClass = classifyFinding(
        f,
        "job-summary-v1",
        DEFAULT_AUDIT_POLICY
      );
      expect(failClass).toBe("minor");
    });
  });
});
