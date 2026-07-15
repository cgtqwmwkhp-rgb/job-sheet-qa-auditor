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

  it("emits PARTS-C012 when parts implied but no complete lines", () => {
    const result = evaluatePartsUsed(IMPLIED_NO_LINES);
    expect(result.findings.some(f => f.ruleId === "PARTS-C012")).toBe(true);
    expect(result.signals.completeCount).toBe(0);
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
  it("includes PARTS-C010–C013 with correct failClass", () => {
    const rules = DEFAULT_AUDIT_POLICY.forms["job-summary-v1"].rules;
    expect(rules.find(r => r.ruleId === "PARTS-C010")!.failClass).toBe("minor");
    expect(rules.find(r => r.ruleId === "PARTS-C011")!.failClass).toBe("minor");
    expect(rules.find(r => r.ruleId === "PARTS-C012")!.failClass).toBe("major");
    expect(rules.find(r => r.ruleId === "PARTS-C013")!.failClass).toBe(
      "informational"
    );
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
