/**
 * PX-061 / PX-062: Shared audit outcome mapping for badges & list chips.
 *
 * Prefer canonical audit_results.result / job_sheets.status over
 * local finding heuristics so review_queue never paints as Pass.
 */

export type AuditUiStatus =
  | "passed"
  | "failed"
  | "needs_review"
  | "waived"
  | "pending";

export type OutcomeBadge = {
  label: "Pass" | "Needs review" | "Fail" | "Waived" | "Pending";
  variant: "default" | "secondary" | "destructive" | "outline";
  status: AuditUiStatus;
};

export function mapAuditResultToUiStatus(input: {
  auditResult?: string | null;
  jobSheetStatus?: string | null;
}): AuditUiStatus {
  const result = (input.auditResult ?? "").toLowerCase();
  const sheet = (input.jobSheetStatus ?? "").toLowerCase();

  if (result === "pass") return "passed";
  if (result === "fail") return "failed";
  if (result === "review_queue") return "needs_review";
  if (result === "waived") return "waived";

  // Job-sheet approve marks completed without implying a clean AI pass.
  if (sheet === "review_queue") return "needs_review";
  if (sheet === "failed") return "failed";
  if (sheet === "completed" && !result) return "passed";
  if (sheet === "completed" && result && result !== "pass") {
    // Prefer audit truth when present (e.g. completed + review_queue leftover).
    if (result === "fail") return "failed";
    if (result === "review_queue") return "needs_review";
    if (result === "waived") return "waived";
  }
  if (sheet === "pending" || sheet === "processing") return "pending";

  return "pending";
}

export function outcomeBadgeFromStatus(status: AuditUiStatus): OutcomeBadge {
  switch (status) {
    case "passed":
      return { label: "Pass", variant: "default", status };
    case "failed":
      return { label: "Fail", variant: "destructive", status };
    case "needs_review":
      return { label: "Needs review", variant: "secondary", status };
    case "waived":
      return { label: "Waived", variant: "outline", status };
    default:
      return { label: "Pending", variant: "outline", status: "pending" };
  }
}

/**
 * Derive workstation outcome badge.
 * Sheet/audit status is SSOT; open major findings can only demote further.
 */
export function deriveWorkstationOutcome(input: {
  auditResult?: string | null;
  jobSheetStatus?: string | null;
  hasOpenMajorFindings: boolean;
  hasOpenNonMajorFindings: boolean;
}): OutcomeBadge {
  const base = outcomeBadgeFromStatus(
    mapAuditResultToUiStatus({
      auditResult: input.auditResult,
      jobSheetStatus: input.jobSheetStatus,
    })
  );

  if (input.hasOpenMajorFindings) {
    return { label: "Fail", variant: "destructive", status: "failed" };
  }

  // Never promote review_queue / fail / pending up to Pass via empty findings.
  if (base.status === "needs_review" || base.status === "failed") {
    return base;
  }

  if (input.hasOpenNonMajorFindings && base.status === "passed") {
    return {
      label: "Needs review",
      variant: "secondary",
      status: "needs_review",
    };
  }

  if (base.status === "pending" && input.hasOpenNonMajorFindings) {
    return {
      label: "Needs review",
      variant: "secondary",
      status: "needs_review",
    };
  }

  return base;
}

/** Finding is still an open issue for UI issue counts / approve-open. */
export function isFindingOpenForUi(
  resolutionStatus: string | null | undefined
): boolean {
  const s = (resolutionStatus ?? "open").toLowerCase();
  return s === "open" || s === "flagged";
}
