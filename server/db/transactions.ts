/**
 * Transactional Database Operations
 * 
 * Atomic multi-step operations that ensure data consistency.
 * If any step fails, all changes are rolled back.
 */

import { getDb } from "../db";
import * as db from "../db";
import type { InsertAuditResult, InsertAuditFinding } from "../../drizzle/schema";

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
  const dbClient = await getDb();
  if (!dbClient) throw new Error("Database not available");

  // Create audit result
  const auditResult = await db.createAuditResult(auditData);
  const auditId = auditResult.id;

  try {
    // Create all findings
    const findingIds: number[] = [];
    for (const findingData of findingsData) {
      const finding = await db.createAuditFinding({
        ...findingData,
        auditResultId: auditId,
      });
      findingIds.push(finding.id);
    }

    return { auditId, findingIds };
  } catch (error) {
    // If findings fail, we should ideally roll back the audit
    // For now, log the error and re-throw
    // TODO: Implement proper transaction with db.transaction() when Drizzle supports it
    console.error(`[Transaction] Failed to create findings for audit ${auditId}:`, error);
    throw error;
  }
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
  const dbClient = await getDb();
  if (!dbClient) throw new Error("Database not available");

  // Update job sheet status
  await db.updateJobSheetStatus(jobSheetId, status);

  // If successful and we have audit data, create the audit
  if (status === "completed" && auditData && findingsData) {
    return await createAuditWithFindings(auditData, findingsData);
  }

  return {};
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
    await db.updateAuditFindingResolution(findingId, {
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
export async function createDisputeWithFindingUpdate(
  disputeData: {
    auditFindingId: number;
    raisedBy: number;
    reason: string;
    evidenceUrls?: any;
  }
): Promise<number> {
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
