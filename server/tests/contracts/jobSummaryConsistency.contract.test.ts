/**
 * Job Summary failure-path consistency contracts.
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  evaluateJobSummaryConsistency,
  extractFailurePathSignals,
  hasSubstantiveEngineerComments,
} from "../../services/jobSummaryConsistency";

const QSGGB1_LIKE = `
Job Summary Report
This Vehicle is marked as VOR
Asset No: BN21ACO_TL
Make/Model: TAILLIFT
Asset Mileage/Hours: 74685
Completion Details
Type of service completed: Service - Other - Specify in Repairs
Was the service fully completed: No
Have all of the additional tasks been completed: No
Were all works fully completed?: No
Is a return visit required?: Yes
Is the asset safe to use?: No
Next Service Date: 28/10/2024
Technician Signature
`;

const QSGGB1_WITH_COMMENTS = `${QSGGB1_LIKE}
Engineer Comments: Tail lift platform structure cracked at hinge. Not safe for load.
Parts required: hinge assembly. Action: replace hinge and retest on return visit.
`;

describe("jobSummaryConsistency", () => {
  it("extracts failure-path signals from Job Summary completion block", () => {
    const s = extractFailurePathSignals(QSGGB1_LIKE, { failMarkCount: 1 });
    expect(s.vor).toBe(true);
    expect(s.unsafe).toBe(true);
    expect(s.returnVisit).toBe(true);
    expect(s.incomplete).toBe(true);
    expect(s.repairsPath).toBe(true);
    expect(s.failMarkCount).toBe(1);
    expect(s.onFailurePath).toBe(true);
    expect(s.hasSubstantiveComments).toBe(false);
  });

  it("reports consistent relationships as Passed findings (S3)", () => {
    const result = evaluateJobSummaryConsistency(QSGGB1_WITH_COMMENTS, {
      failMarkCount: 1,
    });
    expect(result.hasBlockingIssues).toBe(false);
    expect(result.findings.some(f => f.severity === "S1")).toBe(false);
    expect(
      result.findings.some(
        f =>
          f.fieldName === "VOR ↔ Safe to Use" &&
          f.severity === "S3" &&
          /Consistent/i.test(f.normalisedSnippet)
      )
    ).toBe(true);
    expect(
      result.findings.some(
        f =>
          f.fieldName === "Return Visit Required" &&
          /Consistent/i.test(f.normalisedSnippet)
      )
    ).toBe(true);
    expect(
      result.findings.some(
        f =>
          f.fieldName === "Engineer Comments (Failure Path)" &&
          f.severity === "S3"
      )
    ).toBe(true);
    expect(
      result.findings.some(f => f.fieldName === "Failure Path Judgment")
    ).toBe(true);
  });

  it("flags missing engineer comments on an otherwise consistent failure path", () => {
    const result = evaluateJobSummaryConsistency(QSGGB1_LIKE, {
      failMarkCount: 1,
    });
    expect(result.hasBlockingIssues).toBe(true);
    const comments = result.findings.find(
      f => f.fieldName === "Engineer Comments (Failure Path)"
    );
    expect(comments?.severity).toBe("S1");
    expect(comments?.reasonCode).toBe("INCOMPLETE_EVIDENCE");
    // Relationships themselves still reported as consistent Passed findings
    expect(
      result.findings.some(
        f => f.fieldName === "VOR ↔ Safe to Use" && f.severity === "S3"
      )
    ).toBe(true);
  });

  it("fails VOR + safe to use Yes", () => {
    const text = `
This Vehicle is marked as VOR
Is the asset safe to use?: Yes
Is a return visit required?: Yes
Were all works fully completed?: No
Engineer Comments: Platform cracked; replace hinge assembly on return visit.
`;
    const result = evaluateJobSummaryConsistency(text);
    expect(result.hasBlockingIssues).toBe(true);
    expect(
      result.findings.some(
        f => f.fieldName === "VOR ↔ Safe to Use" && f.reasonCode === "CONFLICT"
      )
    ).toBe(true);
  });

  it("fails unsafe without return visit", () => {
    const text = `
This Vehicle is marked as VOR
Is the asset safe to use?: No
Is a return visit required?: No
Were all works fully completed?: No
Engineer Comments: Hydraulic leak on lift column; isolate asset pending parts.
`;
    const result = evaluateJobSummaryConsistency(text);
    expect(
      result.findings.some(
        f =>
          f.fieldName === "Return Visit Required" && f.reasonCode === "CONFLICT"
      )
    ).toBe(true);
  });

  it("fails incomplete works without return visit", () => {
    const text = `
Were all works fully completed?: No
Is a return visit required?: No
Is the asset safe to use?: Yes
`;
    const result = evaluateJobSummaryConsistency(text);
    expect(result.signals.onFailurePath).toBe(true);
    expect(
      result.findings.some(f => /Incomplete ↔ Return Visit/.test(f.fieldName))
    ).toBe(true);
  });

  it("rejects thin comment noise", () => {
    expect(
      hasSubstantiveEngineerComments("Engineer Comments: VOR").present
    ).toBe(false);
    expect(
      hasSubstantiveEngineerComments(
        "Engineer Comments: Tail lift hinge cracked under load; replace hinge kit and retest."
      ).present
    ).toBe(true);
  });

  it("does not false-fail when OCR flattens the page into one line", () => {
    const flat = QSGGB1_WITH_COMMENTS.replace(/\n+/g, " ");
    const signals = extractFailurePathSignals(flat, { failMarkCount: 0 });
    expect(signals.returnVisit).toBe(true);
    expect(signals.returnVisitNo).toBe(false);
    expect(signals.incomplete).toBe(true);
    expect(signals.worksCompleteYes).toBe(false);

    const result = evaluateJobSummaryConsistency(flat, { failMarkCount: 0 });
    const issues = result.findings.filter(f => f.severity === "S1");
    expect(issues.map(f => f.fieldName)).toEqual([]);
    expect(result.hasBlockingIssues).toBe(false);
  });

  it("on flattened text without comments, only engineer-comments is an Issue", () => {
    const flat = QSGGB1_LIKE.replace(/\n+/g, " ");
    const result = evaluateJobSummaryConsistency(flat, { failMarkCount: 0 });
    const issues = result.findings.filter(f => f.severity === "S1");
    expect(issues).toHaveLength(1);
    expect(issues[0]?.fieldName).toBe("Engineer Comments (Failure Path)");
  });

  it("documentProcessor wires FAILURE_PATH stage", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../../services/documentProcessor.ts"),
      "utf8"
    );
    expect(src).toContain("evaluateJobSummaryConsistency");
    expect(src).toContain("[FAILURE_PATH]");
    expect(src).toContain("Failure Path Consistency");
  });
});
