/**
 * Tyre compliance contract tests.
 *
 * Covers PlantExpand trailer tread-depth (≥ 2mm) and PSI band
 * (90–95 PSI for 195/50R13C) rules.
 */

import { describe, it, expect } from "vitest";
import { evaluateTyreCompliance } from "../../services/tyreCompliance";

/**
 * Realistic DV23/VOR trailer excerpt — all 6mm treads,
 * Size 195/50R13C, PSI 95. Should produce only Passed (S3) findings.
 */
const TRAILER_ALL_PASS = `
Job Summary Report
Asset No: DV23TRL Make/Model: PlantExpand General Trailer
Asset Mileage/Hours: 4820

Tyre Checklist
OSF Tyre Tread Depth: 6mm
NSF Tyre Tread Depth: 6mm
OSR Tyre Tread Depth: 6mm
NSR Tyre Tread Depth: 6mm

Tyre Size: 195/50R13C
Tyre Inflation: 95 PSI

Completion Details
Service Completed? Yes
All Works Completed? Yes
Asset Safe To Use? Yes
`;

/** Tread depth 1.5mm on OSR — below the 2mm minimum. */
const TRAILER_TREAD_FAIL = `
Job Summary Report
Asset No: DV23TRL Make/Model: PlantExpand General Trailer

OSF Tyre Tread Depth: 6mm
NSF Tyre Tread Depth: 5mm
OSR Tyre Tread Depth: 1.5mm
NSR Tyre Tread Depth: 4mm
`;

/** PSI 70 with 195/50R13C — outside the 90–95 band. */
const TRAILER_PSI_FAIL = `
Job Summary Report
Asset No: DV23TRL Make/Model: PlantExpand General Trailer

OSF Tyre Tread Depth: 6mm
NSF Tyre Tread Depth: 6mm
OSR Tyre Tread Depth: 6mm
NSR Tyre Tread Depth: 6mm

Tyre Size: 195/50R13C
Tyre Inflation: 70 PSI
`;

/** PSI 95, but no tyre size recorded — should not fail on PSI. */
const TRAILER_PSI_NO_SIZE = `
Job Summary Report
Asset No: DV23TRL Make/Model: PlantExpand General Trailer

OSF Tyre Tread Depth: 6mm
NSF Tyre Tread Depth: 6mm
OSR Tyre Tread Depth: 6mm
NSR Tyre Tread Depth: 6mm

Tyre Inflation: 95 PSI
`;

/** Multiple below-minimum on 3rd axle positions. */
const TRAILER_3RD_AXLE_FAIL = `
Asset No: DV23TRL Make/Model: PlantExpand General Trailer

OSF Tyre Tread Depth: 4mm
NSF Tyre Tread Depth: 4mm
OSR Tyre Tread Depth: 4mm
NSR Tyre Tread Depth: 4mm
OS 3rd Tyre Tread Depth: 1.8mm
NS 3rd Tyre Tread Depth: 1.2mm
`;

/** No tyre data at all — should return empty findings. */
const NO_TYRE_DATA = `
Job Summary Report
Asset No: DV23VSJ Make/Model: Inverter Unit
Completion Details
All Works Completed? Yes
`;

/** PSI at lower end of the acceptable band (90). */
const TRAILER_PSI_LOWER_BOUND = `
OSF Tyre Tread Depth: 6mm
NSF Tyre Tread Depth: 6mm
OSR Tyre Tread Depth: 6mm
NSR Tyre Tread Depth: 6mm

Tyre Size: 195/50 R13C
Tyre Pressure: 90 PSI
`;

/** Exact 2.0mm — should be a pass (≥ 2.0). */
const TREAD_EXACTLY_2MM = `
OSF Tyre Tread Depth: 2mm
NSF Tyre Tread Depth: 2mm
OSR Tyre Tread Depth: 2mm
NSR Tyre Tread Depth: 2mm
`;

