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
  bulkResolveFindings,
  approveJobSheet,
  undoJobSheetApprove,
  captureFieldCorrection,
  undoFieldCorrection,
  AuditActionError,
  type AuditActionDeps,
} from "../services/auditActions";
import {
  FINDING_ACTIONS,
  RESOLUTION_STATUSES,
  FORCE_PASS_MIN_REASON_LENGTH,
} from "../services/auditActions/types";
import {
  TRAINING_REASON_CODES,
  resolveJobSheetsForFindings,
} from "../services/trainingSignals";
import {
  isTemplateMemoryApplyEnabled,
  isTemplateMemoryCaptureEnabled,
} from "../services/templateMemory";
import {
  enforceRateLimit,
  RateLimitError,
  RATE_LIMITS,
} from "../utils/rateLimiter";
import { TransactionError, withTransaction } from "../utils/transactions";
import type { DbExecutor } from "../db";
import {
  auditActionResponseStore,
  getIdempotencyKey,
} from "../services/idempotency";
import {
  assertReviewClaimAllowsMutation,
  claimReview,
  getReviewClaim,
  heartbeatReviewClaim,
  isClaimActive,
  releaseReviewClaim,
  ReviewClaimError,
} from "../services/reviewClaim";

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

/**
 * Replays a completed (or in-flight) high-risk audit mutation when the caller
 * retries it with the same Idempotency-Key HTTP header. Keys are scoped to the
 * authenticated user and procedure, and a different request body is rejected.
 */
async function runIdempotentAuditAction<T>(input: {
  userId: number;
  request: unknown;
  procedure: string;
  body: unknown;
  action: () => Promise<T>;
}): Promise<T> {
  return auditActionResponseStore.execute({
    scope: `audit-action:${input.userId}:${input.procedure}`,
    key: getIdempotencyKey(input.request),
    body: input.body,
    action: input.action,
  });
}

function toAuditActionTrpcError(
  error: unknown,
  fallbackMessage: string
): TRPCError {
  const cause = error instanceof TransactionError ? error.cause : error;

  if (cause instanceof TRPCError) {
    return cause;
  }

  if (cause instanceof ReviewClaimError) {
    return new TRPCError({
      code: cause.code,
      message: cause.message,
    });
  }

  if (cause instanceof AuditActionError) {
    return new TRPCError({
      code: cause.code,
      message: cause.message,
    });
  }

  return new TRPCError({
    code: "BAD_REQUEST",
    message: error instanceof Error ? error.message : fallbackMessage,
  });
}

async function resolveJobSheetIdForFinding(
  findingId: number
): Promise<number | null> {
  const finding = await db.getAuditFindingById(findingId);
  if (!finding) return null;
  const audit = await db.getAuditResultById(finding.auditResultId);
  return audit?.jobSheetId ?? null;
}

async function guardFindingMutation(input: {
  findingId: number;
  userId: number;
  claimToken?: string;
  /** When set, enforce job-sheet ownership / role access (Wave-7). */
  user?: { id: number; role: import("../_core/azureRoles").DbUserRole };
}): Promise<void> {
  const jobSheetId = await resolveJobSheetIdForFinding(input.findingId);
  if (jobSheetId == null) {
    // Missing finding/audit — leave NOT_FOUND to the action path (and tests).
    return;
  }
  if (input.user) {
    const jobSheet = await db.getJobSheetById(jobSheetId);
    if (jobSheet) {
      const { enforceJobSheetAccess } = await import("../utils/authorization");
      enforceJobSheetAccess(jobSheet, input.user);
    }
  }
  await assertReviewClaimAllowsMutation({
    jobSheetId,
    userId: input.userId,
    claimToken: input.claimToken,
  });
}

async function guardFindingsMutation(input: {
  findingIds: number[];
  userId: number;
  claimToken?: string;
  user?: { id: number; role: import("../_core/azureRoles").DbUserRole };
}): Promise<void> {
  for (const findingId of input.findingIds) {
    await guardFindingMutation({
      findingId,
      userId: input.userId,
      claimToken: input.claimToken,
      user: input.user,
    });
  }
}

