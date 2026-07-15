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
import {
  buildTrainingSignal,
  withTrainingSignalDetails,
} from "../trainingSignals";

export type AuditActionErrorCode = "NOT_FOUND" | "CONFLICT";

/**
 * Expected domain failures from audit actions.
 * Routers translate these into the matching stable tRPC error code.
 */
export class AuditActionError extends Error {
  constructor(
    public readonly code: AuditActionErrorCode,
    message: string
  ) {
    super(message);
    this.name = "AuditActionError";
  }
}

export interface FindingRecord {
  id: number;
  auditResultId: number;
  resolutionStatus: ResolutionStatus;
  resolutionReason?: string | null;
  resolvedBy?: number | null;
  resolvedAt?: Date | null;
  previousResolutionStatus?: ResolutionStatus | null;
  /** Optional — used by captureFieldCorrection (PR-13) */
  fieldName?: string | null;
  rawSnippet?: string | null;
  normalisedSnippet?: string | null;
  ruleId?: string | null;
  reasonCode?: string | null;
}

export interface AuditResultRecord {
  id: number;
  jobSheetId: number;
  result: "pass" | "fail" | "review_queue" | "waived";
}

export interface WaiverRecord {
  id: number;
  auditFindingId: number;
  auditTrail?: unknown;
  revokedAt?: Date | null;
  revokedBy?: number | null;
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
    expiresAt?: Date;
    auditTrail: unknown;
  }) => Promise<{ id: number }>;
  getWaiverByFindingId: (
    auditFindingId: number
  ) => Promise<WaiverRecord | undefined>;
  revokeWaiver: (id: number, revokedBy: number) => Promise<void>;
  logAction: (data: {
    userId: number;
    action: string;
    entityType: string;
    entityId: number;
    details: Record<string, unknown>;
  }) => Promise<void>;
  /** PR-13: update normalisedSnippet for field corrections */
  updateFindingSnippet?: (
    id: number,
    data: { normalisedSnippet: string }
  ) => Promise<void>;
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
    expiresAt?: Date;
    /** TrainLoop taxonomy when overturning (override action only). */
    trainingReasonCode?: string | null;
  }
): Promise<AuditActionResult> {
  const finding = await deps.getFinding(input.findingId);
  if (!finding) {
    throw new AuditActionError(
      "NOT_FOUND",
      `Finding ${input.findingId} not found`
    );
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
        expiresAt: input.expiresAt,
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

  const audit = await deps.getAuditResult(finding.auditResultId);
  const logDetails: Record<string, unknown> = {
    previousStatus: previous,
    newStatus: next,
    reason: input.reason,
    waiverId,
    ...sideEffects,
  };

  if (input.action === "override") {
    logDetails.trainingSignal = buildTrainingSignal({
      signalType: "override",
      findingId: input.findingId,
      trainingReasonCode: input.trainingReasonCode,
      auditResultId: finding.auditResultId,
      jobSheetId: audit?.jobSheetId,
      ruleId: finding.ruleId,
      findingReasonCode: finding.reasonCode ?? undefined,
      fieldName: finding.fieldName ?? undefined,
      originalValue:
        finding.normalisedSnippet ?? finding.rawSnippet ?? undefined,
      reviewerReason: input.reason,
    });
  }

  await deps.logAction({
    userId: input.userId,
    action: `FINDING_${input.action.toUpperCase()}`,
    entityType: "audit_finding",
    entityId: input.findingId,
    details: logDetails,
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
 * Revokes the active waiver if undoing a waive, retaining its audit evidence.
 */
export async function undoFindingAction(
  deps: AuditActionDeps,
  input: { findingId: number; userId: number }
): Promise<AuditActionResult> {
  const finding = await deps.getFinding(input.findingId);
  if (!finding) {
    throw new AuditActionError(
      "NOT_FOUND",
      `Finding ${input.findingId} not found`
    );
  }

  if (!canUndo(finding.resolutionStatus)) {
    throw new AuditActionError(
      "CONFLICT",
      `Finding ${input.findingId} has no action to undo`
    );
  }

  const current = finding.resolutionStatus;
  const restoreTo: ResolutionStatus =
    finding.previousResolutionStatus ?? "open";
  const undoneAction = STATUS_TO_ACTION[current];

  let revokedWaiverId: number | undefined;
  if (current === "waived") {
    const waiver = await deps.getWaiverByFindingId(input.findingId);
    if (waiver) {
      await deps.revokeWaiver(waiver.id, input.userId);
      revokedWaiverId = waiver.id;
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
      revokedWaiverId,
    },
  });

  return {
    success: true,
    action: "undo",
    findingId: input.findingId,
    resolutionStatus: restoreTo,
    previousResolutionStatus: current,
    revokedWaiverId,
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

export interface FieldCorrectionResult {
  success: true;
  findingId: number;
  fieldName: string;
  previousSnippet: string | null;
  correctedValue: string;
  undoToken: string;
}

/**
 * Capture a reviewer field correction (PR-13).
 * Persists corrected value to normalisedSnippet + system_audit_log.
 * No new migration / table — overnight-scoped ground truth.
 */
export async function captureFieldCorrection(
  deps: AuditActionDeps,
  input: {
    findingId: number;
    fieldName?: string;
    originalValue?: string;
    correctedValue: string;
    userId: number;
    /** TrainLoop taxonomy — OCR/ROI/rule/template vs true defect. */
    trainingReasonCode?: string | null;
  }
): Promise<FieldCorrectionResult> {
  const finding = await deps.getFinding(input.findingId);
  if (!finding) {
    throw new AuditActionError(
      "NOT_FOUND",
      `Finding ${input.findingId} not found`
    );
  }
  if (!deps.updateFindingSnippet) {
    throw new Error("updateFindingSnippet is not configured");
  }

  const corrected = input.correctedValue.trim();
  if (!corrected) {
    throw new Error("Corrected value is required");
  }

  const previousSnippet = finding.normalisedSnippet ?? null;
  const fieldName =
    input.fieldName?.trim() || finding.fieldName || "Unknown Field";
  const originalValue =
    input.originalValue ?? finding.rawSnippet ?? previousSnippet ?? "";

  await deps.updateFindingSnippet(input.findingId, {
    normalisedSnippet: corrected,
  });

  const audit = await deps.getAuditResult(finding.auditResultId);
  const trainingSignal = buildTrainingSignal({
    signalType: "field_correction",
    findingId: input.findingId,
    trainingReasonCode: input.trainingReasonCode,
    auditResultId: finding.auditResultId,
    jobSheetId: audit?.jobSheetId,
    ruleId: finding.ruleId,
    findingReasonCode: finding.reasonCode ?? undefined,
    fieldName,
    originalValue,
    correctedValue: corrected,
  });

  await deps.logAction({
    userId: input.userId,
    action: "FIELD_CORRECTION",
    entityType: "audit_finding",
    entityId: input.findingId,
    details: withTrainingSignalDetails(
      {
        fieldName,
        originalValue,
        correctedValue: corrected,
        previousSnippet,
      },
      trainingSignal
    ),
  });

  return {
    success: true,
    findingId: input.findingId,
    fieldName,
    previousSnippet,
    correctedValue: corrected,
    undoToken: `undo-fc:${input.findingId}:${encodeURIComponent(previousSnippet ?? "")}`,
  };
}

/**
 * Soft-undo a field correction by restoring previous normalisedSnippet.
 */
export async function undoFieldCorrection(
  deps: AuditActionDeps,
  input: {
    findingId: number;
    previousSnippet: string | null;
    userId: number;
  }
): Promise<FieldCorrectionResult> {
  const finding = await deps.getFinding(input.findingId);
  if (!finding) {
    throw new AuditActionError(
      "NOT_FOUND",
      `Finding ${input.findingId} not found`
    );
  }
  if (!deps.updateFindingSnippet) {
    throw new Error("updateFindingSnippet is not configured");
  }

  const current = finding.normalisedSnippet ?? null;
  await deps.updateFindingSnippet(input.findingId, {
    normalisedSnippet: input.previousSnippet ?? "",
  });

  await deps.logAction({
    userId: input.userId,
    action: "FIELD_CORRECTION_UNDO",
    entityType: "audit_finding",
    entityId: input.findingId,
    details: {
      restoredSnippet: input.previousSnippet,
      undoneSnippet: current,
    },
  });

  return {
    success: true,
    findingId: input.findingId,
    fieldName: finding.fieldName || "Unknown Field",
    previousSnippet: current,
    correctedValue: input.previousSnippet ?? "",
    undoToken: `undo-fc:${input.findingId}:${encodeURIComponent(input.previousSnippet ?? "")}`,
  };
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
