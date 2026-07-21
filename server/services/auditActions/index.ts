/**
 * Audit Actions Service (PR-10)
 *
 * Pure helpers + orchestration for finding-level review actions.
 * DB I/O is injected so unit tests run without a live database.
 */

import { createHash } from "crypto";
import {
  ACTION_TO_STATUS,
  STATUS_TO_ACTION,
  FORCE_PASS_MIN_REASON_LENGTH,
  type AuditActionResult,
  type BulkApproveResult,
  type BulkResolveResult,
  type FindingAction,
  type ResolutionStatus,
} from "./types";
import {
  deriveSheetResultFromFindings,
  sheetResultToJobSheetStatus,
  type FindingSeverity,
  type SheetResult,
} from "./sheetTruth";
import {
  buildTrainingSignal,
  normalizeTrainingReasonCode,
  withTrainingSignalDetails,
} from "../trainingSignals";
import { recordCorrectionEvent, softUndoCorrection } from "../templateMemory";

export {
  deriveSheetResultFromFindings,
  sheetResultToJobSheetStatus,
  type FindingSeverity,
  type SheetResult,
  type SheetTruthFinding,
} from "./sheetTruth";

export { FORCE_PASS_MIN_REASON_LENGTH } from "./types";

export type AuditActionErrorCode =
  | "NOT_FOUND"
  | "CONFLICT"
  | "PRECONDITION_FAILED";

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
  /** Required for post-override sheet truth recalculation. */
  severity?: FindingSeverity | null;
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
  /** Wave-7 lineage — optional on legacy rows */
  templateId?: number | null;
  templateVersionId?: number | null;
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
  getAuditResultByJobSheetId?: (
    jobSheetId: number
  ) => Promise<AuditResultRecord | undefined>;
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
  /**
   * List all findings for an audit so sheet truth can be recalculated
   * after override/waive/approve (Wave-4 A2).
   */
  listFindingsByAuditResultId?: (
    auditResultId: number
  ) => Promise<FindingRecord[]>;
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
 *
 * Wave-4 D1: optional `expectedStatus` provides optimistic concurrency —
 * reject when another reviewer already changed the finding.
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
    /**
     * Optimistic concurrency: must match current resolutionStatus.
     * Mirrors audit-policy version checks.
     */
    expectedStatus?: ResolutionStatus;
    /** Skip per-finding sheet recalc (bulk resolve recalculates once). */
    skipSheetRecalc?: boolean;
  }
): Promise<AuditActionResult> {
  const finding = await deps.getFinding(input.findingId);
  if (!finding) {
    throw new AuditActionError(
      "NOT_FOUND",
      `Finding ${input.findingId} not found`
    );
  }

  if (
    input.expectedStatus != null &&
    finding.resolutionStatus !== input.expectedStatus
  ) {
    throw new AuditActionError(
      "CONFLICT",
      `Finding ${input.findingId} was modified by another reviewer. Please refresh and retry.`
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

  const sideEffects = input.skipSheetRecalc
    ? {}
    : await applySideEffects(deps, {
        finding,
        action: input.action,
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

  let memory: Awaited<ReturnType<typeof recordCorrectionEvent>> | undefined;
  if (
    audit?.jobSheetId != null &&
    (input.action === "override" ||
      input.action === "waive" ||
      input.action === "approve" ||
      input.action === "flag")
  ) {
    memory = await recordCorrectionEvent({
      correctionType: input.action,
      trainingReasonCode: normalizeTrainingReasonCode(input.trainingReasonCode),
      findingId: input.findingId,
      auditResultId: finding.auditResultId,
      jobSheetId: audit.jobSheetId,
      templateId: audit.templateId ?? null,
      templateVersionId: audit.templateVersionId ?? null,
      fieldKey: finding.fieldName || "unknown",
      ruleId: finding.ruleId,
      originalValue: finding.normalisedSnippet ?? finding.rawSnippet ?? null,
      correctedValue: null,
      reviewerId: input.userId,
      reviewerReason: input.reason,
      idempotencyKey: `finding:${input.action}:${input.findingId}:${previous}->${next}`,
    });
  }

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
    memoryCandidateId: memory?.candidateId ?? undefined,
    memoryPromotionStatus: memory?.promotionStatus ?? undefined,
    memoryAgreeCount: memory?.agreeCount ?? undefined,
    studioConfirmRequired: memory?.studioConfirmRequired ?? undefined,
    correctionId: memory?.correctionId ?? undefined,
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

  // PX-092 — soft-undo training samples written for the action being reversed
  if (undoneAction) {
    const memoryKey = `finding:${undoneAction}:${input.findingId}:${restoreTo}->${current}`;
    try {
      await softUndoCorrection(memoryKey, input.userId);
    } catch (err) {
      console.warn(
        "[auditActions] softUndoCorrection failed (non-fatal):",
        err instanceof Error ? err.message : err
      );
    }
  }

  const sideEffects = await recalculateSheetTruth(deps, finding.auditResultId);

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
      ...sideEffects,
    },
  });

  return {
    success: true,
    action: "undo",
    findingId: input.findingId,
    resolutionStatus: restoreTo,
    previousResolutionStatus: current,
    revokedWaiverId,
    jobSheetStatus: sideEffects.jobSheetStatus,
    auditResultStatus: sideEffects.auditResultStatus,
    undoToken: buildUndoToken(input.findingId, current, restoreTo),
  };
}

/**
 * Bulk-approve multiple findings (same reason). Skips already-approved.
 * Wave-4 D1: single sheet-truth recalc after all mutations.
 */
export async function bulkApproveFindings(
  deps: AuditActionDeps,
  input: {
    findingIds: number[];
    reason: string;
    userId: number;
    expectedStatus?: ResolutionStatus;
  }
): Promise<BulkApproveResult> {
  const result = await bulkResolveFindings(deps, {
    findingIds: input.findingIds,
    action: "approve",
    reason: input.reason,
    userId: input.userId,
    expectedStatus: input.expectedStatus,
  });

  return {
    success: true,
    approvedIds: result.resolvedIds,
    skippedIds: result.skippedIds,
    undoTokens: result.undoTokens,
    auditResultId: result.auditResultId,
    auditResultStatus: result.auditResultStatus,
    jobSheetStatus: result.jobSheetStatus,
  };
}

/**
 * Atomic bulk resolve — apply the same action to many findings, then
 * recalculate sheet truth once (Wave-4 D1 challenge bar).
 *
 * Pre-validates expectedStatus / same-audit constraints before any write
 * so conflicts are all-or-nothing even outside a DB transaction.
 */
export async function bulkResolveFindings(
  deps: AuditActionDeps,
  input: {
    findingIds: number[];
    action: FindingAction;
    reason: string;
    userId: number;
    expiresAt?: Date;
    /**
     * When set, every finding must currently match this status
     * (all-or-nothing optimistic concurrency).
     */
    expectedStatus?: ResolutionStatus;
  }
): Promise<BulkResolveResult> {
  const resolvedIds: number[] = [];
  const skippedIds: number[] = [];
  const undoTokens: string[] = [];
  let auditResultId: number | undefined;
  const targetStatus = mapActionToStatus(input.action);

  const loaded: Array<{ id: number; finding: FindingRecord }> = [];

  for (const findingId of input.findingIds) {
    const finding = await deps.getFinding(findingId);
    if (!finding) {
      skippedIds.push(findingId);
      continue;
    }

    if (auditResultId == null) {
      auditResultId = finding.auditResultId;
    } else if (finding.auditResultId !== auditResultId) {
      throw new AuditActionError(
        "CONFLICT",
        "Bulk resolve requires all findings to belong to the same audit result"
      );
    }

    if (finding.resolutionStatus === targetStatus) {
      skippedIds.push(findingId);
      continue;
    }

    if (
      input.expectedStatus != null &&
      finding.resolutionStatus !== input.expectedStatus
    ) {
      throw new AuditActionError(
        "CONFLICT",
        `Finding ${findingId} was modified by another reviewer. Please refresh and retry.`
      );
    }

    loaded.push({ id: findingId, finding });
  }

  for (const { id: findingId } of loaded) {
    const result = await applyFindingAction(deps, {
      findingId,
      action: input.action,
      reason: input.reason,
      userId: input.userId,
      expiresAt: input.expiresAt,
      expectedStatus: input.expectedStatus,
      skipSheetRecalc: true,
    });
    resolvedIds.push(findingId);
    undoTokens.push(result.undoToken);
  }

  let sideEffects: { jobSheetStatus?: string; auditResultStatus?: string } = {};
  if (auditResultId != null && resolvedIds.length > 0) {
    if (input.action === "flag") {
      const audit = await deps.getAuditResult(auditResultId);
      if (audit) {
        await deps.updateJobSheetStatus(audit.jobSheetId, "review_queue");
        if (audit.result !== "review_queue" && audit.result !== "waived") {
          await deps.updateAuditResultStatus(audit.id, "review_queue");
        }
        sideEffects = {
          jobSheetStatus: "review_queue",
          auditResultStatus: "review_queue",
        };
      }
    } else {
      sideEffects = await recalculateSheetTruth(deps, auditResultId);
    }

    await deps.logAction({
      userId: input.userId,
      action: `FINDING_BULK_${input.action.toUpperCase()}`,
      entityType: "audit_result",
      entityId: auditResultId,
      details: {
        action: input.action,
        resolvedIds,
        skippedIds,
        reason: input.reason,
        ...sideEffects,
      },
    });
  }

  return {
    success: true,
    resolvedIds,
    skippedIds,
    undoTokens,
    auditResultId,
    auditResultStatus: sideEffects.auditResultStatus,
    jobSheetStatus: sideEffects.jobSheetStatus,
  };
}

async function applySideEffects(
  deps: AuditActionDeps,
  input: {
    finding: FindingRecord;
    action: FindingAction;
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

  // override / waive / approve → recalculate sheet truth from all findings
  return recalculateSheetTruth(deps, input.finding.auditResultId);
}

/**
 * Recalculate audit + job-sheet status from current finding resolutions.
 * Prevents stale auto FAIL after the last critical finding is overridden.
 */
export async function recalculateSheetTruth(
  deps: Pick<
    AuditActionDeps,
    | "getAuditResult"
    | "updateAuditResultStatus"
    | "updateJobSheetStatus"
    | "listFindingsByAuditResultId"
    | "getFinding"
  >,
  auditResultId: number
): Promise<{ jobSheetStatus?: string; auditResultStatus?: string }> {
  const audit = await deps.getAuditResult(auditResultId);
  if (!audit) return {};

  let findings: FindingRecord[] = [];
  if (deps.listFindingsByAuditResultId) {
    findings = await deps.listFindingsByAuditResultId(auditResultId);
  }

  // Fallback: if listing is unavailable, keep prior result (no silent pass).
  if (findings.length === 0) {
    return {};
  }

  const nextResult: SheetResult = deriveSheetResultFromFindings(
    findings.map(f => ({
      severity: (f.severity ?? "S2") as FindingSeverity,
      resolutionStatus: f.resolutionStatus,
    }))
  );

  if (audit.result !== nextResult) {
    await deps.updateAuditResultStatus(audit.id, nextResult);
  }

  const jobSheetStatus = sheetResultToJobSheetStatus(nextResult);
  await deps.updateJobSheetStatus(audit.jobSheetId, jobSheetStatus);

  return {
    auditResultStatus: nextResult,
    jobSheetStatus,
  };
}

export interface FieldCorrectionResult {
  success: true;
  findingId: number;
  fieldName: string;
  previousSnippet: string | null;
  correctedValue: string;
  undoToken: string;
  /** Wave-7 — present when dual-write / capture succeeds */
  memoryCandidateId?: number;
  memoryPromotionStatus?: string;
  memoryAgreeCount?: number;
  studioConfirmRequired?: boolean;
  correctionId?: number;
}

/**
 * Capture a reviewer field correction (PR-13 + Wave-7).
 * Persists corrected value to normalisedSnippet + system_audit_log,
 * and dual-writes review_corrections / template memory when capture flag is on.
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

  let memory: Awaited<ReturnType<typeof recordCorrectionEvent>> | undefined;
  if (audit?.jobSheetId != null) {
    memory = await recordCorrectionEvent({
      correctionType: "field_correction",
      trainingReasonCode: normalizeTrainingReasonCode(input.trainingReasonCode),
      findingId: input.findingId,
      auditResultId: finding.auditResultId,
      jobSheetId: audit.jobSheetId,
      templateId: audit.templateId ?? null,
      templateVersionId: audit.templateVersionId ?? null,
      fieldKey: fieldName,
      ruleId: finding.ruleId,
      originalValue,
      correctedValue: corrected,
      reviewerId: input.userId,
      reviewerReason: null,
      idempotencyKey: `fc:${input.findingId}:${createHash("sha256")
        .update(`${fieldName}\0${corrected}`)
        .digest("hex")
        .slice(0, 32)}`,
    });
  }

  return {
    success: true,
    findingId: input.findingId,
    fieldName,
    previousSnippet,
    correctedValue: corrected,
    undoToken: `undo-fc:${input.findingId}:${encodeURIComponent(previousSnippet ?? "")}`,
    memoryCandidateId: memory?.candidateId ?? undefined,
    memoryPromotionStatus: memory?.promotionStatus ?? undefined,
    memoryAgreeCount: memory?.agreeCount ?? undefined,
    studioConfirmRequired: memory?.studioConfirmRequired ?? undefined,
    correctionId: memory?.correctionId ?? undefined,
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
function isFindingDisposed(finding: FindingRecord): boolean {
  if (
    finding.resolutionStatus !== "open" &&
    finding.resolutionStatus !== "flagged"
  ) {
    return true;
  }

  const raw = finding.rawSnippet?.trim();
  const normalised = finding.normalisedSnippet?.trim();
  return Boolean(raw && normalised && raw !== normalised);
}

function isMajorFinding(finding: FindingRecord): boolean {
  return finding.severity === "S0" || finding.severity === "S1";
}

function isPhotoCostRiskFinding(finding: FindingRecord): boolean {
  const ruleId = finding.ruleId?.trim().toUpperCase() ?? "";
  return ruleId === "PHOTO-C012" || ruleId === "PHOTO-C013";
}

export function getApprovalBlockers(
  findings: readonly FindingRecord[]
): FindingRecord[] {
  return findings.filter(
    finding =>
      !isFindingDisposed(finding) &&
      (isMajorFinding(finding) || isPhotoCostRiskFinding(finding))
  );
}

export interface ForcePassOverriddenFinding {
  id: number;
  previousStatus: ResolutionStatus;
}

export async function approveJobSheet(
  deps: Pick<
    AuditActionDeps,
    | "updateJobSheetStatus"
    | "updateAuditResultStatus"
    | "logAction"
    | "getAuditResult"
    | "getAuditResultByJobSheetId"
    | "listFindingsByAuditResultId"
    | "updateFindingResolution"
  > & {
    getJobSheetStatus?: (id: number) => Promise<string | undefined>;
  },
  input: {
    jobSheetId: number;
    userId: number;
    reason?: string;
    previousStatus?: string;
    /**
     * PR-A (PX-109): bypass open Major / photo-cost-risk approval blockers
     * and force the sheet to pass. Never silent — requires a reason of at
     * least FORCE_PASS_MIN_REASON_LENGTH chars, and every disposed finding
     * plus the reason/who/when is stamped on the JOB_SHEET_FORCE_PASS log
     * entry so the override is fully auditable and undoable.
     */
    forcePass?: boolean;
  }
): Promise<{
  success: true;
  jobSheetId: number;
  previousStatus: string;
  newStatus: "completed";
  auditResultId: number;
  previousAuditResult: AuditResultRecord["result"];
  undoToken: string;
  forcePass: boolean;
  /** Findings auto-overridden to clear the way for forcePass (empty otherwise). */
  overriddenFindings: ForcePassOverriddenFinding[];
}> {
  const audit = await deps.getAuditResultByJobSheetId?.(input.jobSheetId);
  if (!audit) {
    throw new AuditActionError(
      "PRECONDITION_FAILED",
      "Job sheet cannot be approved until audit findings are available"
    );
  }
  const findings = await deps.listFindingsByAuditResultId?.(audit.id);
  if (!findings) {
    throw new AuditActionError(
      "PRECONDITION_FAILED",
      "Job sheet cannot be approved until audit findings can be verified"
    );
  }
  const blockers = getApprovalBlockers(findings);
  const forcePass = input.forcePass === true;

  if (blockers.length > 0 && !forcePass) {
    const majorCount = blockers.filter(isMajorFinding).length;
    const photoCount = blockers.filter(isPhotoCostRiskFinding).length;
    const reasons = [
      majorCount > 0
        ? `${majorCount} open Major finding${majorCount === 1 ? "" : "s"}`
        : null,
      photoCount > 0
        ? `${photoCount} actionable photo cost-risk finding${photoCount === 1 ? "" : "s"}`
        : null,
    ].filter(Boolean);
    throw new AuditActionError(
      "PRECONDITION_FAILED",
      `Dispose ${reasons.join(" and ")} before approving this job sheet`
    );
  }

  const trimmedReason = input.reason?.trim() ?? "";
  if (forcePass && trimmedReason.length < FORCE_PASS_MIN_REASON_LENGTH) {
    throw new AuditActionError(
      "PRECONDITION_FAILED",
      `forcePass requires a reason of at least ${FORCE_PASS_MIN_REASON_LENGTH} characters explaining the override`
    );
  }

  const now = new Date();
  const overriddenFindings: ForcePassOverriddenFinding[] = [];
  if (forcePass && blockers.length > 0) {
    for (const finding of blockers) {
      overriddenFindings.push({
        id: finding.id,
        previousStatus: finding.resolutionStatus,
      });
      await deps.updateFindingResolution(finding.id, {
        resolutionStatus: "overridden",
        resolutionReason: trimmedReason,
        resolvedBy: input.userId,
        resolvedAt: now,
        previousResolutionStatus: finding.resolutionStatus,
      });
    }
  }

  const previous = input.previousStatus ?? "review_queue";
  const previousAuditResult = audit.result;

  // PX-062: sheet approve must land on the terminal countable "pass" result
  // (getDashboardStats only counts result='pass'). Set it directly here —
  // do NOT route through recalculateSheetTruth, since standing `approved`
  // findings are treated as unresolved defects there and would immediately
  // force the sheet back into review_queue.
  await deps.updateAuditResultStatus(audit.id, "pass");
  await deps.updateJobSheetStatus(input.jobSheetId, "completed");
  await deps.logAction({
    userId: input.userId,
    action: forcePass ? "JOB_SHEET_FORCE_PASS" : "JOB_SHEET_APPROVE",
    entityType: "job_sheet",
    entityId: input.jobSheetId,
    details: {
      previousStatus: previous,
      newStatus: "completed",
      previousAuditResult,
      newAuditResult: "pass",
      reason: input.reason ?? "Approved from hold queue",
      forcePass,
      overriddenFindingIds: overriddenFindings.map(f => f.id),
    },
  });

  return {
    success: true,
    jobSheetId: input.jobSheetId,
    previousStatus: previous,
    newStatus: "completed",
    auditResultId: audit.id,
    previousAuditResult,
    undoToken: `undo-js:${input.jobSheetId}:${previous}->completed`,
    forcePass,
    overriddenFindings,
  };
}

