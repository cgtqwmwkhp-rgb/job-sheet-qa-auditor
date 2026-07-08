/**
 * Audit Actions Service (PR-10)
 *
 * Pure helpers + orchestration for finding-level review actions.
 * DB I/O is injected so unit tests run without a live database.
 */

import {
  ACTION_TO_STATUS,
  STATUS_TO_ACTION,
  type AuditActionResult,
  type BulkApproveResult,
  type FindingAction,
  type ResolutionStatus,
} from "./types";

export interface FindingRecord {
  id: number;
  auditResultId: number;
  resolutionStatus: ResolutionStatus;
  resolutionReason?: string | null;
  resolvedBy?: number | null;
  resolvedAt?: Date | null;
  previousResolutionStatus?: ResolutionStatus | null;
}

export interface AuditResultRecord {
  id: number;
  jobSheetId: number;
  result: "pass" | "fail" | "review_queue" | "waived";
}

export interface WaiverRecord {
  id: number;
  auditFindingId: number;
}

export interface AuditActionDeps {
  getFinding: (id: number) => Promise<FindingRecord | undefined>;
  updateFindingResolution: (
    id: number,
    data: {
      resolutionStatus: ResolutionStatus;
      resolutionReason?: string | null;
      resolvedBy?: number | null;
      resolvedAt?: Date | null;
      previousResolutionStatus?: ResolutionStatus | null;
    }
  ) => Promise<void>;
  getAuditResult: (id: number) => Promise<AuditResultRecord | undefined>;
  updateAuditResultStatus: (
    id: number,
    result: "pass" | "fail" | "review_queue" | "waived"
  ) => Promise<void>;
  updateJobSheetStatus: (id: number, status: string) => Promise<void>;
  createWaiver: (data: {
    auditFindingId: number;
    approverId: number;
    reason: string;
    auditTrail: unknown;
  }) => Promise<{ id: number }>;
  getWaiverByFindingId: (
    auditFindingId: number
  ) => Promise<WaiverRecord | undefined>;
  deleteWaiver: (id: number) => Promise<void>;
  logAction: (data: {
    userId: number;
    action: string;
    entityType: string;
    entityId: number;
    details: Record<string, unknown>;
  }) => Promise<void>;
}

export function mapActionToStatus(action: FindingAction): ResolutionStatus {
  return ACTION_TO_STATUS[action];
}

export function canUndo(status: ResolutionStatus): boolean {
  return status !== "open";
}

export function buildUndoToken(
  findingId: number,
  fromStatus: ResolutionStatus,
  toStatus: ResolutionStatus
): string {
  return `undo:${findingId}:${fromStatus}->${toStatus}`;
}

export function parseUndoToken(token: string): {
  findingId: number;
  fromStatus: ResolutionStatus;
  toStatus: ResolutionStatus;
} | null {
  const match = /^undo:(\d+):([a-z]+)->([a-z]+)$/.exec(token);
  if (!match) return null;
  return {
    findingId: Number(match[1]),
    fromStatus: match[2] as ResolutionStatus,
    toStatus: match[3] as ResolutionStatus,
  };
}

/**
 * Apply a finding-level action. Soft-undoable via previousResolutionStatus.
 */
export async function applyFindingAction(
  deps: AuditActionDeps,
  input: {
    findingId: number;
    action: FindingAction;
    reason: string;
    userId: number;
  }
): Promise<AuditActionResult> {
  const finding = await deps.getFinding(input.findingId);
  if (!finding) {
    throw new Error(`Finding ${input.findingId} not found`);
  }

  const previous = finding.resolutionStatus;
  const next = mapActionToStatus(input.action);
  const now = new Date();

  await deps.updateFindingResolution(input.findingId, {
    resolutionStatus: next,
    resolutionReason: input.reason,
    resolvedBy: input.userId,
    resolvedAt: now,
    previousResolutionStatus: previous,
  });

  let waiverId: number | undefined;
  if (input.action === "waive") {
    const existing = await deps.getWaiverByFindingId(input.findingId);
    if (!existing) {
      const created = await deps.createWaiver({
        auditFindingId: input.findingId,
        approverId: input.userId,
        reason: input.reason,
        auditTrail: [
          {
            action: "CREATED",
            userId: input.userId,
            timestamp: now.toISOString(),
            reason: input.reason,
          },
        ],
      });
      waiverId = created.id;
    } else {
      waiverId = existing.id;
    }
  }

  const sideEffects = await applySideEffects(deps, {
    finding,
    action: input.action,
    userId: input.userId,
  });

  await deps.logAction({
    userId: input.userId,
    action: `FINDING_${input.action.toUpperCase()}`,
    entityType: "audit_finding",
    entityId: input.findingId,
    details: {
      previousStatus: previous,
      newStatus: next,
      reason: input.reason,
      waiverId,
      ...sideEffects,
    },
  });

  return {
    success: true,
    action: input.action,
    findingId: input.findingId,
    resolutionStatus: next,
    previousResolutionStatus: previous,
    waiverId,
    jobSheetStatus: sideEffects.jobSheetStatus,
    auditResultStatus: sideEffects.auditResultStatus,
    undoToken: buildUndoToken(input.findingId, previous, next),
  };
}

/**
 * Soft-undo: revert finding to previousResolutionStatus (or open).
 * Deletes waiver if undoing a waive.
 */
