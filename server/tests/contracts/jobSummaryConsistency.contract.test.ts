/**
 * Job Summary failure-path consistency contracts.
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  evaluateJobSummaryConsistency,
  extractCompletionYesNo,
  extractFailurePathSignals,
  hasSubstantiveEngineerComments,
} from "../../services/jobSummaryConsistency";

/** Real pdftotext -layout excerpt from DV23VSJ inverter compliance sheet. */
const DV23_COMPLETION_GRID = `
                                                              Completion Details
             Date:                    02/07/2026               Compliance Type:                               Service - SB

     Next Service Date:               02/07/2027               Compliance Title:                           Inverter Inspection

    Service Completed?                                      Additional Tasks Complete?
                                           Yes                                                                    Yes

    All Works Completed?                   Yes                Return Visit Needed?                                 No

    Consumables Used?                       No                 Asset Safe To Use?                                 Yes


   Job Duration:             0.8        Overtime:            No            Travel :           1.0      Job ID :           485
`;

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

  it("blank Parts Still Required + Return No does not raise parts-return Issue", () => {
    const text = `
Job Summary Report
Asset No: DV23VSJ
All Works Completed? Yes
Return Visit Needed? No
Asset Safe To Use? Yes
Repairs Required
Parts Used
Parts Still Required
Technician Name: nicholas.lawrence
`;
    const signals = extractFailurePathSignals(text);
    expect(signals.partsStillRequired).toBe(false);
    expect(signals.partsUsed).toBe(false);
    expect(signals.returnVisitNo).toBe(true);
    const result = evaluateJobSummaryConsistency(text);
    expect(
      result.findings.some(f =>
        /Parts Still Required ↔ Return Visit/.test(f.fieldName)
      )
    ).toBe(false);
  });

  it("Parts Still Required + Return No raises JSR-C090 Major Issue", () => {
    const text = `
Job Summary Report
Return Visit Needed? No
All Works Completed? No
Asset Safe To Use? Yes
Repairs Required
Parts Used
Parts Still Required
hinge assembly kit
Technician Name: nicholas.lawrence
Engineer Comments: Waiting on hinge kit; return to fit and retest.
`;
    const signals = extractFailurePathSignals(text);
    expect(signals.partsStillRequired).toBe(true);
    expect(signals.onFailurePath).toBe(true);
    const result = evaluateJobSummaryConsistency(text);
    const issue090 = result.findings.find(
      f =>
        f.ruleId === "JSR-C090" ||
        /Parts Still Required ↔ Return Visit/.test(f.fieldName)
    );
    expect(issue090?.severity).toBe("S1");
    expect(issue090?.reasonCode).toBe("CONFLICT");
    expect(result.hasBlockingIssues).toBe(true);
  });

  it("Parts Used alone + Return No does not raise parts-return Issue", () => {
    const text = `
Job Summary Report
Return Visit Needed? No
All Works Completed? Yes
Asset Safe To Use? Yes
Repairs Required
Parts Used
13A fuse x2
Parts Still Required
Technician Name: nicholas.lawrence
`;
    const signals = extractFailurePathSignals(text);
    expect(signals.partsUsed).toBe(true);
    expect(signals.partsStillRequired).toBe(false);
    expect(signals.repairsPath).toBe(false);
    expect(signals.onFailurePath).toBe(false);
    const result = evaluateJobSummaryConsistency(text);
    expect(
      result.findings.some(f =>
        /Parts Still Required ↔ Return Visit/.test(f.fieldName)
      )
    ).toBe(false);
    expect(result.hasBlockingIssues).toBe(false);
  });

  it("Parts Still Required + Return Visit unknown raises JSR-C093 INCOMPLETE_EVIDENCE", () => {
    const text = `
Job Summary Report
All Works Completed? No
Asset Safe To Use? Yes
Repairs Required
Parts Used
Parts Still Required
hinge assembly kit
Technician Name: nicholas.lawrence
Engineer Comments: Waiting on hinge kit; return to fit and retest.
`;
    const result = evaluateJobSummaryConsistency(text);
    const issue093 = result.findings.find(
      f =>
        f.ruleId === "JSR-C093" &&
        /Parts Still Required ↔ Return Visit/.test(f.fieldName)
    );
    expect(issue093?.severity).toBe("S1");
    expect(issue093?.reasonCode).toBe("INCOMPLETE_EVIDENCE");
    expect(result.hasBlockingIssues).toBe(true);
    expect(
      result.findings.some(f => f.ruleId === "JSR-C090")
    ).toBe(false);
  });

  it("Parts Still Required + Return Yes is coherent (JSR-C092 Passed)", () => {
    const text = `
Job Summary Report
Return Visit Needed? Yes
All Works Completed? No
Asset Safe To Use? No
This Vehicle is marked as VOR
Repairs Required
replace hinge
Parts Used
Parts Still Required
hinge assembly kit
Technician Name: bob
Engineer Comments: Hinge cracked; ordered kit; return visit to fit and retest.
`;
    const result = evaluateJobSummaryConsistency(text);
    expect(
      result.findings.some(
        f =>
          f.ruleId === "JSR-C092" &&
          f.severity === "S3" &&
          /Consistent/i.test(f.normalisedSnippet)
      )
    ).toBe(true);
    expect(
      result.findings.some(
        f =>
          /Parts Still Required ↔ Return Visit/.test(f.fieldName) &&
          f.severity === "S1"
      )
    ).toBe(false);
  });

  it("Parts Still Required + All Works Completed Yes raises JSR-C091", () => {
    const text = `
Job Summary Report
Return Visit Needed? Yes
All Works Completed? Yes
Service Completed? Yes
Additional Tasks Complete? Yes
Asset Safe To Use? Yes
Parts Still Required
relay module RM-4
Technician Name: bob
Engineer Comments: Need relay module on return; cannot close works yet.
`;
    const result = evaluateJobSummaryConsistency(text);
    const issue091 = result.findings.find(
      f =>
        f.ruleId === "JSR-C091" ||
        /Parts Still Required ↔ Works Completion/.test(f.fieldName)
    );
    expect(issue091?.severity).toBe("S1");
    expect(issue091?.reasonCode).toBe("CONFLICT");
  });

  it("does not treat bare parts-required wording in comments as repairsPath", () => {
    const text = `
Job Summary Report
Return Visit Needed? No
All Works Completed? Yes
Asset Safe To Use? Yes
Repairs Required
Parts Used
Parts Still Required
Technician Name: bob
Engineer Comments: Routine service complete; no parts required this visit.
`;
    const signals = extractFailurePathSignals(text);
    expect(signals.repairsPath).toBe(false);
    expect(signals.partsStillRequired).toBe(false);
    expect(signals.onFailurePath).toBe(false);
  });

  it("reads DV23 two-column completion grid (Safe Yes, Return No, works complete)", () => {
    expect(
      extractCompletionYesNo(DV23_COMPLETION_GRID, [
        /Asset\s+Safe\s+To\s+Use\??/i,
      ])
    ).toBe("yes");
    expect(
      extractCompletionYesNo(DV23_COMPLETION_GRID, [
        /Return\s+Visit\s+Needed\??/i,
      ])
    ).toBe("no");
    expect(
      extractCompletionYesNo(DV23_COMPLETION_GRID, [
        /All\s+Works\s+Completed\??/i,
      ])
    ).toBe("yes");
    expect(
      extractCompletionYesNo(DV23_COMPLETION_GRID, [/Service\s+Completed\??/i])
    ).toBe("yes");
    expect(
      extractCompletionYesNo(DV23_COMPLETION_GRID, [
        /Additional\s+Tasks\s+Complete\??/i,
      ])
    ).toBe("yes");

    const signals = extractFailurePathSignals(DV23_COMPLETION_GRID, {
      failMarkCount: 0,
    });
    expect(signals.safeYes).toBe(true);
    expect(signals.unsafe).toBe(false);
    expect(signals.returnVisitNo).toBe(true);
    expect(signals.returnVisit).toBe(false);
    expect(signals.worksCompleteYes).toBe(true);
    expect(signals.incomplete).toBe(false);
    expect(signals.onFailurePath).toBe(false);

    const result = evaluateJobSummaryConsistency(DV23_COMPLETION_GRID, {
      failMarkCount: 0,
    });
    expect(result.hasBlockingIssues).toBe(false);
    expect(result.findings).toEqual([]);
  });
});