/**
 * Soft-undo job sheet approve: restore previous status (typically review_queue).
 */
export async function undoJobSheetApprove(
  deps: Pick<
    AuditActionDeps,
    | "updateJobSheetStatus"
    | "updateAuditResultStatus"
    | "logAction"
    | "updateFindingResolution"
  >,
  input: {
    jobSheetId: number;
    userId: number;
    restoreStatus: string;
    /** PX-062: restore the audit result that approve overwrote to "pass". */
    auditResultId?: number;
    restoreAuditResult?: AuditResultRecord["result"];
    /**
     * PR-A (PX-109): findings that forcePass auto-overrode — restored to
     * their prior resolutionStatus so undo fully reverses the override.
     */
    restoreFindings?: ForcePassOverriddenFinding[];
  }
): Promise<{
  success: true;
  jobSheetId: number;
  newStatus: string;
  restoredFindingIds: number[];
}> {
  await deps.updateJobSheetStatus(input.jobSheetId, input.restoreStatus);
  if (input.auditResultId != null && input.restoreAuditResult != null) {
    await deps.updateAuditResultStatus(
      input.auditResultId,
      input.restoreAuditResult
    );
  }

  const restoreFindings = input.restoreFindings ?? [];
  for (const finding of restoreFindings) {
    await deps.updateFindingResolution(finding.id, {
      resolutionStatus: finding.previousStatus,
      resolutionReason: null,
      resolvedBy: null,
      resolvedAt: null,
      previousResolutionStatus: "overridden",
    });
  }

  await deps.logAction({
    userId: input.userId,
    action: "JOB_SHEET_APPROVE_UNDO",
    entityType: "job_sheet",
    entityId: input.jobSheetId,
    details: {
      restoredStatus: input.restoreStatus,
      restoredAuditResult: input.restoreAuditResult,
      restoredFindingIds: restoreFindings.map(f => f.id),
    },
  });

  return {
    success: true,
    jobSheetId: input.jobSheetId,
    newStatus: input.restoreStatus,
    restoredFindingIds: restoreFindings.map(f => f.id),
  };
}
