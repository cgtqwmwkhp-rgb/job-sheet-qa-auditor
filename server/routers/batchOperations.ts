/**
 * Batch Operations Router
 * 
 * Endpoints for bulk operations by QA Leads.
 * All endpoints require qa_lead or admin role.
 */

import { router, qaLeadProcedure } from "../_core/trpc";
import { z } from "zod";
import * as db from "../db";
import { TRPCError } from "@trpc/server";
import { resolveFindingsBatch } from "../db/transactions";

export const batchOperationsRouter = router({
  /**
   * Bulk approve findings.
   * QA lead can approve multiple findings at once after review.
   */
  approveFindingsBatch: qaLeadProcedure
    .input(
      z.object({
        findingIds: z.array(z.number()).min(1).max(100),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.findingIds.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "At least one finding ID required",
        });
      }

      await resolveFindingsBatch(input.findingIds, {
        status: "approved",
        reason: input.reason || "Bulk approval by QA lead",
        resolvedBy: ctx.user.id,
      });

      await db.logAction({
        userId: ctx.user.id,
        action: "BULK_APPROVE_FINDINGS",
        entityType: "audit_finding",
        entityId: input.findingIds[0], // Log first finding
        details: {
          count: input.findingIds.length,
          findingIds: input.findingIds,
          reason: input.reason,
        },
      });

      return {
        success: true,
        count: input.findingIds.length,
      };
    }),

  /**
   * Bulk waive findings.
   * QA lead can waive multiple findings with a single reason.
   */
  waiveFindingsBatch: qaLeadProcedure
    .input(
      z.object({
        findingIds: z.array(z.number()).min(1).max(100),
        reason: z.string().min(10),
        expiresAt: z.date().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.findingIds.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "At least one finding ID required",
        });
      }

      if (!input.reason || input.reason.length < 10) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Waiver reason must be at least 10 characters",
        });
      }

      await resolveFindingsBatch(input.findingIds, {
        status: "waived",
        reason: input.reason,
        resolvedBy: ctx.user.id,
      });

      // Create waiver records
      for (const findingId of input.findingIds) {
        await db.createWaiver({
          auditFindingId: findingId,
          approverId: ctx.user.id,
          reason: input.reason,
          expiresAt: input.expiresAt,
        });
      }

      await db.logAction({
        userId: ctx.user.id,
        action: "BULK_WAIVE_FINDINGS",
        entityType: "audit_finding",
        entityId: input.findingIds[0],
        details: {
          count: input.findingIds.length,
          findingIds: input.findingIds,
          reason: input.reason,
          expiresAt: input.expiresAt?.toISOString(),
        },
      });

      return {
        success: true,
        count: input.findingIds.length,
      };
    }),

  /**
   * Bulk update job sheet status.
   * QA lead can move multiple job sheets to review queue or mark as completed.
   */
  updateJobSheetStatusBatch: qaLeadProcedure
    .input(
      z.object({
        jobSheetIds: z.array(z.number()).min(1).max(50),
        status: z.enum(["pending", "processing", "completed", "failed", "review_queue"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.jobSheetIds.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "At least one job sheet ID required",
        });
      }

      // Update all job sheets
      for (const jobSheetId of input.jobSheetIds) {
        await db.updateJobSheetStatus(jobSheetId, input.status);
      }

      await db.logAction({
        userId: ctx.user.id,
        action: "BULK_UPDATE_JOB_SHEET_STATUS",
        entityType: "job_sheet",
        entityId: input.jobSheetIds[0],
        details: {
          count: input.jobSheetIds.length,
          jobSheetIds: input.jobSheetIds,
          newStatus: input.status,
        },
      });

      return {
        success: true,
        count: input.jobSheetIds.length,
      };
    }),

  /**
   * Bulk assign reviewer to disputes.
   * QA lead can assign themselves or another QA to multiple disputes.
   */
  assignDisputesBatch: qaLeadProcedure
    .input(
      z.object({
        disputeIds: z.array(z.number()).min(1).max(100),
        reviewerId: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.disputeIds.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "At least one dispute ID required",
        });
      }

      // Verify reviewer exists and has appropriate role
      const reviewer = await db.getUserById(input.reviewerId);
      if (!reviewer) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Reviewer not found",
        });
      }

      if (reviewer.role !== "qa_lead" && reviewer.role !== "admin") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Reviewer must be a QA lead or admin",
        });
      }

      // Assign all disputes
      for (const disputeId of input.disputeIds) {
        await db.assignDisputeReviewer(disputeId, input.reviewerId);
      }

      await db.logAction({
        userId: ctx.user.id,
        action: "BULK_ASSIGN_DISPUTES",
        entityType: "dispute",
        entityId: input.disputeIds[0],
        details: {
          count: input.disputeIds.length,
          disputeIds: input.disputeIds,
          reviewerId: input.reviewerId,
          reviewerName: reviewer.name,
        },
      });

      return {
        success: true,
        count: input.disputeIds.length,
      };
    }),

  /**
   * Bulk export audit results to CSV.
   * QA lead can export multiple audits for reporting.
   */
  exportAuditsBatch: qaLeadProcedure
    .input(
      z.object({
        auditResultIds: z.array(z.number()).min(1).max(500),
        format: z.enum(["csv", "json"]).default("csv"),
      })
    )
    .query(async ({ ctx, input }) => {
      const audits = [];

      for (const auditId of input.auditResultIds) {
        const audit = await db.getAuditResultById(auditId);
        if (audit) {
          const findings = await db.getAuditFindingsByResultId(auditId);
          audits.push({ ...audit, findings });
        }
      }

      await db.logAction({
        userId: ctx.user.id,
        action: "BULK_EXPORT_AUDITS",
        entityType: "audit_result",
        entityId: input.auditResultIds[0],
        details: {
          count: audits.length,
          format: input.format,
          requestedCount: input.auditResultIds.length,
        },
      });

      if (input.format === "json") {
        return {
          format: "json",
          data: audits,
          count: audits.length,
        };
      }

      // Convert to CSV
      const csv = convertAuditsToCSV(audits);
      return {
        format: "csv",
        data: csv,
        count: audits.length,
      };
    }),
});

/**
 * Convert audit results to CSV format.
 */
function convertAuditsToCSV(audits: any[]): string {
  if (audits.length === 0) return "";

  // CSV header
  const headers = [
    "Audit ID",
    "Job Sheet ID",
    "Result",
    "Confidence Score",
    "Processing Time (ms)",
    "Finding Count",
    "Critical Findings",
    "Created At",
  ];

  const rows = audits.map((audit) => [
    audit.id,
    audit.jobSheetId,
    audit.result,
    audit.confidenceScore || "",
    audit.processingTimeMs || "",
    audit.findings?.length || 0,
    audit.findings?.filter((f: any) => f.severity === "S0" || f.severity === "S1").length || 0,
    new Date(audit.createdAt).toISOString(),
  ]);

  return [headers, ...rows].map((row) => row.join(",")).join("\n");
}
