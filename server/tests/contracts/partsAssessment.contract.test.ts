/**
 * Parts Used PN + description pairing contracts.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  evaluatePartsUsed,
  parsePartsUsedLine,
  parsePartsUsedLines,
  isCompletePartsLine,
  isPartsLineAssessmentEnabled,
  FEATURE_PARTS_LINE_ASSESSMENT,
} from "../../services/partsAssessment";
import { DEFAULT_AUDIT_POLICY } from "../../services/auditPolicy/defaults";

const COMPLETE_THREE = `
Job Summary Report
Repairs Required: Replace wheel bearing
Parts Used
WT158 — wheel — 1
WT158 / wheel / 1
WT158 - wheel - 1
Technician Signature
`;

const PN_ONLY = `
Job Summary Report
Parts Used
WT158
PN-4421 —
Technician Signature
`;

const DESC_ONLY = `
Job Summary Report
Repairs Required: Fit new wheel
Parts Used
wheel — 1
replacement hinge assembly
Technician Signature
`;

const IMPLIED_NO_LINES = `
Job Summary Report
Repairs Required: Replace cracked hinge
Parts Used
None
Technician Signature
`;

const REPAIRS_ONLY_WITH_CONSUMABLES_YES = `
Job Summary Report
Repairs Required: Replace cracked hinge
Consumables Used? Yes
Parts Used
None
Technician Signature
`;

const CONSUMABLES_ONLY_NO_REPAIRS = `
Job Summary Report
All Works Completed? Yes
Return Visit Needed? No
Consumables Used? Yes
Parts Used
None
Technician Signature
`;

/** Real Plantexpand shape — table headers with no fitted lines (PX-116). */
const CONSUMABLES_YES_HEADER_CHROME_ONLY = `
Job Summary Report
Repairs Required: Service completed
Consumables Used? Yes
Parts Used
Part No Description Qty
Technician Signature
`;

const CONSUMABLES_YES_HEADER_SLASH_CHROME = `
Job Summary Report
Consumables Used? Yes
Parts Used
Part No / Description / Qty
Technician Signature
`;

const PARTS_USED_UNPARSEABLE = `
Job Summary Report
Repairs Required: Replace cracked hinge
Parts Used
see attached sheet
Technician Signature
`;

const REPAIRS_ONLY_PARTS_NOT_REQUIRED = `
Job Summary Report
Repairs Required: Vacuum pump serviced and re-calibrated
Parts Used
Nil required
Technician Signature
`;

const REPAIRS_ONLY_NO_PARTS_REQUIRED_PHRASE = `
Job Summary Report
Repairs Required: Flushed and inspected vacuum hose assembly
Parts Used
No parts required
Technician Signature
`;

const NO_PARTS_CONTEXT = `
Job Summary Report
All Works Completed? Yes
Return Visit Needed? No
Consumables Used? No
Technician Signature
`;

describe("parsePartsUsedLines", () => {
  it("parses WT158 — wheel — 1 style lines", () => {
    const line = parsePartsUsedLine("WT158 — wheel — 1");
    expect(line.partNumber).toBe("WT158");
    expect(line.description).toBe("wheel");
    expect(line.qty).toBe("1");
    expect(isCompletePartsLine(line)).toBe(true);
  });

  it("parses slash-separated lines", () => {
    const line = parsePartsUsedLine("WT158 / wheel / 1");
    expect(line.partNumber).toBe("WT158");
    expect(line.description).toBe("wheel");
    expect(isCompletePartsLine(line)).toBe(true);
  });

  it("detects PN-only lines", () => {
    const line = parsePartsUsedLine("WT158");
    expect(line.partNumber).toBe("WT158");
    expect(line.description).toBeNull();
    expect(isCompletePartsLine(line)).toBe(false);
  });

  it("detects description-only lines", () => {
    const line = parsePartsUsedLine("wheel — 1");
    expect(line.partNumber).toBeNull();
    expect(line.description).toBe("wheel");
    expect(isCompletePartsLine(line)).toBe(false);
  });

  it("parses multiple lines from a section body", () => {
    const lines = parsePartsUsedLines(
      "WT158 — wheel — 1\nWT158 / wheel / 1\nWT158 - wheel - 1"
    );
    expect(lines).toHaveLength(3);
    expect(lines.every(isCompletePartsLine)).toBe(true);
  });
});

