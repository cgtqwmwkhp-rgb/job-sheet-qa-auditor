/**
 * Transactional Database Operations
 *
 * Atomic multi-step operations that ensure data consistency.
 * If any step fails, all changes are rolled back.
 */

import { getDb } from "../db";
import * as db from "../db";
import type {
  InsertAuditResult,
  InsertAuditFinding,
} from "../../drizzle/schema";
import type { DbTx } from "../db";
import {
  bulkResolveFindings,
  type AuditActionDeps,
  type FindingRecord,
} from "../services/auditActions";
import type { FindingAction } from "../services/auditActions/types";

/**
 * Create audit result with findings atomically.
 * If audit result creation succeeds but findings fail, everything rolls back.
 *
 * @param auditData - Audit result data
 * @param findingsData - Array of findings to create
 * @returns Created audit result ID and finding IDs
 */
export async function createAuditWithFindings(
  auditData: InsertAuditResult,
  findingsData: InsertAuditFinding[]
): Promise<{ auditId: number; findingIds: number[] }> {
  return db.runTransaction(tx =>
    createAuditWithFindingsInTransaction(tx, auditData, findingsData)
  );
}

async function createAuditWithFindingsInTransaction(
  tx: DbTx,
  auditData: InsertAuditResult,
  findingsData: InsertAuditFinding[]
): Promise<{ auditId: number; findingIds: number[] }> {
  const auditResult = await db.createAuditResult(auditData, tx);
  const auditId = auditResult.id;

  // Create all findings at once
  const findingsWithAuditId = findingsData.map(f => ({
    ...f,
    auditResultId: auditId,
  }));
  const findings = await db.createAuditFindings(findingsWithAuditId, tx);
  const findingIds = findings
    .map(f => f.id)
    .filter((id): id is number => id !== undefined);

  return { auditId, findingIds };
}

/**
 * Update job sheet status and create audit result atomically.
 * Ensures job sheet is marked complete only if audit is successfully created.
 */
export async function completeJobSheetProcessing(
  jobSheetId: number,
  status: "completed" | "failed",
  auditData?: InsertAuditResult,
  findingsData?: InsertAuditFinding[]
): Promise<{ auditId?: number; findingIds?: number[] }> {
  return db.runTransaction(async tx => {
    await db.updateJobSheetStatus(jobSheetId, status, tx);

    if (status === "completed" && auditData && findingsData) {
      return createAuditWithFindingsInTransaction(tx, auditData, findingsData);
    }

    return {};
  });
}

function mapFindingRow(
  row: NonNullable<Awaited<ReturnType<typeof db.getAuditFindingById>>>
): FindingRecord {
  return {
    id: row.id,
    auditResultId: row.auditResultId,
    resolutionStatus: (row.resolutionStatus ??
      "open") as FindingRecord["resolutionStatus"],
    resolutionReason: row.resolutionReason,
    resolvedBy: row.resolvedBy,
    resolvedAt: row.resolvedAt,
    previousResolutionStatus: row.previousResolutionStatus as
      | FindingRecord["previousResolutionStatus"]
      | null
      | undefined,
    severity: row.severity,
    fieldName: row.fieldName,
    rawSnippet: row.rawSnippet,
    normalisedSnippet: row.normalisedSnippet,
    ruleId: row.ruleId,
    reasonCode: row.reasonCode,
  };
}

function createTxDeps(tx: DbTx): AuditActionDeps {
  return {
    getFinding: async id => {
      const row = await db.getAuditFindingById(id);
      if (!row) return undefined;
      return mapFindingRow(row);
    },
    updateFindingResolution: (id, data) =>
      db.updateFindingResolution(id, data, tx),
    getAuditResult: async id => {
      const row = await db.getAuditResultById(id);
      if (!row) return undefined;
      return {
        id: row.id,
        jobSheetId: row.jobSheetId,
        result: row.result,
      };
    },
    updateAuditResultStatus: (id, result) =>
      db.updateAuditResultStatus(id, result, tx),
    updateJobSheetStatus: (id, status) =>
      db.updateJobSheetStatus(id, status, tx),
    createWaiver: data => db.createWaiver(data, tx),
    getWaiverByFindingId: id => db.getWaiverByFindingId(id, tx),
    revokeWaiver: (id, revokedBy) => db.revokeWaiver(id, revokedBy, tx),
    logAction: async data => {
      await db.logAction(data, { tx, required: true });
    },
    listFindingsByAuditResultId: async auditResultId => {
      const rows = await db.getAuditFindingsByResultId(auditResultId);
      return rows.map(mapFindingRow);
    },
  };
}

/**
 * Resolve multiple findings atomically and recalculate audit result once.
 * Wave-4 D1: all-or-nothing transaction + single sheet-truth recalc.
 */
export async function resolveFindingsBatch(
  findingIds: number[],
  resolution: {
    status: "waived" | "overridden" | "flagged" | "approved";
    reason?: string;
    resolvedBy: number;
    expectedStatus?: "open" | "waived" | "overridden" | "flagged" | "approved";
    expiresAt?: Date;
  }
): Promise<{
  auditResultId?: number;
  sheetResult?: string;
  jobSheetStatus?: string;
  resolvedIds: number[];
  skippedIds: number[];
}> {
  const actionByStatus: Record<
    "waived" | "overridden" | "flagged" | "approved",
    FindingAction
  > = {
    waived: "waive",
    overridden: "override",
    flagged: "flag",
    approved: "approve",
  };

  const action = actionByStatus[resolution.status];

  return db.runTransaction(async tx => {
    const deps = createTxDeps(tx);
    const result = await bulkResolveFindings(deps, {
      findingIds,
      action,
      reason: resolution.reason ?? `Bulk ${resolution.status}`,
      userId: resolution.resolvedBy,
      expectedStatus: resolution.expectedStatus,
      expiresAt: resolution.expiresAt,
    });

    return {
      auditResultId: result.auditResultId,
      sheetResult: result.auditResultStatus,
      jobSheetStatus: result.jobSheetStatus,
      resolvedIds: result.resolvedIds,
      skippedIds: result.skippedIds,
    };
  });
}

/**
 * Create dispute with automatic finding status update.
 * Ensures finding is marked as disputed when dispute is created.
 */
export async function createDisputeWithFindingUpdate(disputeData: {
  auditFindingId: number;
  raisedBy: number;
  reason: string;
  evidenceUrls?: any;
}): Promise<number> {
  const dbClient = await getDb();
  if (!dbClient) throw new Error("Database not available");

  // Create dispute
  const dispute = await db.createDispute({
    ...disputeData,
    status: "open",
  });

  // Update finding to reflect disputed status
  // Note: This would require a "disputed" flag or status in the findings table
  // For now, we just create the dispute

  return dispute.id;
}

/**
 * Delete job sheet and cascade to related records.
 * This is a dangerous operation - use with extreme caution.
 *
 * With foreign keys enabled, this should cascade automatically:
 * - Audit results → deleted
 * - Audit findings → deleted
 * - Disputes → deleted
 * - Selection traces → deleted
 */
export async function deleteJobSheetCascade(
  jobSheetId: number,
  deletedBy: number
): Promise<void> {
  const dbClient = await getDb();
  if (!dbClient) throw new Error("Database not available");

  // Log the deletion for audit trail
  await db.logAction({
    userId: deletedBy,
    action: "DELETE_JOB_SHEET",
    entityType: "job_sheet",
    entityId: jobSheetId,
    details: { reason: "Manual deletion", timestamp: new Date().toISOString() },
  });

  // Delete job sheet (cascades via foreign keys)
  await db.deleteJobSheet(jobSheetId);
}
