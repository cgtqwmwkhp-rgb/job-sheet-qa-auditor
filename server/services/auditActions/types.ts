/**
 * Audit Actions (PR-10) — types for waive / override / flag / approve / undo.
 */

export const FINDING_ACTIONS = [
  "waive",
  "override",
  "flag",
  "approve",
] as const;

export type FindingAction = (typeof FINDING_ACTIONS)[number];

export const RESOLUTION_STATUSES = [
  "open",
  "waived",
  "overridden",
  "flagged",
  "approved",
] as const;

export type ResolutionStatus = (typeof RESOLUTION_STATUSES)[number];

export const ACTION_TO_STATUS: Record<FindingAction, ResolutionStatus> = {
  waive: "waived",
  override: "overridden",
  flag: "flagged",
  approve: "approved",
};

export const STATUS_TO_ACTION: Partial<
  Record<ResolutionStatus, FindingAction>
> = {
  waived: "waive",
  overridden: "override",
  flagged: "flag",
  approved: "approve",
};

export interface AuditActionResult {
  success: true;
  action: FindingAction | "undo";
  findingId: number;
  resolutionStatus: ResolutionStatus;
  previousResolutionStatus: ResolutionStatus;
  /** Present when waive created a waiver row */
  waiverId?: number;
  /** Present when undo revoked a waiver without deleting its evidence */
  revokedWaiverId?: number;
  /** Job sheet status after the action (if changed) */
  jobSheetStatus?: string;
  /** Audit result status after the action (if changed) */
  auditResultStatus?: string;
  undoToken: string;
}

export interface BulkApproveResult {
  success: true;
  approvedIds: number[];
  skippedIds: number[];
  undoTokens: string[];
  /** Sheet truth after one atomic recalc (Wave-4 D1). */
  auditResultStatus?: string;
  jobSheetStatus?: string;
  auditResultId?: number;
}

export interface BulkResolveResult {
  success: true;
  resolvedIds: number[];
  skippedIds: number[];
  auditResultId?: number;
  auditResultStatus?: string;
  jobSheetStatus?: string;
  undoTokens: string[];
}
