/**
 * Audit Actions Router (PR-10)
 *
 * Wires waive / override / flag / approve / undo to DB + system audit log.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  protectedProcedure,
  adminProcedure,
  qaLeadProcedure,
  router,
} from "../_core/trpc";
import * as db from "../db";
import {
  applyFindingAction,
  undoFindingAction,
  bulkApproveFindings,
  approveJobSheet,
  undoJobSheetApprove,
  captureFieldCorrection,
  undoFieldCorrection,
  type AuditActionDeps,
} from "../services/auditActions";
import { FINDING_ACTIONS } from "../services/auditActions/types";
import {
  TRAINING_REASON_CODES,
  resolveJobSheetsForFindings,
} from "../services/trainingSignals";
import {
  enforceRateLimit,
  RateLimitError,
  RATE_LIMITS,
} from "../utils/rateLimiter";
import { withTransaction } from "../utils/transactions";
import type { DbClient } from "../db";

async function throwIfRateLimited(
  fn: () => unknown | Promise<unknown>
): Promise<void> {
  try {
    await fn();
  } catch (err) {
    if (err instanceof RateLimitError) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: err.message,
      });
    }
    throw err;
  }
}

async function enforceReviewLimit(userId: number): Promise<void> {
  await throwIfRateLimited(() =>
    enforceRateLimit(`user:${userId}:review`, RATE_LIMITS.review)
  );
}

function createDbDeps(tx?: DbClient): AuditActionDeps {
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
        fieldName: row.fieldName,
        rawSnippet: row.rawSnippet,
        normalisedSnippet: row.normalisedSnippet,
        ruleId: row.ruleId,
        reasonCode: row.reasonCode,
      };
    },
    updateFindingResolution: (id, data) =>
      db.updateFindingResolution(id, data, tx),
    updateFindingSnippet: (id, data) => db.updateFindingSnippet(id, data, tx),
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
    getWaiverByFindingId: id => db.getWaiverByFindingId(id),
    deleteWaiver: id => db.deleteWaiver(id, tx),
    logAction: async data => {
      await db.logAction(data, { tx, required: true });
    },
  };
}

/** Atomic compliance mutation: resolution + side effects + system_audit_log. */
async function runAuditAction<T>(
  fn: (deps: AuditActionDeps) => Promise<T>
): Promise<T> {
  return withTransaction(async tx => fn(createDbDeps(tx)));
}

const findingActionInput = z.object({
  findingId: z.number().int().positive(),
  reason: z.string().min(1).max(2000),
});

const trainingReasonCodeInput = z.enum(TRAINING_REASON_CODES).optional();

const overrideActionInput = findingActionInput.extend({
  trainingReasonCode: trainingReasonCodeInput,
});

