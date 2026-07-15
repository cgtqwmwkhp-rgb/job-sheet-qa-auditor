/**
 * Engineer attribution gap findings contracts (ATTR-C010–C012).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  evaluateEngineerAttribution,
  FEATURE_ENGINEER_ATTR_FINDING,
} from "../../services/engineerAttributionFindings";
import { DEFAULT_AUDIT_POLICY } from "../../services/auditPolicy/defaults";

const RICHARD_USER = [
  {
    id: 9,
    name: "Richard Newton",
    email: "richard.newton@example.com",
    role: "technician" as const,
  },
];

const REPORT_WITH_STRUCTURED_NAME = {
  extractedFields: {
    technicianName: { value: "Richard.Newton", confidence: 0.92 },
  },
  extractedText: "Job Summary Report\nTechnician Name: Richard.Newton",
};

const REPORT_WITH_TEXT_ONLY = {
  extractedFields: {},
  extractedText:
    "Job Summary Report\nTechnician Name: Richard.Newton\nEngineer Comments: Coupling cracked.",
};

const REPORT_NO_NAME = {
  extractedFields: { engineerSignOff: { value: "Present", confidence: 90 } },
  extractedText: "Job Summary Report\nEngineer Comments: Coupling cracked.",
};

const REPORT_UNKNOWN_NAME = {
  extractedFields: { engineer_name: "Unknown Tech XYZ" },
  extractedText: "Technician Name: Unknown Tech XYZ",
};

describe("evaluateEngineerAttribution", () => {
  const prevFlag = process.env[FEATURE_ENGINEER_ATTR_FINDING];

  afterEach(() => {
    if (prevFlag === undefined)
      delete process.env[FEATURE_ENGINEER_ATTR_FINDING];
    else process.env[FEATURE_ENGINEER_ATTR_FINDING] = prevFlag;
  });

  beforeEach(() => {
    delete process.env[FEATURE_ENGINEER_ATTR_FINDING];
  });

  it("emits ATTR-C010 when no engineer name is extractable", () => {
    const result = evaluateEngineerAttribution({
      report: REPORT_NO_NAME,
      candidates: RICHARD_USER,
    });
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].ruleId).toBe("ATTR-C010");
    expect(result.findings[0].severity).toBe("S2");
    expect(result.findings[0].reasonCode).toBe("INCOMPLETE_EVIDENCE");
    expect(result.findings[0].rawSnippet).toBe("(no engineer name)");
    expect(result.attribution.extractedName).toBeNull();
  });

  it("emits ATTR-C011 when name extracted but user match fails", () => {
    const result = evaluateEngineerAttribution({
      report: REPORT_UNKNOWN_NAME,
      candidates: RICHARD_USER,
    });
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].ruleId).toBe("ATTR-C011");
    expect(result.findings[0].severity).toBe("S2");
    expect(result.findings[0].reasonCode).toBe("INCOMPLETE_EVIDENCE");
    expect(result.findings[0].rawSnippet).toContain("Unknown Tech XYZ");
    expect(result.attribution.technicianId).toBeNull();
  });

  it("emits ATTR-C012 when structured technicianName matches a user", () => {
    const result = evaluateEngineerAttribution({
      report: REPORT_WITH_STRUCTURED_NAME,
      candidates: RICHARD_USER,
    });
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].ruleId).toBe("ATTR-C012");
    expect(result.findings[0].severity).toBe("S3");
    expect(result.findings[0].reasonCode).toBe("LOW_CONFIDENCE");
    expect(result.findings[0].rawSnippet).toContain("Richard.Newton");
    expect(result.attribution.technicianId).toBe(9);
    expect(result.attribution.confidence).toBe("exact");
  });

  it("matches Richard.Newton from OCR text fallback", () => {
    const result = evaluateEngineerAttribution({
      report: REPORT_WITH_TEXT_ONLY,
      candidates: RICHARD_USER,
    });
    expect(result.findings.some(f => f.ruleId === "ATTR-C012")).toBe(true);
    expect(result.attribution.technicianId).toBe(9);
  });

  it("returns no findings when feature flag is off", () => {
    process.env[FEATURE_ENGINEER_ATTR_FINDING] = "false";
    const result = evaluateEngineerAttribution({
      report: REPORT_NO_NAME,
      candidates: RICHARD_USER,
    });
    expect(result.findings).toHaveLength(0);
    expect(result.summary).toMatch(/disabled/i);
  });
});

describe("ATTR-C audit policy seeds", () => {
  it("seeds ATTR minors and informational pass on job-summary-v1", () => {
    const rules = DEFAULT_AUDIT_POLICY.forms["job-summary-v1"].rules;
    for (const id of ["ATTR-C010", "ATTR-C011", "ATTR-C012"]) {
      expect(rules.find(r => r.ruleId === id)).toBeDefined();
    }
    expect(rules.find(r => r.ruleId === "ATTR-C010")!.failClass).toBe("minor");
    expect(rules.find(r => r.ruleId === "ATTR-C011")!.failClass).toBe("minor");
    expect(rules.find(r => r.ruleId === "ATTR-C012")!.failClass).toBe(
      "informational"
    );
  });
});

describe("documentProcessor wiring", () => {
  it("wires engineer attribution findings before audit policy", () => {
    const src = readFileSync(
      resolve(__dirname, "../../services/documentProcessor.ts"),
      "utf8"
    );
    expect(src).toContain("evaluateEngineerAttribution");
    expect(src).toContain("[ENGINEER_ATTRIBUTION]");
    expect(src).toContain("attribution: engineerAttributionStamp");
    const attrIdx = src.indexOf("evaluateEngineerAttribution");
    const autoPassIdx = src.indexOf("canPromoteAutoPass");
    const auditPolicyIdx = src.indexOf("applyAuditPolicy");
    expect(attrIdx).toBeGreaterThan(-1);
    expect(attrIdx).toBeLessThan(autoPassIdx);
    expect(attrIdx).toBeLessThan(auditPolicyIdx);
  });
});
