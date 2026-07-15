/**
 * Sheet-level truth after human review (Wave-4 A2).
 *
 * Recalculates audit/job-sheet outcome from findings after override/waive/
 * approve so stale auto FAIL/PASS scores cannot linger.
 */

import type { ResolutionStatus } from "./types";

export type FindingSeverity = "S0" | "S1" | "S2" | "S3";

export type SheetResult = "pass" | "fail" | "review_queue" | "waived";

export interface SheetTruthFinding {
  severity: FindingSeverity;
  resolutionStatus: ResolutionStatus;
}

function isActive(status: ResolutionStatus): boolean {
  return status === "open" || status === "flagged";
}

function isCritical(severity: FindingSeverity): boolean {
  return severity === "S0" || severity === "S1";
}

/**
 * Derive sheet/audit result from current finding resolutions.
 *
 * - Any open/flagged S0/S1 → fail
 * - Else any open/flagged S2/S3 → review_queue
 * - Else all waived → waived
 * - Else all resolved (override/approve/waive mix) → pass
 */
export function deriveSheetResultFromFindings(
  findings: readonly SheetTruthFinding[]
): SheetResult {
  if (findings.length === 0) return "pass";

  const active = findings.filter(f => isActive(f.resolutionStatus));

  if (active.length === 0) {
    const allWaived = findings.every(f => f.resolutionStatus === "waived");
    return allWaived ? "waived" : "pass";
  }

  if (active.some(f => isCritical(f.severity))) {
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