export const auditActionsRouter = router({
  /**
   * Waive a finding (creates waiver row + marks finding waived).
   * Admin-only — matches existing waivers.create policy.
   */
  waive: adminProcedure
    .input(findingActionInput)
    .mutation(async ({ ctx, input }) => {
      await enforceReviewLimit(ctx.user.id);
      try {
        return await runAuditAction(deps =>
          applyFindingAction(deps, {
            findingId: input.findingId,
            action: "waive",
            reason: input.reason,
            userId: ctx.user.id,
          })
        );
      } catch (err) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: err instanceof Error ? err.message : "Waive failed",
        });
      }
    }),

  /** Override a finding (reviewer overturns the automated result). */
  override: qaLeadProcedure
    .input(overrideActionInput)
    .mutation(async ({ ctx, input }) => {
      await enforceReviewLimit(ctx.user.id);
      try {
        return await runAuditAction(deps =>
          applyFindingAction(deps, {
            findingId: input.findingId,
            action: "override",
            reason: input.reason,
            userId: ctx.user.id,
            trainingReasonCode: input.trainingReasonCode,
          })
        );
      } catch (err) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: err instanceof Error ? err.message : "Override failed",
        });
      }
    }),

  /** Flag a finding — moves job sheet into review_queue. */
  flag: qaLeadProcedure
    .input(findingActionInput)
    .mutation(async ({ ctx, input }) => {
      await enforceReviewLimit(ctx.user.id);
      try {
        return await runAuditAction(deps =>
          applyFindingAction(deps, {
            findingId: input.findingId,
            action: "flag",
            reason: input.reason,
            userId: ctx.user.id,
          })
        );
      } catch (err) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: err instanceof Error ? err.message : "Flag failed",
        });
      }
    }),

  /** Approve a finding (mark as accepted / no further action). */
  approve: qaLeadProcedure
    .input(findingActionInput)
    .mutation(async ({ ctx, input }) => {
      await enforceReviewLimit(ctx.user.id);
      try {
        return await runAuditAction(deps =>
          applyFindingAction(deps, {
            findingId: input.findingId,
            action: "approve",
            reason: input.reason,
            userId: ctx.user.id,
          })
        );
      } catch (err) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: err instanceof Error ? err.message : "Approve failed",
        });
      }
    }),

  /** Soft-undo the last finding action (status revert + waiver delete if needed). */
  undo: qaLeadProcedure
    .input(z.object({ findingId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await runAuditAction(deps =>
          undoFindingAction(deps, {
            findingId: input.findingId,
            userId: ctx.user.id,
          })
        );
      } catch (err) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: err instanceof Error ? err.message : "Undo failed",
        });
      }
    }),

  /** Bulk-approve findings (e.g. from hold queue / findings panel). */
  bulkApprove: qaLeadProcedure
    .input(
      z.object({
        findingIds: z.array(z.number().int().positive()).min(1).max(100),
        reason: z.string().min(1).max(2000).default("Bulk approved"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return runAuditAction(deps =>
        bulkApproveFindings(deps, {
          findingIds: input.findingIds,
          reason: input.reason,
          userId: ctx.user.id,
        })
      );
    }),

  /** Approve a job sheet out of the hold queue. */
  approveJobSheet: qaLeadProcedure
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
      return runAuditAction(deps =>
        approveJobSheet(deps, {
          jobSheetId: input.jobSheetId,
          userId: ctx.user.id,
          reason: input.reason,
          previousStatus: sheet.status,
        })
      );
    }),

  /** Undo job sheet approve — restore to prior status (default review_queue). */
  undoJobSheetApprove: qaLeadProcedure
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
      return runAuditAction(deps =>
        undoJobSheetApprove(deps, {
          jobSheetId: input.jobSheetId,
          userId: ctx.user.id,
          restoreStatus: input.restoreStatus,
        })
      );
    }),

  /**
   * Capture a reviewer field correction (PR-13).
   * Writes normalisedSnippet + FIELD_CORRECTION audit log — no new migration.
   */
  captureFieldCorrection: qaLeadProcedure
    .input(
      z.object({
        findingId: z.number().int().positive(),
        fieldName: z.string().min(1).max(200).optional(),
        originalValue: z.string().max(4000).optional(),
        correctedValue: z.string().min(1).max(4000),
        trainingReasonCode: trainingReasonCodeInput,
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await runAuditAction(deps =>
          captureFieldCorrection(deps, {
            findingId: input.findingId,
            fieldName: input.fieldName,
            originalValue: input.originalValue,
            correctedValue: input.correctedValue,
            userId: ctx.user.id,
            trainingReasonCode: input.trainingReasonCode,
          })
        );
      } catch (err) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            err instanceof Error ? err.message : "Field correction failed",
        });
      }
    }),

  /** Soft-undo a field correction (restore previous normalisedSnippet). */
  undoFieldCorrection: qaLeadProcedure
    .input(
      z.object({
        findingId: z.number().int().positive(),
        previousSnippet: z.string().max(4000).nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await runAuditAction(deps =>
          undoFieldCorrection(deps, {
            findingId: input.findingId,
            previousSnippet: input.previousSnippet,
            userId: ctx.user.id,
          })
        );
      } catch (err) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            err instanceof Error ? err.message : "Undo field correction failed",
        });
      }
    }),

  /** Resolve sample finding ids → job sheet ids (Exceptions CTAs). */
  resolveSampleAudits: protectedProcedure
    .input(
      z.object({
        findingIds: z.array(z.number().int().positive()).min(1).max(25),
      })
    )
    .query(async ({ input }) => {
      const deps = createDbDeps();
      const samples = await resolveJobSheetsForFindings(deps, input.findingIds);
      return {
        samples,
        jobSheetIds: samples.map(s => s.jobSheetId),
      };
    }),

  /** List supported actions (for UI / contract tests). */
  supportedActions: protectedProcedure.query(() => ({
    findingActions: [...FINDING_ACTIONS],
    undoSupported: true,
    bulkApproveSupported: true,
    fieldCorrectionSupported: true,
    trainingReasonCodes: [...TRAINING_REASON_CODES],
  })),
});

export type AuditActionsRouter = typeof auditActionsRouter;