export async function undoFindingAction(
  deps: AuditActionDeps,
  input: { findingId: number; userId: number }
): Promise<AuditActionResult> {
  const finding = await deps.getFinding(input.findingId);
  if (!finding) {
    throw new Error(`Finding ${input.findingId} not found`);
  }

  if (!canUndo(finding.resolutionStatus)) {
    throw new Error(`Finding ${input.findingId} has no action to undo`);
  }

  const current = finding.resolutionStatus;
  const restoreTo: ResolutionStatus =
    finding.previousResolutionStatus ?? "open";
  const undoneAction = STATUS_TO_ACTION[current];

  let deletedWaiverId: number | undefined;
  if (current === "waived") {
    const waiver = await deps.getWaiverByFindingId(input.findingId);
    if (waiver) {
      await deps.deleteWaiver(waiver.id);
      deletedWaiverId = waiver.id;
    }
  }

  await deps.updateFindingResolution(input.findingId, {
    resolutionStatus: restoreTo,
    resolutionReason: null,
    resolvedBy: null,
    resolvedAt: null,
    previousResolutionStatus: current,
  });

  // Soft-undo job sheet flag: if undoing flag and restoring to open, leave
  // job sheet as-is unless it was only flagged (review_queue stays — PR-13
  // workstation owns full queue lifecycle). Log the intent.
  await deps.logAction({
    userId: input.userId,
    action: "FINDING_UNDO",
    entityType: "audit_finding",
    entityId: input.findingId,
    details: {
      undoneAction,
      fromStatus: current,
      toStatus: restoreTo,
      deletedWaiverId,
    },
  });

  return {
    success: true,
    action: "undo",
    findingId: input.findingId,
    resolutionStatus: restoreTo,
    previousResolutionStatus: current,
    deletedWaiverId,
    undoToken: buildUndoToken(input.findingId, current, restoreTo),
  };
}

/**
 * Bulk-approve multiple findings (same reason). Skips already-approved.
 */
export async function bulkApproveFindings(
  deps: AuditActionDeps,
  input: {
    findingIds: number[];
    reason: string;
    userId: number;
  }
): Promise<BulkApproveResult> {
  const approvedIds: number[] = [];
  const skippedIds: number[] = [];
  const undoTokens: string[] = [];

  for (const findingId of input.findingIds) {
    const finding = await deps.getFinding(findingId);
    if (!finding) {
      skippedIds.push(findingId);
      continue;
    }
    if (finding.resolutionStatus === "approved") {
      skippedIds.push(findingId);
      continue;
    }

    const result = await applyFindingAction(deps, {
      findingId,
      action: "approve",
      reason: input.reason,
      userId: input.userId,
    });
    approvedIds.push(findingId);
    undoTokens.push(result.undoToken);
  }

  return {
    success: true,
    approvedIds,
    skippedIds,
    undoTokens,
  };
}

async function applySideEffects(
  deps: AuditActionDeps,
  input: {
    finding: FindingRecord;
    action: FindingAction;
    userId: number;
  }
): Promise<{ jobSheetStatus?: string; auditResultStatus?: string }> {
  const audit = await deps.getAuditResult(input.finding.auditResultId);
  if (!audit) return {};

  if (input.action === "flag") {
    await deps.updateJobSheetStatus(audit.jobSheetId, "review_queue");
    if (audit.result !== "review_queue" && audit.result !== "waived") {
      await deps.updateAuditResultStatus(audit.id, "review_queue");
    }
    return {
      jobSheetStatus: "review_queue",
      auditResultStatus: "review_queue",
    };
  }

  if (input.action === "waive") {
    await deps.updateAuditResultStatus(audit.id, "waived");
    return { auditResultStatus: "waived" };
  }

  if (input.action === "approve") {
    // Approving a finding does not auto-pass the whole audit — only logs.
    // Hold-queue approve (job sheet level) is separate.
    return {};
  }

  return {};
}

/**
 * Approve a job sheet out of the hold/review queue (status → completed).
 */
export async function approveJobSheet(
  deps: Pick<
    AuditActionDeps,
    "updateJobSheetStatus" | "logAction" | "getAuditResult"
  > & {
    getJobSheetStatus?: (id: number) => Promise<string | undefined>;
  },
  input: {
    jobSheetId: number;
    userId: number;
    reason?: string;
    previousStatus?: string;
  }
): Promise<{
  success: true;
  jobSheetId: number;
  previousStatus: string;
  newStatus: "completed";
  undoToken: string;
}> {
  const previous = input.previousStatus ?? "review_queue";
  await deps.updateJobSheetStatus(input.jobSheetId, "completed");
  await deps.logAction({
    userId: input.userId,
    action: "JOB_SHEET_APPROVE",
    entityType: "job_sheet",
    entityId: input.jobSheetId,
    details: {
      previousStatus: previous,
      newStatus: "completed",
      reason: input.reason ?? "Approved from hold queue",
    },
  });

  return {
    success: true,
    jobSheetId: input.jobSheetId,
    previousStatus: previous,
    newStatus: "completed",
    undoToken: `undo-js:${input.jobSheetId}:${previous}->completed`,
  };
}

/**
 * Soft-undo job sheet approve: restore previous status (typically review_queue).
 */
export async function undoJobSheetApprove(
  deps: Pick<AuditActionDeps, "updateJobSheetStatus" | "logAction">,
  input: {
    jobSheetId: number;
    userId: number;
    restoreStatus: string;
  }
): Promise<{
  success: true;
  jobSheetId: number;
  newStatus: string;
}> {
  await deps.updateJobSheetStatus(input.jobSheetId, input.restoreStatus);
  await deps.logAction({
    userId: input.userId,
    action: "JOB_SHEET_APPROVE_UNDO",
    entityType: "job_sheet",
    entityId: input.jobSheetId,
    details: {
      restoredStatus: input.restoreStatus,
    },
  });

  return {
    success: true,
    jobSheetId: input.jobSheetId,
    newStatus: input.restoreStatus,
  };
}
