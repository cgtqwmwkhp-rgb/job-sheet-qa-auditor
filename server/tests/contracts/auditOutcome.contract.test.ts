/**
 * PX-061: Pass badge must not appear on unvalidated / review_queue sheets.
 */

import { describe, expect, it } from "vitest";
import {
  deriveWorkstationOutcome,
  mapAuditResultToUiStatus,
} from "@/lib/auditOutcome";

describe("auditOutcome mapping (PX-061)", () => {
  it("maps review_queue audit result to needs_review (not passed)", () => {
    expect(
      mapAuditResultToUiStatus({
        auditResult: "review_queue",
        jobSheetStatus: "review_queue",
      })
    ).toBe("needs_review");
  });

  it("does not treat completed job sheet as pass when audit is review_queue", () => {
    expect(
      mapAuditResultToUiStatus({
        auditResult: "review_queue",
        jobSheetStatus: "completed",
      })
    ).toBe("needs_review");
  });

  it("does not treat completed job sheet as pass when audit is fail", () => {
    expect(
      mapAuditResultToUiStatus({
        auditResult: "fail",
        jobSheetStatus: "completed",
      })
    ).toBe("failed");
  });

  it("badge stays Needs review for review_queue even with zero open findings", () => {
    const badge = deriveWorkstationOutcome({
      auditResult: "review_queue",
      jobSheetStatus: "review_queue",
      hasOpenMajorFindings: false,
      hasOpenNonMajorFindings: false,
    });
    expect(badge.label).toBe("Needs review");
    expect(badge.status).toBe("needs_review");
  });

  it("never promotes pending empty findings to Pass", () => {
    const badge = deriveWorkstationOutcome({
      auditResult: null,
      jobSheetStatus: "pending",
      hasOpenMajorFindings: false,
      hasOpenNonMajorFindings: false,
    });
    expect(badge.label).not.toBe("Pass");
  });

  it("keeps Pass when only soft S3 advisories remain (no open minors)", () => {
    const badge = deriveWorkstationOutcome({
      auditResult: "pass",
      jobSheetStatus: "completed",
      hasOpenMajorFindings: false,
      hasOpenNonMajorFindings: false,
    });
    expect(badge.label).toBe("Pass");
    expect(badge.status).toBe("passed");
  });

  it("demotes Pass to Needs review when an open Minor remains", () => {
    const badge = deriveWorkstationOutcome({
      auditResult: "pass",
      jobSheetStatus: "completed",
      hasOpenMajorFindings: false,
      hasOpenNonMajorFindings: true,
    });
    expect(badge.label).toBe("Needs review");
  });
});
