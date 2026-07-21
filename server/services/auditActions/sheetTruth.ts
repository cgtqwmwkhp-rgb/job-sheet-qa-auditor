/**
 * Sheet-level truth after human review (Wave-4 A2 / PR2 Trust Safety).
 *
 * Recalculates audit/job-sheet outcome from findings after override/waive/
 * approve so stale auto FAIL/PASS scores cannot linger.
 *
 * PX-062: `approved` means the human confirmed the defect stands — it must
 * never clear the finding for pass-rate honesty. Only override/waive dispose.
 */

import type { ResolutionStatus } from "./types";

export type FindingSeverity = "S0" | "S1" | "S2" | "S3";

export type SheetResult = "pass" | "fail" | "review_queue" | "waived";

export interface SheetTruthFinding {
  severity: FindingSeverity;
  resolutionStatus: ResolutionStatus;
}

/** Still counts against sheet outcome (open review or confirmed defect). */
function isStandingDefect(status: ResolutionStatus): boolean {
  return status === "open" || status === "flagged" || status === "approved";
}

function isCritical(severity: FindingSeverity): boolean {
  return severity === "S0" || severity === "S1";
}

/**
 * Derive sheet/audit result from current finding resolutions.
 *
 * - Any open/flagged/approved S0/S1 → fail
 * - Else any open/flagged/approved S2/S3 → review_queue
 * - Else all waived → waived
 * - Else all disposed via override/waive (no standing defects) → pass
 */
export function deriveSheetResultFromFindings(
  findings: readonly SheetTruthFinding[]
): SheetResult {
  if (findings.length === 0) return "pass";

  const standing = findings.filter(f => isStandingDefect(f.resolutionStatus));

  if (standing.length === 0) {
    const allWaived = findings.every(f => f.resolutionStatus === "waived");
    return allWaived ? "waived" : "pass";
  }

  if (standing.some(f => isCritical(f.severity))) {
    return "fail";
  }

  return "review_queue";
}

/** Map sheet result onto job_sheets.status. */
export function sheetResultToJobSheetStatus(
  result: SheetResult
): "completed" | "failed" | "review_queue" {
  if (result === "pass" || result === "waived") return "completed";
  if (result === "review_queue") return "review_queue";
  return "failed";
}