describe("evaluatePartsUsed", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env[FEATURE_PARTS_LINE_ASSESSMENT];
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("emits PARTS-C013 only when all lines are complete", () => {
    const result = evaluatePartsUsed(COMPLETE_THREE);
    const ruleIds = result.findings.map(f => f.ruleId);
    expect(ruleIds).toEqual(["PARTS-C013"]);
    expect(result.findings[0].severity).toBe("S3");
    expect(result.signals.completeCount).toBe(3);
  });

  it("emits PARTS-C010 for PN-only lines", () => {
    const result = evaluatePartsUsed(PN_ONLY);
    expect(result.findings.some(f => f.ruleId === "PARTS-C010")).toBe(true);
    expect(result.findings.every(f => f.ruleId !== "PARTS-C013")).toBe(true);
    expect(result.findings.some(f => f.ruleId === "PARTS-C012")).toBe(true);
  });

  it("emits PARTS-C011 for description-only lines", () => {
    const result = evaluatePartsUsed(DESC_ONLY);
    expect(result.findings.some(f => f.ruleId === "PARTS-C011")).toBe(true);
    expect(result.findings.every(f => f.ruleId !== "PARTS-C013")).toBe(true);
    expect(result.findings.some(f => f.ruleId === "PARTS-C012")).toBe(true);
  });

  it("PR-A: softens repairs-only implication (Parts Used empty, Consumables not Yes) to PARTS-C014 informational, not MAJOR PARTS-C012", () => {
    const result = evaluatePartsUsed(IMPLIED_NO_LINES);
    expect(result.findings.some(f => f.ruleId === "PARTS-C012")).toBe(false);
    const c014 = result.findings.find(f => f.ruleId === "PARTS-C014");
    expect(c014).toBeDefined();
    expect(c014?.severity).toBe("S3");
    expect(c014?.reasonCode).toBe("LOW_CONFIDENCE");
    expect(result.signals.completeCount).toBe(0);
  });

  it("Wave B: softens Consumables Used=Yes + empty Parts Used to PARTS-C014, not MAJOR PARTS-C012", () => {
    const result = evaluatePartsUsed(REPAIRS_ONLY_WITH_CONSUMABLES_YES);
    expect(result.findings.some(f => f.ruleId === "PARTS-C012")).toBe(false);
    const c014 = result.findings.find(f => f.ruleId === "PARTS-C014");
    expect(c014).toBeDefined();
    expect(c014?.severity).toBe("S3");
    expect(result.signals.consumablesYes).toBe(true);
  });

  it("Wave B: consumables-only (no repairs) + empty Parts Used emits C014, not C012", () => {
    const result = evaluatePartsUsed(CONSUMABLES_ONLY_NO_REPAIRS);
    expect(result.findings.some(f => f.ruleId === "PARTS-C012")).toBe(false);
    const c014 = result.findings.find(f => f.ruleId === "PARTS-C014");
    expect(c014).toBeDefined();
    expect(c014?.severity).toBe("S3");
    expect(result.signals.consumablesYes).toBe(true);
    expect(result.signals.repairsPresent).toBe(false);
  });

  it("PX-116: Consumables=Yes + Parts Used header chrome only → C014, not C012", () => {
    const result = evaluatePartsUsed(CONSUMABLES_YES_HEADER_CHROME_ONLY);
    expect(result.findings.some(f => f.ruleId === "PARTS-C012")).toBe(false);
    const c014 = result.findings.find(f => f.ruleId === "PARTS-C014");
    expect(c014).toBeDefined();
    expect(c014?.severity).toBe("S3");
    expect(result.signals.partsUsedPresent).toBe(false);
    expect(result.signals.lineCount).toBe(0);
    expect(result.signals.consumablesYes).toBe(true);
  });

  it("PX-116: slash-separated Parts Used header chrome is also soft-pathed", () => {
    const result = evaluatePartsUsed(CONSUMABLES_YES_HEADER_SLASH_CHROME);
    expect(result.findings.some(f => f.ruleId === "PARTS-C012")).toBe(false);
    expect(result.findings.some(f => f.ruleId === "PARTS-C014")).toBe(true);
    expect(result.signals.lineCount).toBe(0);
  });

  it("PR-A: still emits MAJOR PARTS-C012 when Parts Used has real but unparseable content", () => {
    const result = evaluatePartsUsed(PARTS_USED_UNPARSEABLE);
    expect(result.findings.some(f => f.ruleId === "PARTS-C012")).toBe(true);
    expect(result.findings.some(f => f.ruleId === "PARTS-C014")).toBe(false);
  });

  /**
   * Pack v1 / Run019: catalogue never fired PARTS-C012 (partsUsed=0/56).
   * Itemised-parts gap = repairs + non-empty but incomplete Parts Used lines.
   */
  it("Pack v1 TEST-UAT-PARTS-GAP: implied parts with incomplete lines emit PARTS-C012", () => {
    const text = `
Job Summary Report
TEST-UAT-PARTS-GAP
Repairs Required: Replace cracked hinge and refit platform
Parts Used
WT158
hinge kit only
Technician Signature
`;
    const result = evaluatePartsUsed(text);
    expect(result.signals.partsImplied).toBe(true);
    const c012 = result.findings.find(f => f.ruleId === "PARTS-C012");
    expect(c012).toBeTruthy();
    expect(c012!.severity).toBe("S1");
    expect(result.findings.some(f => f.ruleId === "PARTS-C014")).toBe(false);
  });

  it("PX-109 residual: 'Nil required' in Parts Used is treated like None, not MAJOR (Vacuum-class repairs-only)", () => {
    const result = evaluatePartsUsed(REPAIRS_ONLY_PARTS_NOT_REQUIRED);
    expect(result.findings.some(f => f.ruleId === "PARTS-C012")).toBe(false);
    const c014 = result.findings.find(f => f.ruleId === "PARTS-C014");
    expect(c014).toBeDefined();
    expect(c014?.severity).toBe("S3");
    expect(result.signals.completeCount).toBe(0);
  });

  it("PX-109 residual: 'No parts required' in Parts Used is treated like None, not MAJOR", () => {
    const result = evaluatePartsUsed(REPAIRS_ONLY_NO_PARTS_REQUIRED_PHRASE);
    expect(result.findings.some(f => f.ruleId === "PARTS-C012")).toBe(false);
    expect(result.findings.some(f => f.ruleId === "PARTS-C014")).toBe(true);
  });

  it("skips when no parts context is implied", () => {
    const result = evaluatePartsUsed(NO_PARTS_CONTEXT);
    expect(result.findings).toHaveLength(0);
    expect(result.signals.partsImplied).toBe(false);
  });

  it("returns no findings when feature flag is off", () => {
    process.env[FEATURE_PARTS_LINE_ASSESSMENT] = "false";
    expect(isPartsLineAssessmentEnabled()).toBe(false);
    const result = evaluatePartsUsed(PN_ONLY);
    expect(result.findings).toHaveLength(0);
  });

  it("is enabled by default when flag unset", () => {
    expect(isPartsLineAssessmentEnabled()).toBe(true);
  });

  it("remains enabled for true and disabled for 0", () => {
    process.env[FEATURE_PARTS_LINE_ASSESSMENT] = "true";
    expect(isPartsLineAssessmentEnabled()).toBe(true);
    process.env[FEATURE_PARTS_LINE_ASSESSMENT] = "0";
    expect(isPartsLineAssessmentEnabled()).toBe(false);
  });

  it("suggestedFix is concrete for PARTS-C010", () => {
    const result = evaluatePartsUsed(PN_ONLY);
    const finding = result.findings.find(f => f.ruleId === "PARTS-C010");
    expect(finding?.suggestedFix).toMatch(/WT158/);
    expect(finding?.suggestedFix).not.toMatch(/^Add a description\.?$/i);
  });
});

