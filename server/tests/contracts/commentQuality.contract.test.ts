/**
 * Clinical comment quality contracts (COMMENT-C010–C050 / C041).
 */

import { describe, it, expect } from "vitest";
import {
  analyzeCommentNarrative,
  evaluateCommentQuality,
} from "../../services/commentQuality";
import { evaluateJobSummaryConsistency } from "../../services/jobSummaryConsistency";
import { DEFAULT_AUDIT_POLICY } from "../../services/auditPolicy/defaults";
import { readFileSync } from "fs";
import { resolve } from "path";

const FAILURE_PATH_HEADER = `
Job Summary Report
VOR: Yes
Is the asset safe to use?: No
Is a return visit required?: Yes
Were all works fully completed?: No
`;

const COHERENT_JOB_87 = `
${FAILURE_PATH_HEADER}
Repairs Required: Coupling jaw cracked; wheel bearing noise on nearside.

Parts Still Required: coupling assembly, wheel bearing

Engineer Comments: Nearside coupling jaw cracked — asset unsafe / VOR.
Parts still required: coupling assembly and wheel bearing.
Return visit required to fit parts and retest.

Technician Signature
`;

const MISSING_COMMENTS = `
${FAILURE_PATH_HEADER}
Repairs Required: Brake pads worn.

Engineer Comments: N/A

Technician Signature
`;

const VAGUE_ONLY = `
${FAILURE_PATH_HEADER}
Repairs Required: Specify in repairs.

Engineer Comments: VOR see above

Technician Signature
`;

const THIN_NO_ACTION = `
${FAILURE_PATH_HEADER}
Parts Still Required: coupling jaw PN-99

Engineer Comments: Coupling looks damaged on inspection today afternoon.

Technician Signature
`;

describe("analyzeCommentNarrative", () => {
  it("detects clinical axes on coherent Job-87 style notes", () => {
    const a = analyzeCommentNarrative(COHERENT_JOB_87);
    expect(a.present).toBe(true);
    expect(a.hasWhat).toBe(true);
    expect(a.hasNextAction || a.hasPartsStance).toBe(true);
    expect(a.isVagueOnly).toBe(false);
  });

  it("rejects vague-only notes", () => {
    const a = analyzeCommentNarrative(VAGUE_ONLY);
    expect(a.present).toBe(false);
  });
});

describe("evaluateCommentQuality", () => {
  it("emits COMMENT-C041 for coherent failure-path narrative", () => {
    const result = evaluateCommentQuality(COHERENT_JOB_87);
    expect(result.signals.onFailurePath).toBe(true);
    expect(result.signals.coherent).toBe(true);
    expect(result.findings.some(f => f.ruleId === "COMMENT-C041")).toBe(true);
    expect(result.findings.every(f => f.severity === "S3")).toBe(true);
  });

  it("emits COMMENT-C010 when comments missing", () => {
    const result = evaluateCommentQuality(MISSING_COMMENTS);
    expect(result.findings.some(f => f.ruleId === "COMMENT-C010")).toBe(true);
    expect(result.findings[0].suggestedFix.length).toBeGreaterThan(20);
  });

  it("emits COMMENT-C020/C040 when what present but no actionable next step", () => {
    const result = evaluateCommentQuality(THIN_NO_ACTION);
    const ids = result.findings.map(f => f.ruleId);
    expect(ids.some(id => id === "COMMENT-C020" || id === "COMMENT-C040")).toBe(
      true
    );
  });

  it("skips COMMENT rules when not on failure path (no Fault Reason)", () => {
    const result = evaluateCommentQuality(`
Job Summary Report
Is the asset safe to use?: Yes
Were all works fully completed?: Yes
Engineer Comments: Routine service completed, no defects found on inspection.
`);
    expect(result.findings).toHaveLength(0);
    expect(result.summary).toMatch(/skipped/i);
  });

  it("emits FAULT-C010 for placeholder Fault Reason even off failure path", () => {
    const result = evaluateCommentQuality(
      `
Job Summary Report
Is the asset safe to use?: Yes
Were all works fully completed?: Yes
Fault Reason: Reason
Engineer Comments: Fitted WT158 wheel and reflector, completed works on site.
Technician Signature
`,
      { faultReason: "Reason" }
    );
    expect(result.findings.some(f => f.ruleId === "FAULT-C010")).toBe(true);
    expect(result.findings.find(f => f.ruleId === "FAULT-C010")!.severity).toBe(
      "S2"
    );
    expect(result.signals.placeholderFaultReason).toBe(true);
  });

  it("emits FAULT-C010 + blocks COMMENT-C041 when Fault Reason is Reason", () => {
    const sheet = `
${FAILURE_PATH_HEADER}
Fault Reason: Reason
Repairs Required: Coupling jaw cracked; wheel bearing noise on nearside.

Parts Still Required: coupling assembly, wheel bearing

Engineer Comments: Nearside coupling jaw cracked — asset unsafe / VOR.
Parts still required: coupling assembly and wheel bearing.
Return visit required to fit parts and retest.

Technician Signature
`;
    const result = evaluateCommentQuality(sheet, { faultReason: "Reason" });
    expect(result.findings.some(f => f.ruleId === "FAULT-C010")).toBe(true);
    expect(result.findings.some(f => f.ruleId === "COMMENT-C041")).toBe(false);
    expect(result.signals.coherent).toBe(false);
  });

  it("does not treat Wear & Tear as placeholder", () => {
    const result = evaluateCommentQuality(COHERENT_JOB_87, {
      faultReason: "Wear & Tear",
    });
    expect(result.findings.some(f => f.ruleId === "FAULT-C010")).toBe(false);
    expect(result.findings.some(f => f.ruleId === "COMMENT-C041")).toBe(true);
  });

  it("coach suggestedFix is concrete, not 'add more detail'", () => {
    const result = evaluateCommentQuality(MISSING_COMMENTS);
    const fix = result.findings[0].suggestedFix.toLowerCase();
    expect(fix).not.toMatch(/^add more detail/);
    expect(fix).toMatch(/defect|coupling|return|parts/);
  });
});

