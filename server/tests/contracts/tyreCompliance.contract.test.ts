/**
 * Tyre compliance contract tests.
 *
 * Covers PlantExpand trailer tread-depth (≥ 2mm), PSI band rules
 * for multiple C-rated tyre sizes (195/50R13C, 155/70R12C, 185/70R13C,
 * 195/55R10C), and DOT age (max 8 years).
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

/** DOT 2315 = week 23, year 2015 — over 8 years old (when tested against 2026). */
const TRAILER_DOT_OVER_8 = `
Job Summary Report
Asset No: DV23TRL Make/Model: PlantExpand General Trailer

OSF Tyre Tread Depth: 6mm
NSF Tyre Tread Depth: 6mm
OSR Tyre Tread Depth: 6mm
NSR Tyre Tread Depth: 6mm

Tyre Size: 195/50R13C
Tyre Inflation: 93 PSI
DOT: 2315
`;

/** DOT 1022 = week 10, year 2022 — under 8 years old (when tested against 2026). */
const TRAILER_DOT_UNDER_8 = `
Job Summary Report
Asset No: DV23TRL Make/Model: PlantExpand General Trailer

OSF Tyre Tread Depth: 6mm
NSF Tyre Tread Depth: 6mm
OSR Tyre Tread Depth: 6mm
NSR Tyre Tread Depth: 6mm

Tyre Size: 195/50R13C
Tyre Inflation: 93 PSI
DOT: 1022
`;

/** Explicit age statement: "Tyre Age: 10 years" — over 8. */
const TRAILER_DOT_AGE_EXPLICIT_FAIL = `
Job Summary Report
Asset No: DV23TRL Make/Model: PlantExpand General Trailer

OSF Tyre Tread Depth: 6mm
NSF Tyre Tread Depth: 6mm
OSR Tyre Tread Depth: 6mm
NSR Tyre Tread Depth: 6mm

Tyre Age: 10 years
`;

/** Explicit age statement: "Tyre Age: 5 years" — under 8. */
const TRAILER_DOT_AGE_EXPLICIT_PASS = `
Job Summary Report
Asset No: DV23TRL Make/Model: PlantExpand General Trailer

OSF Tyre Tread Depth: 6mm
Tyre Age: 5 years
`;

/** No DOT data — should not produce TYRE-C030 finding. */
const TRAILER_NO_DOT = `
Job Summary Report
Asset No: DV23TRL Make/Model: PlantExpand General Trailer

OSF Tyre Tread Depth: 6mm
NSF Tyre Tread Depth: 6mm
OSR Tyre Tread Depth: 6mm
NSR Tyre Tread Depth: 6mm

Tyre Size: 195/50R13C
Tyre Inflation: 93 PSI
`;

/** DOT exactly at 8-year boundary — should pass (> 8 required to fail). */
const TRAILER_DOT_EXACTLY_8 = `
OSF Tyre Tread Depth: 6mm
DOT: 2818
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

/** 155/70R12C at 93 PSI — within the 90–95 band. */
const TRAILER_155_70R12C_PASS = `
OSF Tyre Tread Depth: 6mm
NSF Tyre Tread Depth: 6mm
OSR Tyre Tread Depth: 6mm
NSR Tyre Tread Depth: 6mm

Tyre Size: 155/70R12C
Tyre Inflation: 93 PSI
`;

/** 155/70R12C at 80 PSI — below the 90–95 band. */
const TRAILER_155_70R12C_FAIL = `
OSF Tyre Tread Depth: 6mm
Tyre Size: 155/70R12C
Tyre Inflation: 80 PSI
`;

/** 185/70R13C at 85 PSI — within the 83–87 band. */
const TRAILER_185_70R13C_PASS = `
OSF Tyre Tread Depth: 6mm
NSF Tyre Tread Depth: 6mm
OSR Tyre Tread Depth: 6mm
NSR Tyre Tread Depth: 6mm

Tyre Size: 185/70R13C
Tyre Inflation: 85 PSI
`;

/** 185/70R13C at 92 PSI — above the 83–87 band. */
const TRAILER_185_70R13C_FAIL = `
OSF Tyre Tread Depth: 6mm
Tyre Size: 185/70R13C
Tyre Inflation: 92 PSI
`;

/** 195/55R10C at 89 PSI — within the 87–91 band. */
const TRAILER_195_55R10C_PASS = `
OSF Tyre Tread Depth: 6mm
NSF Tyre Tread Depth: 6mm
OSR Tyre Tread Depth: 6mm
NSR Tyre Tread Depth: 6mm