function mapFindingRow(
  row: NonNullable<Awaited<ReturnType<typeof db.getAuditFindingById>>>
) {
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
    severity: row.severity,
    fieldName: row.fieldName,
    rawSnippet: row.rawSnippet,
    normalisedSnippet: row.normalisedSnippet,
    ruleId: row.ruleId,
    reasonCode: row.reasonCode,
  };
}

function createDbDeps(tx?: DbExecutor): AuditActionDeps {
  return {
    getFinding: async id => {
      const row = await db.getAuditFindingById(id);
      if (!row) return undefined;
      return mapFindingRow(row);
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
        templateId: row.templateId ?? null,
        templateVersionId: row.templateVersionId ?? null,
      };
    },
    getAuditResultByJobSheetId: async jobSheetId => {
      const row = await db.getAuditResultByJobSheetId(jobSheetId);
      if (!row) return undefined;
      return {
        id: row.id,
        jobSheetId: row.jobSheetId,
        result: row.result,
        templateId: row.templateId ?? null,
        templateVersionId: row.templateVersionId ?? null,
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

/** Atomic compliance mutation: resolution + side effects + system_audit_log. */
async function runAuditAction<T>(
  fn: (deps: AuditActionDeps) => Promise<T>
): Promise<T> {
  return withTransaction(async tx => fn(createDbDeps(tx)));
}

/**
 * Single transactional implementation for every waiver entry point.
 * The legacy waivers.create endpoint delegates here for compatibility.
 */
export async function waiveFinding(input: {
  findingId: number;
  reason: string;
  userId: number;
  expiresAt?: Date;
  expectedStatus?: "open" | "waived" | "overridden" | "flagged" | "approved";
}) {
  await enforceReviewLimit(input.userId);
  return runAuditAction(deps =>
    applyFindingAction(deps, {
      findingId: input.findingId,
      action: "waive",
      reason: input.reason,
      userId: input.userId,
      expiresAt: input.expiresAt,
      expectedStatus: input.expectedStatus,
    })
  );
}

/** PX-064: accepted disputes overturn the finding via the same override path. */
export async function overrideFinding(input: {
  findingId: number;
  reason: string;
  userId: number;
  trainingReasonCode?: (typeof TRAINING_REASON_CODES)[number];
  expectedStatus?: "open" | "waived" | "overridden" | "flagged" | "approved";
}) {
  await enforceReviewLimit(input.userId);
  return runAuditAction(deps =>
    applyFindingAction(deps, {
      findingId: input.findingId,
      action: "override",
      reason: input.reason,
      userId: input.userId,
      trainingReasonCode: input.trainingReasonCode ?? "rule_wrong",
      expectedStatus: input.expectedStatus,
    })
  );
}

const findingActionInput = z.object({
  findingId: z.number().int().positive(),
  reason: z.string().min(1).max(2000),
  /** Optimistic concurrency — must match current resolutionStatus. */
  expectedStatus: z.enum(RESOLUTION_STATUSES).optional(),
  /** Optional sheet claim token when a review lease is held. */
  claimToken: z.string().uuid().optional(),
});

const waiveFindingInput = findingActionInput.extend({
  expiresAt: z.date().optional(),
});

const trainingReasonCodeRequired = z.enum(TRAINING_REASON_CODES);

const overrideActionInput = findingActionInput.extend({
  trainingReasonCode: trainingReasonCodeRequired,
});

export const auditActionsRouter = router({
  /**
   * Claim exclusive review lease on a job sheet (Wave-4 D1).
   * Heartbeat to keep; conflict when another reviewer holds a live lease.
   */
  claimReview: qaLeadProcedure
    .input(
      z.object({
        jobSheetId: z.number().int().positive(),
        force: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const sheet = await db.getJobSheetById(input.jobSheetId);
        if (!sheet) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Job sheet not found",
          });
        }
        const claim = await claimReview({
          jobSheetId: input.jobSheetId,
          userId: ctx.user.id,
          force: input.force,
        });
        await db.logAction({
          userId: ctx.user.id,
          action: "REVIEW_CLAIM",
          entityType: "job_sheet",
          entityId: input.jobSheetId,
          details: {
            claimToken: claim.claimToken,
            expiresAt: new Date(claim.expiresAt).toISOString(),
          },
        });
        return {
          jobSheetId: claim.jobSheetId,
          claimToken: claim.claimToken,
          claimedBy: claim.claimedBy,
          expiresAt: new Date(claim.expiresAt),
        };
      } catch (err) {
        throw toAuditActionTrpcError(err, "Claim failed");
      }
    }),

  /** Extend an active review lease. */
  heartbeatClaim: qaLeadProcedure
    .input(
      z.object({
        jobSheetId: z.number().int().positive(),
        claimToken: z.string().uuid(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const claim = await heartbeatReviewClaim({
          jobSheetId: input.jobSheetId,
          userId: ctx.user.id,
          claimToken: input.claimToken,
        });
        return {
          jobSheetId: claim.jobSheetId,
          claimToken: claim.claimToken,
          claimedBy: claim.claimedBy,
          expiresAt: new Date(claim.expiresAt),
        };
      } catch (err) {
        throw toAuditActionTrpcError(err, "Heartbeat failed");
      }
    }),

  /** Release an active review lease. */
  releaseClaim: qaLeadProcedure
    .input(
      z.object({
        jobSheetId: z.number().int().positive(),
        claimToken: z.string().uuid().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const result = await releaseReviewClaim({
          jobSheetId: input.jobSheetId,
          userId: ctx.user.id,
          claimToken: input.claimToken,
        });
        if (result.released) {
          await db.logAction({
            userId: ctx.user.id,
            action: "REVIEW_CLAIM_RELEASE",
            entityType: "job_sheet",
            entityId: input.jobSheetId,
            details: {},
          });
        }
        return result;
      } catch (err) {
        throw toAuditActionTrpcError(err, "Release failed");
      }
    }),

  /** Read current claim state (active or null). */
  getClaim: protectedProcedure
    .input(z.object({ jobSheetId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const claim = await getReviewClaim(input.jobSheetId);
      if (!isClaimActive(claim)) return { claim: null };
      return {
        claim: {
          jobSheetId: claim.jobSheetId,
          claimedBy: claim.claimedBy,
          expiresAt: new Date(claim.expiresAt),
          // Token only returned to the holder via claimReview/heartbeat.
        },
      };
    }),

  /**
   * Waive a finding (creates waiver row + marks finding waived).
   * Admin-only — the canonical waiver entry point.
   */
  waive: adminProcedure
    .input(waiveFindingInput)
    .mutation(async ({ ctx, input }) => {
      return runIdempotentAuditAction({
        userId: ctx.user.id,
        request: ctx.req,
        procedure: "waive",
        body: input,
        action: async () => {
          try {
            await guardFindingMutation({
              findingId: input.findingId,
              userId: ctx.user.id,
              claimToken: input.claimToken,
              user: ctx.user,
            });
            return await waiveFinding({
              ...input,
              userId: ctx.user.id,
            });
          } catch (err) {
            throw toAuditActionTrpcError(err, "Waive failed");
          }
        },
      });
    }),

  /** Override a finding (reviewer overturns the automated result). */
  override: qaLeadProcedure
    .input(overrideActionInput)
    .mutation(async ({ ctx, input }) => {
      return runIdempotentAuditAction({
        userId: ctx.user.id,
        request: ctx.req,
        procedure: "override",
        body: input,
        action: async () => {
          await enforceReviewLimit(ctx.user.id);
          try {
            await guardFindingMutation({
              findingId: input.findingId,
              userId: ctx.user.id,
              claimToken: input.claimToken,
              user: ctx.user,
            });
            return await runAuditAction(deps =>
              applyFindingAction(deps, {
                findingId: input.findingId,
                action: "override",
                reason: input.reason,
                userId: ctx.user.id,
                trainingReasonCode: input.trainingReasonCode,
                expectedStatus: input.expectedStatus,
              })
            );
          } catch (err) {
            throw toAuditActionTrpcError(err, "Override failed");
          }
        },
      });
    }),

  /** Flag a finding — moves job sheet into review_queue. */
  flag: qaLeadProcedure
    .input(findingActionInput)
    .mutation(async ({ ctx, input }) => {
      await enforceReviewLimit(ctx.user.id);
      try {
        await guardFindingMutation({
          findingId: input.findingId,
          userId: ctx.user.id,
          claimToken: input.claimToken,
          user: ctx.user,
        });
        return await runAuditAction(deps =>
          applyFindingAction(deps, {
            findingId: input.findingId,
            action: "flag",
            reason: input.reason,
            userId: ctx.user.id,
            expectedStatus: input.expectedStatus,
          })
        );
      } catch (err) {
        throw toAuditActionTrpcError(err, "Flag failed");
      }
    }),

  /** Approve a finding (mark as accepted / no further action). */
  approve: qaLeadProcedure
    .input(findingActionInput)
    .mutation(async ({ ctx, input }) => {
      return runIdempotentAuditAction({
        userId: ctx.user.id,
        request: ctx.req,
        procedure: "approve",
        body: input,
        action: async () => {
          await enforceReviewLimit(ctx.user.id);
          try {
            await guardFindingMutation({
              findingId: input.findingId,
              userId: ctx.user.id,
              claimToken: input.claimToken,
              user: ctx.user,
            });
            return await runAuditAction(deps =>
              applyFindingAction(deps, {
                findingId: input.findingId,
                action: "approve",
                reason: input.reason,
                userId: ctx.user.id,
                expectedStatus: input.expectedStatus,
              })
            );
          } catch (err) {
            throw toAuditActionTrpcError(err, "Approve failed");
          }
        },
      });
    }),

  /** Soft-undo the last finding action (status revert + waiver revocation if needed). */
  undo: qaLeadProcedure
    .input(
      z.object({
        findingId: z.number().int().positive(),
        claimToken: z.string().uuid().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await guardFindingMutation({
          findingId: input.findingId,
          userId: ctx.user.id,
          claimToken: input.claimToken,
          user: ctx.user,
        });
        return await runAuditAction(deps =>
          undoFindingAction(deps, {
            findingId: input.findingId,
            userId: ctx.user.id,
          })
        );
      } catch (err) {
        throw toAuditActionTrpcError(err, "Undo failed");
      }
    }),

  /** Bulk-approve findings (e.g. from hold queue / findings panel). */
  bulkApprove: qaLeadProcedure
    .input(
      z.object({
        findingIds: z.array(z.number().int().positive()).min(1).max(100),
        reason: z.string().min(1).max(2000).default("Bulk approved"),
        expectedStatus: z.enum(RESOLUTION_STATUSES).optional(),
        claimToken: z.string().uuid().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await guardFindingsMutation({
          findingIds: input.findingIds,
          userId: ctx.user.id,
          claimToken: input.claimToken,
          user: ctx.user,
        });
        return await runAuditAction(deps =>
          bulkApproveFindings(deps, {
            findingIds: input.findingIds,
            reason: input.reason,
            userId: ctx.user.id,
            expectedStatus: input.expectedStatus,
          })
        );
      } catch (err) {
        throw toAuditActionTrpcError(err, "Bulk approve failed");
      }
    }),

  /**
   * Atomic bulk resolve + single sheet-truth recalc (Wave-4 D1).
   * Challenge bar: waive last S0/S1 → sheet flips in one transaction.
   */
  bulkResolve: qaLeadProcedure
    .input(
      z.object({
        findingIds: z.array(z.number().int().positive()).min(1).max(100),
        action: z.enum(FINDING_ACTIONS),
        reason: z.string().min(1).max(2000),
        expiresAt: z.date().optional(),
        expectedStatus: z.enum(RESOLUTION_STATUSES).optional(),
        claimToken: z.string().uuid().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await enforceReviewLimit(ctx.user.id);
        await guardFindingsMutation({
          findingIds: input.findingIds,
          userId: ctx.user.id,
          claimToken: input.claimToken,
          user: ctx.user,
        });
        return await runAuditAction(deps =>
          bulkResolveFindings(deps, {
            findingIds: input.findingIds,
            action: input.action,
            reason: input.reason,
            userId: ctx.user.id,
            expiresAt: input.expiresAt,
            expectedStatus: input.expectedStatus,
          })
        );
      } catch (err) {
        throw toAuditActionTrpcError(err, "Bulk resolve failed");
      }
    }),

  /**
   * Approve a job sheet out of the hold queue.
   *
   * PR-A (PX-109): `forcePass: true` auto-overrides open Major / photo
   * cost-risk blockers and forces the sheet to pass — never silent, so a
   * reason of at least FORCE_PASS_MIN_REASON_LENGTH chars is required.
   */
  approveJobSheet: qaLeadProcedure
    .input(
      z
        .object({
          jobSheetId: z.number().int().positive(),
          reason: z.string().min(1).max(2000).optional(),
          claimToken: z.string().uuid().optional(),
          forcePass: z.boolean().optional(),
        })
        .superRefine((val, ctx) => {
          if (
            val.forcePass &&
            (val.reason ?? "").trim().length < FORCE_PASS_MIN_REASON_LENGTH
          ) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["reason"],
              message: `forcePass requires a reason of at least ${FORCE_PASS_MIN_REASON_LENGTH} characters explaining the override`,
            });
          }
        })
    )
    .mutation(async ({ ctx, input }) => {
      return runIdempotentAuditAction({
        userId: ctx.user.id,
        request: ctx.req,
        procedure: "approveJobSheet",
        body: input,
        action: async () => {
          const sheet = await db.getJobSheetById(input.jobSheetId);
          if (!sheet) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Job sheet not found",
            });
          }
          try {
            await assertReviewClaimAllowsMutation({
              jobSheetId: input.jobSheetId,
              userId: ctx.user.id,
              claimToken: input.claimToken,
            });
            return await runAuditAction(deps =>
              approveJobSheet(deps, {
                jobSheetId: input.jobSheetId,
                userId: ctx.user.id,
                reason: input.reason,
                previousStatus: sheet.status,
                forcePass: input.forcePass,
              })
            );
          } catch (err) {
            throw toAuditActionTrpcError(err, "Approve job sheet failed");
          }
        },
      });
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
        // PX-062: restore the audit result approve overwrote to "pass".
        auditResultId: z.number().int().positive().optional(),
        restoreAuditResult: z
          .enum(["pass", "fail", "review_queue", "waived"])
          .optional(),
        claimToken: z.string().uuid().optional(),
        // PR-A: reverse a forcePass auto-override back to each finding's
        // resolution prior to the override.
        restoreFindings: z
          .array(
            z.object({
              id: z.number().int().positive(),
              previousStatus: z.enum(RESOLUTION_STATUSES),
            })
          )
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await assertReviewClaimAllowsMutation({
          jobSheetId: input.jobSheetId,
          userId: ctx.user.id,
          claimToken: input.claimToken,
        });
        return await runAuditAction(deps =>
          undoJobSheetApprove(deps, {
            jobSheetId: input.jobSheetId,
            userId: ctx.user.id,
            restoreStatus: input.restoreStatus,
            auditResultId: input.auditResultId,
            restoreAuditResult: input.restoreAuditResult,
            restoreFindings: input.restoreFindings,
          })
        );
      } catch (err) {
        throw toAuditActionTrpcError(err, "Undo job sheet approve failed");
      }
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
        trainingReasonCode: trainingReasonCodeRequired,
        claimToken: z.string().uuid().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await guardFindingMutation({
          findingId: input.findingId,
          userId: ctx.user.id,
          claimToken: input.claimToken,
          user: ctx.user,
        });
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
        throw toAuditActionTrpcError(err, "Field correction failed");
      }
    }),

  /** Soft-undo a field correction (restore previous normalisedSnippet). */
  undoFieldCorrection: qaLeadProcedure
    .input(
      z.object({
        findingId: z.number().int().positive(),
        previousSnippet: z.string().max(4000).nullable(),
        claimToken: z.string().uuid().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await guardFindingMutation({
          findingId: input.findingId,
          userId: ctx.user.id,
          claimToken: input.claimToken,
          user: ctx.user,
        });
        return await runAuditAction(deps =>
          undoFieldCorrection(deps, {
            findingId: input.findingId,
            previousSnippet: input.previousSnippet,
            userId: ctx.user.id,
          })
        );
      } catch (err) {
        throw toAuditActionTrpcError(err, "Undo field correction failed");
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
    bulkResolveSupported: true,
    reviewClaimSupported: true,
    expectedStatusSupported: true,
    fieldCorrectionSupported: true,
    forcePassSupported: true,
    trainingReasonCodes: [...TRAINING_REASON_CODES],
    templateMemoryWrite: isTemplateMemoryCaptureEnabled(),
    templateMemoryApply: isTemplateMemoryApplyEnabled(),
  })),
});

export type AuditActionsRouter = typeof auditActionsRouter;