describe("COMMENT-C supersedes JSR-C080 when skipEngineerCommentRules", () => {
  it("JSR skips C080 when skipEngineerCommentRules true", () => {
    const jsr = evaluateJobSummaryConsistency(MISSING_COMMENTS, {
      skipEngineerCommentRules: true,
    });
    expect(jsr.findings.some(f => f.ruleId === "JSR-C080")).toBe(false);
    expect(jsr.findings.some(f => f.ruleId === "JSR-C081")).toBe(false);
  });

  it("JSR still emits C080 by default", () => {
    const jsr = evaluateJobSummaryConsistency(MISSING_COMMENTS);
    expect(jsr.findings.some(f => f.ruleId === "JSR-C080")).toBe(true);
  });
});

describe("COMMENT-C audit policy seeds", () => {
  it("seeds COMMENT majors/minors on job-summary-v1", () => {
    const rules = DEFAULT_AUDIT_POLICY.forms["job-summary-v1"].rules;
    for (const id of [
      "COMMENT-C010",
      "COMMENT-C020",
      "COMMENT-C030",
      "COMMENT-C040",
      "COMMENT-C050",
      "COMMENT-C041",
      "COMMENT-C042",
      "FAULT-C010",
    ]) {
      expect(rules.find(r => r.ruleId === id)).toBeDefined();
    }
    expect(rules.find(r => r.ruleId === "COMMENT-C010")!.failClass).toBe(
      "major"
    );
    expect(rules.find(r => r.ruleId === "COMMENT-C030")!.failClass).toBe(
      "minor"
    );
    expect(rules.find(r => r.ruleId === "FAULT-C010")!.failClass).toBe("minor");
    expect(rules.find(r => r.ruleId === "COMMENT-C042")!.failClass).toBe(
      "minor"
    );
  });
});

describe("documentProcessor wiring", () => {
  it("wires comment quality + skipEngineerCommentRules + fault reason", () => {
    const src = readFileSync(
      resolve(__dirname, "../../services/documentProcessor.ts"),
      "utf8"
    );
    expect(src).toContain("evaluateCommentQuality");
    expect(src).toContain("skipEngineerCommentRules: true");
    expect(src).toContain("[COMMENT_QUALITY]");
    expect(src).toContain("commentQualitySignals");
    expect(src).toContain("faultReasonExtracted");
  });
});
