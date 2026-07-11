/**
 * Golden contract tests for Job 87 / asset 249200123 — PlantExpand VOR trailer.
 *
 * Scenario: VOR + Safe=No + ReturnVisit=Yes + Incomplete works, Parts Still
 * Required body (Wheel tyre combo 195/50R13C, Coupling 40NB), tread 6mm,
 * Size 195/50R13C, PSI 95, "Please select" on 3rd axle, technician
 * Richard.Newton, Job ID 87.
 *
 * Fixtures:
 *   ocr-captures/job87-vor-trailer-layout.txt      — Azure DI pdftotext -layout
 *   ocr-captures/job87-vor-trailer-mistral-flat.txt — Mistral flattened OCR
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { extractFailurePathSignals } from "../../services/jobSummaryConsistency";
import { evaluateJobSummaryConsistency } from "../../services/jobSummaryConsistency";
import { evaluateTyreCompliance } from "../../services/tyreCompliance";
import { evaluateChecklistCompleteness } from "../../services/checklistCompleteness";

const FIXTURES = path.resolve(__dirname, "../fixtures/ocr-captures");

const layoutText = fs.readFileSync(
  path.join(FIXTURES, "job87-vor-trailer-layout.txt"),
  "utf8"
);
const flatText = fs.readFileSync(
  path.join(FIXTURES, "job87-vor-trailer-mistral-flat.txt"),
  "utf8"
);

describe("Job 87 VOR trailer golden fixtures", () => {
  // -------------------------------------------------------------------
  // extractFailurePathSignals
  // -------------------------------------------------------------------
  describe("extractFailurePathSignals", () => {
    it("detects VOR + unsafe + returnVisit + incomplete from layout text", () => {
      const s = extractFailurePathSignals(layoutText);
      expect(s.vor).toBe(true);
      expect(s.unsafe).toBe(true);
      expect(s.safeYes).toBe(false);
      expect(s.returnVisit).toBe(true);
      expect(s.returnVisitNo).toBe(false);
      expect(s.incomplete).toBe(true);
      expect(s.worksCompleteYes).toBe(false);
      expect(s.onFailurePath).toBe(true);
    });

    it("detects VOR + unsafe + returnVisit + incomplete from flat text", () => {
      const s = extractFailurePathSignals(flatText);
      expect(s.vor).toBe(true);
      expect(s.unsafe).toBe(true);
      expect(s.safeYes).toBe(false);
      expect(s.returnVisit).toBe(true);
      expect(s.returnVisitNo).toBe(false);
      expect(s.incomplete).toBe(true);
      expect(s.worksCompleteYes).toBe(false);
      expect(s.onFailurePath).toBe(true);
    });

    it("detects Parts Still Required with content from layout text", () => {
      const s = extractFailurePathSignals(layoutText);
      expect(s.partsStillRequired).toBe(true);
      expect(s.partsStillSnippet).toContain("Wheel tyre combo");
      expect(s.partsStillSnippet).toContain("Coupling 40NB");
    });

    it("detects repairs path from layout text", () => {
      const s = extractFailurePathSignals(layoutText);
      expect(s.repairsPath).toBe(true);
    });

    it("Parts Used is empty (no parts fitted this visit)", () => {
      const s = extractFailurePathSignals(layoutText);
      expect(s.partsUsed).toBe(false);
    });

    it("detects substantive engineer comments", () => {
      const s = extractFailurePathSignals(layoutText);
      expect(s.hasSubstantiveComments).toBe(true);
      expect(s.commentSnippet.length).toBeGreaterThan(20);
    });
  });

  // -------------------------------------------------------------------
  // evaluateJobSummaryConsistency — full consistency judgment
  // -------------------------------------------------------------------
  describe("evaluateJobSummaryConsistency", () => {
    it("layout text: fully consistent VOR story → no blocking issues", () => {
      const result = evaluateJobSummaryConsistency(layoutText);
      expect(result.hasBlockingIssues).toBe(false);

      const s1Issues = result.findings.filter(f => f.severity === "S1");
      expect(s1Issues).toHaveLength(0);
    });

    it("layout text: emits VOR ↔ Safe Consistent (JSR-C012)", () => {
      const result = evaluateJobSummaryConsistency(layoutText);
      const c012 = result.findings.find(f => f.ruleId === "JSR-C012");
      expect(c012).toBeDefined();
      expect(c012!.severity).toBe("S3");
      expect(c012!.normalisedSnippet).toMatch(/Consistent/i);
    });

    it("layout text: emits Return Visit Consistent (JSR-C032)", () => {
      const result = evaluateJobSummaryConsistency(layoutText);
      const c032 = result.findings.find(f => f.ruleId === "JSR-C032");
      expect(c032).toBeDefined();
      expect(c032!.severity).toBe("S3");
    });

    it("layout text: emits Works Completion Consistent (JSR-C041)", () => {
      const result = evaluateJobSummaryConsistency(layoutText);
      const c041 = result.findings.find(f => f.ruleId === "JSR-C041");
      expect(c041).toBeDefined();
      expect(c041!.severity).toBe("S3");
    });

    it("layout text: emits Parts Still Required ↔ Return Visit Consistent (JSR-C092)", () => {
      const result = evaluateJobSummaryConsistency(layoutText);
      const c092 = result.findings.find(f => f.ruleId === "JSR-C092");
      expect(c092).toBeDefined();
      expect(c092!.severity).toBe("S3");
      expect(c092!.normalisedSnippet).toMatch(/Consistent/i);
    });

    it("layout text: emits Engineer Comments Passed (JSR-C081)", () => {
      const result = evaluateJobSummaryConsistency(layoutText);
      const c081 = result.findings.find(f => f.ruleId === "JSR-C081");
      expect(c081).toBeDefined();
      expect(c081!.severity).toBe("S3");
    });

    it("flat text: also produces no blocking issues", () => {
      const result = evaluateJobSummaryConsistency(flatText);
      expect(result.hasBlockingIssues).toBe(false);
    });

    it("no false Job ID / serial / technician conflicts in signals", () => {
      const layoutSignals = extractFailurePathSignals(layoutText);
      const flatSignals = extractFailurePathSignals(flatText);

      expect(layoutSignals.vor).toBe(flatSignals.vor);
      expect(layoutSignals.unsafe).toBe(flatSignals.unsafe);
      expect(layoutSignals.returnVisit).toBe(flatSignals.returnVisit);
      expect(layoutSignals.incomplete).toBe(flatSignals.incomplete);
      expect(layoutSignals.onFailurePath).toBe(flatSignals.onFailurePath);
    });
  });

  // -------------------------------------------------------------------
  // evaluateTyreCompliance
  // -------------------------------------------------------------------
  describe("evaluateTyreCompliance", () => {
    it("layout text: 4 readings at 6mm → all pass (S3)", () => {
      const result = evaluateTyreCompliance(layoutText);
      expect(result.readings).toHaveLength(4);
      expect(result.readings.every(r => r.depthMm === 6)).toBe(true);

      const treadFinding = result.findings.find(f => f.ruleId === "TYRE-C010");
      expect(treadFinding).toBeDefined();
      expect(treadFinding!.severity).toBe("S3");
      expect(treadFinding!.normalisedSnippet).toContain("Passed");
    });

    it("layout text: PSI 95 + 195/50R13C → within 90–95 band (S3)", () => {
      const result = evaluateTyreCompliance(layoutText);
      expect(result.psiValue).toBe(95);
      expect(result.tyreSize).toContain("195/50");

      const psiFinding = result.findings.find(f => f.ruleId === "TYRE-C020");
      expect(psiFinding).toBeDefined();
      expect(psiFinding!.severity).toBe("S3");
      expect(psiFinding!.normalisedSnippet).toContain("Passed");
    });

    it("flat text: same tyre readings and PSI results", () => {
      const result = evaluateTyreCompliance(flatText);
      expect(result.readings).toHaveLength(4);
      expect(result.psiValue).toBe(95);

      const s1 = result.findings.filter(f => f.severity === "S1");
      expect(s1).toHaveLength(0);
    });

    it("summary confirms pass", () => {
      const result = evaluateTyreCompliance(layoutText);
      expect(result.summary).toContain("passed");
    });
  });

  // -------------------------------------------------------------------
  // evaluateChecklistCompleteness
  // -------------------------------------------------------------------
  describe("evaluateChecklistCompleteness", () => {
    it("layout text: detects 'Please select' on 3rd Axle NS field", () => {
      const result = evaluateChecklistCompleteness(layoutText);
      expect(result.incompleteFields.length).toBeGreaterThanOrEqual(1);
      expect(
        result.incompleteFields.some(f => /3rd\s*Axle\s*NS/i.test(f))
      ).toBe(true);

      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].ruleId).toBe("CHECK-C010");
      expect(result.findings[0].severity).toBe("S2");
      expect(result.findings[0].reasonCode).toBe("INCOMPLETE_EVIDENCE");
    });

    it("flat text: 'Please select' not detectable without line structure", () => {
      const result = evaluateChecklistCompleteness(flatText);
      expect(result.incompleteFields).toHaveLength(0);
      expect(result.findings).toHaveLength(0);
    });

    it("summary mentions the incomplete field", () => {
      const result = evaluateChecklistCompleteness(layoutText);
      expect(result.summary).toContain("Please select");
    });
  });
});
