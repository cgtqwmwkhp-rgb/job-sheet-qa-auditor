/**
 * Audit Actions Router (PR-10)
 *
 * Wires waive / override / flag / approve / undo to DB + system audit log.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, adminProcedure, router } from "../_core/trpc";
import * as db from "../db";
import {
  applyFindingAction,
  undoFindingAction,
  bulkApproveFindings,
  approveJobSheet,
  undoJobSheetApprove,
  type AuditActionDeps,
} from "../services/auditActions";
import { FINDING_ACTIONS } from "../services/auditActions/types";

function createDbDeps(): AuditActionDeps {
  return {
    getFinding: async id => {
      const row = await db.getAuditFindingById(id);
      if (!row) return undefined;
      return {
        id: row.id,
        auditResultId: row.auditResultId,
        resolutionStatus: (row.resolutionStatus ?? "open") as
          | "open"
          | "waived"
          | "overridden"
          | "flagged"
          | "approved",
        resolutionReason: row.resolutionReason,
        resolvedBy: row.resolvedBy,
        resolvedAt: row.resolvedAt,
        previousResolutionStatus: row.previousResolutionStatus as
          | "open"
          | "waived"
          | "overridden"
          | "flagged"
          | "approved"
          | null
          | undefined,
      };
    },
    updateFindingResolution: (id, data) => db.updateFindingResolution(id, data),
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
      db.updateAuditResultStatus(id, result),
    updateJobSheetStatus: (id, status) => db.updateJobSheetStatus(id, status),
    createWaiver: data => db.createWaiver(data),
    getWaiverByFindingId: id => db.getWaiverByFindingId(id),
    deleteWaiver: id => db.deleteWaiver(id),
    logAction: async data => {
      await db.logAction(data);
    },
  };
}

const findingActionInput = z.object({
  findingId: z.number().int().positive(),
  reason: z.string().min(1).max(2000),
});

export const auditActionsRouter = router({
  /**
   * Waive a finding (creates waiver row + marks finding waived).
   * Admin-only — matches existing waivers.create policy.
   */
  waive: adminProcedure
    .input(findingActionInput)
    .mutation(async ({ ctx, input }) => {
      try {
        return await applyFindingAction(createDbDeps(), {
          findingId: input.findingId,
          action: "waive",
          reason: input.reason,
          userId: ctx.user.id,
        });
      } catch (err) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: err instanceof Error ? err.message : "Waive failed",
        });
      }
    }),

  /** Override a finding (reviewer overturns the automated result). */
  override: protectedProcedure
    .input(findingActionInput)
    .mutation(async ({ ctx, input }) => {
      try {
        return await applyFindingAction(createDbDeps(), {
          findingId: input.findingId,
          action: "override",
          reason: input.reason,
          userId: ctx.user.id,
        });
      } catch (err) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: err instanceof Error ? err.message : "Override failed",
        });
      }
    }),

  /** Flag a finding — moves job sheet into review_queue. */
  flag: protectedProcedure
    .input(findingActionInput)
    .mutation(async ({ ctx, input }) => {
      try {
        return await applyFindingAction(createDbDeps(), {
          findingId: input.findingId,
          action: "flag",
          reason: input.reason,
          userId: ctx.user.id,
        });
      } catch (err) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: err instanceof Error ? err.message : "Flag failed",
        });
      }
    }),

  /** Approve a finding (mark as accepted / no further action). */
  approve: protectedProcedure
    .input(findingActionInput)
    .mutation(async ({ ctx, input }) => {
      try {
        return await applyFindingAction(createDbDeps(), {
          findingId: input.findingId,
          action: "approve",
          reason: input.reason,
          userId: ctx.user.id,
        });
      } catch (err) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: err instanceof Error ? err.message : "Approve failed",
        });
      }
    }),

  /** Soft-undo the last finding action (status revert + waiver delete if needed). */
  undo: protectedProcedure
    .input(z.object({ findingId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await undoFindingAction(createDbDeps(), {
          findingId: input.findingId,
          userId: ctx.user.id,
        });
      } catch (err) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: err instanceof Error ? err.message : "Undo failed",
        });
      }
    }),

  /** Bulk-approve findings (e.g. from hold queue / findings panel). */
  bulkApprove: protectedProcedure
    .input(
      z.object({
        findingIds: z.array(z.number().int().positive()).min(1).max(100),
        reason: z.string().min(1).max(2000).default("Bulk approved"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return bulkApproveFindings(createDbDeps(), {
        findingIds: input.findingIds,
        reason: input.reason,
        userId: ctx.user.id,
      });
    }),

  /** Approve a job sheet out of the hold queue. */
  approveJobSheet: protectedProcedure
    .input(
      z.object({
        jobSheetId: z.number().int().positive(),
        reason: z.string().min(1).max(2000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const sheet = await db.getJobSheetById(input.jobSheetId);
      if (!sheet) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Job sheet not found",
        });
      }
      return approveJobSheet(createDbDeps(), {
        jobSheetId: input.jobSheetId,
        userId: ctx.user.id,
        reason: input.reason,
        previousStatus: sheet.status,
      });
    }),

  /** Undo job sheet approve — restore to prior status (default review_queue). */
  undoJobSheetApprove: protectedProcedure
    .input(
      z.object({
        jobSheetId: z.number().int().positive(),
        restoreStatus: z
          .enum([
            "pending",
            "processing",
            "completed",
            "failed",
            "review_queue",
          ])
          .default("review_queue"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return undoJobSheetApprove(createDbDeps(), {
        jobSheetId: input.jobSheetId,
        userId: ctx.user.id,
        restoreStatus: input.restoreStatus,
      });
    }),

  /** List supported actions (for UI / contract tests). */
  supportedActions: protectedProcedure.query(() => ({
    findingActions: [...FINDING_ACTIONS],
    undoSupported: true,
    bulkApproveSupported: true,
  })),
});

export type AuditActionsRouter = typeof auditActionsRouter;