Tyre Size: 195/55R10C
Tyre Inflation: 89 PSI
`;

/** 195/55R10C at 80 PSI — below the 87–91 band. */
const TRAILER_195_55R10C_FAIL = `
OSF Tyre Tread Depth: 6mm
Tyre Size: 195/55R10C
Tyre Inflation: 80 PSI
`;

/** Unknown C-rated size 205/65R15C — PSI should not fail. */
const TRAILER_UNKNOWN_SIZE = `
OSF Tyre Tread Depth: 6mm
Tyre Size: 205/65R15C
Tyre Inflation: 70 PSI
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
      const psiFindings = result.findings.filter(f => f.ruleId === "TYRE-C020");
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
      const psiFindings = result.findings.filter(f => f.ruleId === "TYRE-C020");
      expect(psiFindings).toHaveLength(1);
      expect(psiFindings[0].severity).toBe("S3");
      expect(psiFindings[0].normalisedSnippet).toContain("not configured");
      expect(result.psiValue).toBe(95);
      expect(result.tyreSize).toBeNull();
    });

    it("PSI 90 + 195/50 R13C (space variant) → Passed (S3)", () => {
      const result = evaluateTyreCompliance(TRAILER_PSI_LOWER_BOUND);
      const psiFindings = result.findings.filter(f => f.ruleId === "TYRE-C020");
      expect(psiFindings).toHaveLength(1);
      expect(psiFindings[0].severity).toBe("S3");
      expect(psiFindings[0].normalisedSnippet).toContain("Passed");
      expect(result.psiValue).toBe(90);
    });

    it("PSI 93 + 155/70R12C → Passed (S3)", () => {
      const result = evaluateTyreCompliance(TRAILER_155_70R12C_PASS);
      const psiFindings = result.findings.filter(f => f.ruleId === "TYRE-C020");
      expect(psiFindings).toHaveLength(1);
      expect(psiFindings[0].severity).toBe("S3");
      expect(psiFindings[0].normalisedSnippet).toContain("Passed");
      expect(result.psiValue).toBe(93);
    });

    it("PSI 80 + 155/70R12C → S1 OUT_OF_POLICY", () => {
      const result = evaluateTyreCompliance(TRAILER_155_70R12C_FAIL);
      const s1 = result.findings.filter(
        f => f.ruleId === "TYRE-C020" && f.severity === "S1"
      );
      expect(s1).toHaveLength(1);
      expect(s1[0].normalisedSnippet).toContain("90–95");
    });

    it("PSI 85 + 185/70R13C → Passed (S3)", () => {
      const result = evaluateTyreCompliance(TRAILER_185_70R13C_PASS);
      const psiFindings = result.findings.filter(f => f.ruleId === "TYRE-C020");
      expect(psiFindings).toHaveLength(1);
      expect(psiFindings[0].severity).toBe("S3");
      expect(psiFindings[0].normalisedSnippet).toContain("Passed");
      expect(result.psiValue).toBe(85);
    });

    it("PSI 92 + 185/70R13C → S1 OUT_OF_POLICY (above 83–87)", () => {
      const result = evaluateTyreCompliance(TRAILER_185_70R13C_FAIL);
      const s1 = result.findings.filter(
        f => f.ruleId === "TYRE-C020" && f.severity === "S1"
      );
      expect(s1).toHaveLength(1);
      expect(s1[0].normalisedSnippet).toContain("83–87");
    });

    it("PSI 89 + 195/55R10C → Passed (S3)", () => {
      const result = evaluateTyreCompliance(TRAILER_195_55R10C_PASS);
      const psiFindings = result.findings.filter(f => f.ruleId === "TYRE-C020");
      expect(psiFindings).toHaveLength(1);
      expect(psiFindings[0].severity).toBe("S3");
      expect(psiFindings[0].normalisedSnippet).toContain("Passed");
      expect(result.psiValue).toBe(89);
    });

    it("PSI 80 + 195/55R10C → S1 OUT_OF_POLICY (below 87–91)", () => {
      const result = evaluateTyreCompliance(TRAILER_195_55R10C_FAIL);
      const s1 = result.findings.filter(
        f => f.ruleId === "TYRE-C020" && f.severity === "S1"
      );
      expect(s1).toHaveLength(1);
      expect(s1[0].normalisedSnippet).toContain("87–91");
    });

    it("unknown size 205/65R15C → S3 informational, no PSI fail", () => {
      const result = evaluateTyreCompliance(TRAILER_UNKNOWN_SIZE);
      const psiFindings = result.findings.filter(f => f.ruleId === "TYRE-C020");
      expect(psiFindings).toHaveLength(1);
      expect(psiFindings[0].severity).toBe("S3");
      expect(psiFindings[0].normalisedSnippet).toContain("not configured");
      expect(result.psiValue).toBe(70);
    });

    it("no PSI data → no PSI findings", () => {
      const result = evaluateTyreCompliance(TREAD_EXACTLY_2MM);
      expect(
        result.findings.filter(f => f.ruleId === "TYRE-C020")
      ).toHaveLength(0);
    });
  });

  describe("DOT age", () => {
    const testDate = new Date("2026-07-11T12:00:00Z");

    it("DOT 2315 (week 23, 2015) → S1 OUT_OF_POLICY (>8 years)", () => {
      const result = evaluateTyreCompliance(TRAILER_DOT_OVER_8, testDate);
      const s1 = result.findings.filter(
        f => f.ruleId === "TYRE-C030" && f.severity === "S1"
      );
      expect(s1).toHaveLength(1);
      expect(s1[0].reasonCode).toBe("OUT_OF_POLICY");
      expect(s1[0].normalisedSnippet).toContain("exceeds");
      expect(s1[0].normalisedSnippet).toContain("8-year");
      expect(result.dotAge).not.toBeNull();
      expect(result.dotAge!.ageYears).toBeGreaterThan(8);
    });

    it("DOT 1022 (week 10, 2022) → S3 Passed (≤8 years)", () => {
      const result = evaluateTyreCompliance(TRAILER_DOT_UNDER_8, testDate);
      const dotFindings = result.findings.filter(f => f.ruleId === "TYRE-C030");
      expect(dotFindings).toHaveLength(1);
      expect(dotFindings[0].severity).toBe("S3");
      expect(dotFindings[0].normalisedSnippet).toContain("Passed");
      expect(result.dotAge).not.toBeNull();
      expect(result.dotAge!.ageYears).toBeLessThanOrEqual(8);
    });

    it("explicit 'Tyre Age: 10 years' → S1 OUT_OF_POLICY", () => {
      const result = evaluateTyreCompliance(TRAILER_DOT_AGE_EXPLICIT_FAIL, testDate);
      const s1 = result.findings.filter(
        f => f.ruleId === "TYRE-C030" && f.severity === "S1"
      );
      expect(s1).toHaveLength(1);
      expect(s1[0].normalisedSnippet).toContain("10");
      expect(s1[0].normalisedSnippet).toContain("exceeds");
      expect(result.dotAge!.ageYears).toBe(10);
    });

    it("explicit 'Tyre Age: 5 years' → S3 Passed", () => {
      const result = evaluateTyreCompliance(TRAILER_DOT_AGE_EXPLICIT_PASS, testDate);
      const dotFindings = result.findings.filter(f => f.ruleId === "TYRE-C030");
      expect(dotFindings).toHaveLength(1);
      expect(dotFindings[0].severity).toBe("S3");
      expect(result.dotAge!.ageYears).toBe(5);
    });

    it("no DOT data → no TYRE-C030 finding (skip, no false fail)", () => {
      const result = evaluateTyreCompliance(TRAILER_NO_DOT, testDate);
      const dotFindings = result.findings.filter(f => f.ruleId === "TYRE-C030");
      expect(dotFindings).toHaveLength(0);
      expect(result.dotAge).toBeNull();
    });

    it("DOT 2818 (week 28, 2018) at 2026-07-11 → exactly 8 years, passes", () => {
      const result = evaluateTyreCompliance(TRAILER_DOT_EXACTLY_8, testDate);
      const dotFindings = result.findings.filter(f => f.ruleId === "TYRE-C030");
      expect(dotFindings).toHaveLength(1);
      expect(dotFindings[0].severity).toBe("S3");
      expect(result.dotAge!.ageYears).toBeLessThanOrEqual(8);
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
      expect(s1.map(f => f.ruleId).sort()).toEqual(["TYRE-C010", "TYRE-C020"]);
    });
  });
});