describe("tyreCompliance", () => {
  describe("tread depth", () => {
    it("all 6mm treads → Passed (S3), no S1 findings", () => {
      const result = evaluateTyreCompliance(TRAILER_ALL_PASS);
      expect(result.readings).toHaveLength(4);
      expect(result.readings.every(r => r.depthMm === 6)).toBe(true);

      const treadFindings = result.findings.filter(
        f => f.ruleId === "TYRE-C010"
      );
      expect(treadFindings).toHaveLength(1);
      expect(treadFindings[0].severity).toBe("S3");
      expect(treadFindings[0].normalisedSnippet).toContain("Passed");
    });

    it("1.5mm on OSR → S1 OUT_OF_POLICY", () => {
      const result = evaluateTyreCompliance(TRAILER_TREAD_FAIL);
      const s1 = result.findings.filter(
        f => f.ruleId === "TYRE-C010" && f.severity === "S1"
      );
      expect(s1).toHaveLength(1);
      expect(s1[0].reasonCode).toBe("OUT_OF_POLICY");
      expect(s1[0].rawSnippet).toContain("OSR");
      expect(s1[0].rawSnippet).toContain("1.5mm");
    });

    it("3rd axle positions below minimum → S1", () => {
      const result = evaluateTyreCompliance(TRAILER_3RD_AXLE_FAIL);
      expect(result.readings).toHaveLength(6);

      const s1 = result.findings.filter(
        f => f.ruleId === "TYRE-C010" && f.severity === "S1"
      );
      expect(s1).toHaveLength(1);
      expect(s1[0].rawSnippet).toContain("1.8mm");
      expect(s1[0].rawSnippet).toContain("1.2mm");
    });

    it("exactly 2.0mm → pass (boundary, ≥ 2mm)", () => {
      const result = evaluateTyreCompliance(TREAD_EXACTLY_2MM);
      expect(result.readings).toHaveLength(4);
      expect(result.readings.every(r => r.depthMm === 2)).toBe(true);

      const treadFindings = result.findings.filter(
        f => f.ruleId === "TYRE-C010"
      );
      expect(treadFindings).toHaveLength(1);
      expect(treadFindings[0].severity).toBe("S3");
    });

    it("no tyre data → no tread findings", () => {
      const result = evaluateTyreCompliance(NO_TYRE_DATA);
      expect(result.readings).toHaveLength(0);
      expect(
        result.findings.filter(f => f.ruleId === "TYRE-C010")
      ).toHaveLength(0);
      expect(result.summary).toContain("skipped");
    });
  });

  describe("PSI / inflation", () => {
    it("PSI 95 + 195/50R13C → Passed (S3)", () => {
      const result = evaluateTyreCompliance(TRAILER_ALL_PASS);
      const psiFindings = result.findings.filter(
        f => f.ruleId === "TYRE-C020"
      );
      expect(psiFindings).toHaveLength(1);
      expect(psiFindings[0].severity).toBe("S3");
      expect(psiFindings[0].normalisedSnippet).toContain("Passed");
      expect(result.psiValue).toBe(95);
      expect(result.tyreSize).toContain("195/50");
    });

    it("PSI 70 + 195/50R13C → S1 OUT_OF_POLICY", () => {
      const result = evaluateTyreCompliance(TRAILER_PSI_FAIL);
      const s1 = result.findings.filter(
        f => f.ruleId === "TYRE-C020" && f.severity === "S1"
      );
      expect(s1).toHaveLength(1);
      expect(s1[0].reasonCode).toBe("OUT_OF_POLICY");
      expect(s1[0].normalisedSnippet).toContain("70");
      expect(s1[0].normalisedSnippet).toContain("90–95");
    });

    it("PSI 95 without tyre size → no PSI fail, S3 informational", () => {
      const result = evaluateTyreCompliance(TRAILER_PSI_NO_SIZE);
      const psiFindings = result.findings.filter(
        f => f.ruleId === "TYRE-C020"
      );
      expect(psiFindings).toHaveLength(1);
      expect(psiFindings[0].severity).toBe("S3");
      expect(psiFindings[0].normalisedSnippet).toContain("not configured");
      expect(result.psiValue).toBe(95);
      expect(result.tyreSize).toBeNull();
    });

    it("PSI 90 + 195/50 R13C (space variant) → Passed (S3)", () => {
      const result = evaluateTyreCompliance(TRAILER_PSI_LOWER_BOUND);
      const psiFindings = result.findings.filter(
        f => f.ruleId === "TYRE-C020"
      );
      expect(psiFindings).toHaveLength(1);
      expect(psiFindings[0].severity).toBe("S3");
      expect(psiFindings[0].normalisedSnippet).toContain("Passed");
      expect(result.psiValue).toBe(90);
    });

    it("no PSI data → no PSI findings", () => {
      const result = evaluateTyreCompliance(TREAD_EXACTLY_2MM);
      expect(
        result.findings.filter(f => f.ruleId === "TYRE-C020")
      ).toHaveLength(0);
    });
  });

  describe("combined scenarios", () => {
    it("DV23/VOR trailer all-pass produces only S3 findings", () => {
      const result = evaluateTyreCompliance(TRAILER_ALL_PASS);
      expect(result.findings.length).toBeGreaterThanOrEqual(2);
      expect(result.findings.every(f => f.severity === "S3")).toBe(true);
      expect(result.summary).toContain("passed");
    });

    it("tread fail + PSI fail produces 2 S1 findings", () => {
      const text = `
OSF Tyre Tread Depth: 1mm
NSF Tyre Tread Depth: 1mm
OSR Tyre Tread Depth: 1mm
NSR Tyre Tread Depth: 1mm
Tyre Size: 195/50R13C
Tyre Inflation: 50 PSI
`;
      const result = evaluateTyreCompliance(text);
      const s1 = result.findings.filter(f => f.severity === "S1");
      expect(s1).toHaveLength(2);
      expect(s1.map(f => f.ruleId).sort()).toEqual([
        "TYRE-C010",
        "TYRE-C020",
      ]);
    });
  });
});