describe("policy seeds for parts assessment", () => {
  it("includes PARTS-C010–C014 with correct failClass", () => {
    const rules = DEFAULT_AUDIT_POLICY.forms["job-summary-v1"].rules;
    expect(rules.find(r => r.ruleId === "PARTS-C010")!.failClass).toBe("minor");
    expect(rules.find(r => r.ruleId === "PARTS-C011")!.failClass).toBe("minor");
    expect(rules.find(r => r.ruleId === "PARTS-C012")!.failClass).toBe("major");
    expect(rules.find(r => r.ruleId === "PARTS-C013")!.failClass).toBe(
      "informational"
    );
    expect(rules.find(r => r.ruleId === "PARTS-C014")!.failClass).toBe(
      "informational"
    );
  });
});

describe("PR-A: PARTS-C014 never blocks AUTO_PASS", () => {
  it("is not in AUTO_PASS_BLOCKING_RULE_IDS", async () => {
    const { AUTO_PASS_BLOCKING_RULE_IDS } = await import(
      "../../services/validation/goldSpecBridge"
    );
    expect(AUTO_PASS_BLOCKING_RULE_IDS.has("PARTS-C014")).toBe(false);
  });
});

describe("documentProcessor wiring", () => {
  it("wires parts assessment after comment quality", () => {
    const src = readFileSync(
      resolve(__dirname, "../../services/documentProcessor.ts"),
      "utf8"
    );
    expect(src).toContain("evaluatePartsUsed");
    expect(src).toContain("[PARTS_ASSESSMENT]");
    expect(src.indexOf("evaluateCommentQuality")).toBeLessThan(
      src.indexOf("evaluatePartsUsed")
    );
  });
});
