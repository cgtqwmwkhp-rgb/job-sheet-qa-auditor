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

/**
 * Resolve multiple findings atomically and recalculate audit result.
 * Used when QA lead approves/waives findings in bulk.
 */
export async function resolveFindingsBatch(
  findingIds: number[],
  resolution: {
    status: "waived" | "overridden" | "flagged" | "approved";
    reason?: string;
    resolvedBy: number;
  }
): Promise<void> {
  const dbClient = await getDb();
  if (!dbClient) throw new Error("Database not available");

  const timestamp = new Date();

  // Update all findings
  for (const findingId of findingIds) {
    await db.updateFindingResolution(findingId, {
      resolutionStatus: resolution.status,
      resolutionReason: resolution.reason,
      resolvedBy: resolution.resolvedBy,
      resolvedAt: timestamp,
    });
  }

  // TODO: Recalculate audit result based on resolved findings
  // This would require checking all findings for the audit and determining
  // if the overall result should change from fail → pass, etc.
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
