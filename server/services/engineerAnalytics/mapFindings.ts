/**
 * Map DB audit findings onto engineer-analytics IssueOccurrence shapes.
 * Pure / deterministic — safe for contract tests with fixtures.
 */

import type { IssueOccurrence, IssueType } from "./types";

/** DB reason codes from drizzle/schema auditFindings.reasonCode */
export type DbReasonCode =
  | "MISSING_FIELD"
  | "UNREADABLE_FIELD"
  | "LOW_CONFIDENCE"
  | "INVALID_FORMAT"
  | "CONFLICT"
  | "OUT_OF_POLICY"
  | "INCOMPLETE_EVIDENCE"
  | "OCR_FAILURE"
  | "PIPELINE_ERROR"
  | "SPEC_GAP"
  | "SECURITY_RISK";

export type DbSeverity = "S0" | "S1" | "S2" | "S3";

export type DbResolutionStatus =
  | "open"
  | "waived"
  | "overridden"
  | "flagged"
  | "approved";

export interface RawFindingRow {
  findingId: number;
  technicianId: number;
  jobSheetId: number;
  severity: DbSeverity;
  reasonCode: DbReasonCode;
  fieldName: string;
  resolutionStatus: DbResolutionStatus;
  occurredAt: Date | string;
}

/**
 * Map a DB reason code (+ optional field name) to analytics IssueType.
 */
export function mapReasonCodeToIssueType(
  reasonCode: string,
  fieldName?: string
): IssueType {
  const field = (fieldName ?? "").toLowerCase();
  if (
    field.includes("signature") &&
    (reasonCode === "MISSING_FIELD" || reasonCode === "INCOMPLETE_EVIDENCE")
  ) {
    return "SIGNATURE_MISSING";
  }

  switch (reasonCode) {
    case "MISSING_FIELD":
      return "MISSING_FIELD";
    case "INVALID_FORMAT":
      return "INVALID_FORMAT";
    case "OUT_OF_POLICY":
    case "SECURITY_RISK":
      return "OUT_OF_POLICY";
    case "INCOMPLETE_EVIDENCE":
      return "INCOMPLETE_CHECKLIST";
    case "UNREADABLE_FIELD":
    case "LOW_CONFIDENCE":
    case "CONFLICT":
    case "OCR_FAILURE":
    case "PIPELINE_ERROR":
    case "SPEC_GAP":
    default:
      return "OTHER";
  }
}

/**
 * Map DB resolution status onto analytics resolutionStatus.
 */
export function mapResolutionStatus(
  status: DbResolutionStatus
): IssueOccurrence["resolutionStatus"] {
  switch (status) {
    case "waived":
      return "waived";
    case "overridden":
    case "approved":
      return "resolved";
    case "flagged":
    case "open":
    default:
      return "open";
  }
}

function toIso(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toISOString();
}

/**
 * Convert a raw DB finding row into an IssueOccurrence.
 */
export function toIssueOccurrence(row: RawFindingRow): IssueOccurrence {
  const resolutionStatus = mapResolutionStatus(row.resolutionStatus);
  return {
    id: `finding-${row.findingId}`,
    engineerId: String(row.technicianId),
    documentId: String(row.jobSheetId),
    issueType: mapReasonCodeToIssueType(row.reasonCode, row.fieldName),
    severity: row.severity,
    fieldName: row.fieldName,
    reasonCode: row.reasonCode,
    occurredAt: toIso(row.occurredAt),
    wasDisputed: false,
    wasWaived: resolutionStatus === "waived",
    resolutionStatus,
  };
}
