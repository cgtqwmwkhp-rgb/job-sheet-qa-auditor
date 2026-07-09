/**
 * Analytics Router
 *
 * PR-I: selection analytics / ops dashboard.
 * PR-15: engineer scorecards, trends, and drill-through.
 * PR-16: cohort analytics (site/asset/workType) + template collision governance.
 * PR-17: exception management — review SLAs, ageing, overturn rates, DLQ retry.
 * PR-18: drift detection — EWMA/CUSUM, calibration histograms, alerting.
 * PR-19: predictive risk scoring — leading indicators, attention queue, fix packs.
 * PR-21: shadow / champion-challenger — disagreement reporting, canary switches.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, adminProcedure, router } from "../_core/trpc";
import {
  getSelectionAnalytics,
  getAmbiguousTemplatePairs,
  getTokenCollisions,
  getTemplateAnalyticsSummary,
  checkAmbiguityAlert,
  getSelectionRecords,
} from "../services/selectionAnalytics";
import * as db from "../db";
import {
  buildEngineerAnalyticsSummary,
  buildEngineerScoreCardDetail,
  resolvePeriod,
} from "../services/engineerAnalytics/aggregateFromDb";
import type { RawFindingRow } from "../services/engineerAnalytics/mapFindings";
import {
  buildCohortAnalyticsSummary,
  buildCohortDrilldown,
  resolveCohortPeriod,
  type CohortDocumentRow,
  type CohortFindingRow,
} from "../services/cohortAnalytics";
import {
  detectAllTemplateCollisions,
  listTemplateFingerprints,
  getTemplateVersion,
  fingerprintFromSelectionConfig,
  detectTemplateCollisions,
} from "../services/templateRegistry";
import {
  buildExceptionManagementSummary,
  buildHoldQueueSlaSummary,
  buildOverturnAnalytics,
  buildRecurrenceSummary,
  resolveExceptionPeriod,
  runDlqRetryPass,
  type HoldQueueItemRow,
  type OverturnFindingRow,
} from "../services/exceptionAnalytics";
import {
  buildDriftAnalyticsSummary,
  resolveDriftPeriod,
  type DriftDocumentRow,
  type DriftFindingRow,
} from "../services/driftAnalytics";
import {
  buildPredictiveRiskSummary,
  resolvePredictivePeriod,
  type PredictiveDisputeRow,
  type PredictiveDocumentRow,
  type PredictiveFindingRow,
  type PredictiveUserRow,
} from "../services/predictiveRiskAnalytics";
import {
  buildShadowChallengerSummary,
  resolveShadowPeriod,
  getShadowChallengerConfig,
} from "../services/shadowChallenger";
import {
  enforceRateLimit,
  RateLimitError,
  RATE_LIMITS,
} from "../utils/rateLimiter";
import { getDLQStats, getRecoverableJobs } from "../utils/deadLetterQueue";

const periodInput = z
  .object({
    startDate: z.string().optional(),
    endDate: z.string().optional(),
  })
  .optional();

function priorWindowStart(startIso: string, endIso: string): Date {
  const startMs = new Date(startIso).getTime();
  const endMs = new Date(endIso).getTime();
  const duration = Math.max(endMs - startMs, 24 * 60 * 60 * 1000);
  return new Date(startMs - duration);
}

async function loadEngineerAnalyticsInputs(input?: {
  startDate?: string;
  endDate?: string;
  technicianId?: number;
}) {
  const period = resolvePeriod(input?.startDate, input?.endDate);
  const fetchStart = priorWindowStart(period.start, period.end);
  const fetchEnd = new Date(period.end);

  const [users, documents, findings] = await Promise.all([
    db.getAllUsers(),
    db.getEngineerAnalyticsDocuments({
      startDate: fetchStart,
      endDate: fetchEnd,
      technicianId: input?.technicianId,
    }),
    db.getEngineerAnalyticsFindings({
      startDate: fetchStart,
      endDate: fetchEnd,
      technicianId: input?.technicianId,
    }),
  ]);

  return {
    period,
    users: users.map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      createdAt: u.createdAt,
      isActive: true,
    })),
    documents,
    findings: findings as RawFindingRow[],
  };
}

async function loadCohortAnalyticsInputs(input?: {
  startDate?: string;
  endDate?: string;
}) {
  const period = resolveCohortPeriod(input?.startDate, input?.endDate);
  const fetchStart = new Date(period.start);
  const fetchEnd = new Date(period.end);

  const [documents, findings] = await Promise.all([
    db.getCohortAnalyticsDocuments({
      startDate: fetchStart,
      endDate: fetchEnd,
    }),
    db.getCohortAnalyticsFindings({
      startDate: fetchStart,
      endDate: fetchEnd,
    }),
  ]);

  return {
    period,
    documents: documents as CohortDocumentRow[],
    findings: findings as CohortFindingRow[],
  };
}

async function loadExceptionAnalyticsInputs(input?: {
  startDate?: string;
  endDate?: string;
}) {
  const period = resolveExceptionPeriod(input?.startDate, input?.endDate);
  const [holdItems, findings] = await Promise.all([
    db.getExceptionHoldQueueItems(),
    db.getExceptionOverturnFindings({
      startDate: new Date(period.start),
      endDate: new Date(period.end),
    }),
  ]);

  return {
    period,
    holdItems: holdItems as HoldQueueItemRow[],
    findings: findings as OverturnFindingRow[],
  };
}

async function loadDriftAnalyticsInputs(input?: {
  startDate?: string;
  endDate?: string;
}) {
  const period = resolveDriftPeriod(input?.startDate, input?.endDate);
  const [documents, findings] = await Promise.all([
    db.getDriftAnalyticsDocuments({
      startDate: new Date(period.start),
      endDate: new Date(period.end),
    }),
    db.getDriftAnalyticsFindings({
      startDate: new Date(period.start),
      endDate: new Date(period.end),
    }),
  ]);

  return {
    period,
    documents: documents as DriftDocumentRow[],
    findings: findings as DriftFindingRow[],
  };
}

async function loadPredictiveRiskInputs(input?: {
  startDate?: string;
  endDate?: string;
}) {
  const period = resolvePredictivePeriod(input?.startDate, input?.endDate);
  const [documents, findings, disputes, users] = await Promise.all([
    db.getPredictiveRiskDocuments({
      startDate: new Date(period.start),
      endDate: new Date(period.end),
    }),
    db.getPredictiveRiskFindings({
      startDate: new Date(period.start),
      endDate: new Date(period.end),
    }),
    db.getPredictiveRiskDisputes({
      startDate: new Date(period.start),
      endDate: new Date(period.end),
    }),
    db.getAllUsers(),
  ]);

  return {
    period,
    documents: documents as PredictiveDocumentRow[],
    findings: findings as PredictiveFindingRow[],
    disputes: disputes as PredictiveDisputeRow[],
    users: users.map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
    })) as PredictiveUserRow[],
  };
}

async function loadShadowChallengerInputs(input?: {
  startDate?: string;
  endDate?: string;
}) {
  const period = resolveShadowPeriod(input);
  const reportJsons = await db.getShadowComparisonReportJsons({
    startDate: new Date(period.start),
    endDate: new Date(period.end),
  });
  return { period, reportJsons };
}

function throwIfRateLimited(fn: () => unknown): void {
  try {
    fn();
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

/**
 * Analytics Router
 */
export const analyticsRouter = router({
  /**
   * Get overall selection analytics
   */
  getOverview: adminProcedure
    .input(
      z
        .object({
          startDate: z.string().optional(),
          endDate: z.string().optional(),
        })
        .optional()
    )
    .query(({ input }) => {
      const startDate = input?.startDate
        ? new Date(input.startDate)
        : undefined;
      const endDate = input?.endDate ? new Date(input.endDate) : undefined;
      return getSelectionAnalytics(startDate, endDate);
    }),

  /**
   * Get confidence distribution
   */
  getConfidenceDistribution: adminProcedure.query(() => {
    const analytics = getSelectionAnalytics();
    return {
      distribution: analytics.confidenceDistribution,
      total: analytics.totalSelections,
    };
  }),

  /**
   * Get top ambiguous template pairs
   */
  getAmbiguousPairs: adminProcedure
    .input(
      z
        .object({
          limit: z.number().min(1).max(50).optional(),
        })
        .optional()
    )
    .query(({ input }) => {
      return getAmbiguousTemplatePairs(input?.limit ?? 10);
    }),

  /**
   * Get tokens causing collisions
   */
  getTokenCollisions: adminProcedure
    .input(
      z
        .object({
          limit: z.number().min(1).max(100).optional(),
        })
        .optional()
    )
    .query(({ input }) => {
      return getTokenCollisions(input?.limit ?? 20);
    }),

  /**
   * Get per-template analytics
   */
  getTemplateStats: adminProcedure.query(() => {
    return getTemplateAnalyticsSummary();
  }),

  /**
   * Check ambiguity alert status
   */
  checkAmbiguityAlert: adminProcedure
    .input(
      z
        .object({
          thresholdPercent: z.number().min(0).max(100).optional(),
        })
        .optional()
    )
    .query(({ input }) => {
      return checkAmbiguityAlert(input?.thresholdPercent ?? 15);
    }),

  /**
   * Get selection records with filtering
   */
  getRecords: adminProcedure
    .input(
      z
        .object({
          limit: z.number().min(1).max(100).optional(),
          offset: z.number().min(0).optional(),
          templateSlug: z.string().optional(),
          confidenceBand: z.enum(["HIGH", "MEDIUM", "LOW"]).optional(),
          onlyAmbiguous: z.boolean().optional(),
        })
        .optional()
    )
    .query(({ input }) => {
      return getSelectionRecords({
        limit: input?.limit ?? 50,
        offset: input?.offset ?? 0,
        templateSlug: input?.templateSlug,
        confidenceBand: input?.confidenceBand,
        onlyAmbiguous: input?.onlyAmbiguous,
      });
    }),

  /**
   * Get dashboard summary (combined data for UI)
   */
  getDashboardSummary: adminProcedure.query(() => {
    const analytics = getSelectionAnalytics();
    const ambiguityAlert = checkAmbiguityAlert();
    const templateStats = getTemplateAnalyticsSummary().slice(0, 10);
    const ambiguousPairs = getAmbiguousTemplatePairs(5);
    const tokenCollisions = getTokenCollisions(10);

    return {
      overview: {
        totalSelections: analytics.totalSelections,
        autoProcessedCount: analytics.autoProcessedCount,
        overrideCount: analytics.overrideCount,
        ambiguousCount: analytics.ambiguousCount,
        confidenceDistribution: analytics.confidenceDistribution,
      },
      alert: ambiguityAlert,
      topTemplates: templateStats,
      topAmbiguousPairs: ambiguousPairs,
      topCollisionTokens: tokenCollisions,
      periodStart: analytics.periodStart.toISOString(),
      periodEnd: analytics.periodEnd.toISOString(),
    };
  }),

  // ============ PR-15: ENGINEER ANALYTICS ============

  /**
   * Leaderboard + team trends from technician-attributed job sheets / findings.
   */
  getEngineerSummary: protectedProcedure
    .input(periodInput)
    .query(async ({ input }) => {
      const loaded = await loadEngineerAnalyticsInputs(input);
      return buildEngineerAnalyticsSummary({
        users: loaded.users,
        documents: loaded.documents,
        findings: loaded.findings,
        startDate: loaded.period.start,
        endDate: loaded.period.end,
      });
    }),

  /**
   * Single engineer scorecard + fix pack + finding drill-through rows.
   */
  getEngineerScoreCard: protectedProcedure
    .input(
      z.object({
        engineerId: z.string().min(1),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const technicianId = Number(input.engineerId);
      const loaded = await loadEngineerAnalyticsInputs({
        startDate: input.startDate,
        endDate: input.endDate,
        technicianId: Number.isFinite(technicianId) ? technicianId : undefined,
      });
      return buildEngineerScoreCardDetail({
        users: loaded.users,
        documents: loaded.documents,
        findings: loaded.findings,
        engineerId: input.engineerId,
        startDate: loaded.period.start,
        endDate: loaded.period.end,
      });
    }),

  // ============ PR-16: COHORT ANALYTICS + COLLISION GOVERNANCE ============

  /**
   * Cohort summary by site / assetType / workType from DB-backed audits.
   */
  getCohortSummary: protectedProcedure
    .input(periodInput)
    .query(async ({ input }) => {
      const loaded = await loadCohortAnalyticsInputs(input);
      return buildCohortAnalyticsSummary({
        documents: loaded.documents,
        findings: loaded.findings,
        startDate: loaded.period.start,
        endDate: loaded.period.end,
      });
    }),

  /**
   * Finding-level drill-through for a single cohort bucket.
   */
  getCohortDrilldown: protectedProcedure
    .input(
      z.object({
        dimension: z.enum(["site", "assetType", "workType"]),
        key: z.string().min(1),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        limit: z.number().min(1).max(100).optional(),
      })
    )
    .query(async ({ input }) => {
      const loaded = await loadCohortAnalyticsInputs(input);
      return buildCohortDrilldown({
        documents: loaded.documents,
        findings: loaded.findings,
        dimension: input.dimension,
        key: input.key,
        startDate: loaded.period.start,
        endDate: loaded.period.end,
        limit: input.limit,
      });
    }),

  /**
   * Template fingerprint collision governance report (in-memory registry).
   */
  getTemplateCollisionReport: adminProcedure.query(() => {
    const fingerprints = listTemplateFingerprints();
    const report = detectAllTemplateCollisions(fingerprints);
    return {
      templateCount: fingerprints.length,
      allowed: report.allowed,
      blockingCount: report.blocking.length,
      warningCount: report.warnings.length,
      message: report.message,
      blocking: report.blocking,
      warnings: report.warnings,
      fingerprints: fingerprints.map(f => ({
        templateSlug: f.templateSlug,
        requiredTokensAll: f.requiredTokensAll,
        requiredTokensAny: f.requiredTokensAny,
        formCodeRegex: f.formCodeRegex ?? null,
      })),
    };
  }),

  /**
   * Check a candidate selection config against the live catalog (pre-activation).
   */
  checkTemplateCollision: adminProcedure
    .input(
      z.object({
        templateSlug: z.string().min(1),
        versionId: z.number().optional(),
        selectionConfigJson: z
          .object({
            requiredTokensAll: z.array(z.string()),
            requiredTokensAny: z.array(z.string()),
            optionalTokens: z.array(z.string()).optional(),
            formCodeRegex: z.string().optional(),
          })
          .optional(),
      })
    )
    .query(({ input }) => {
      let selection = input.selectionConfigJson;
      if (!selection && input.versionId != null) {
        const version = getTemplateVersion(input.versionId);
        if (!version) {
          throw new Error(`Version not found: ${input.versionId}`);
        }
        selection = version.selectionConfigJson;
      }
      if (!selection) {
        throw new Error(
          "Provide selectionConfigJson or versionId for collision check"
        );
      }

      const candidate = fingerprintFromSelectionConfig(input.templateSlug, {
        requiredTokensAll: selection.requiredTokensAll,
        requiredTokensAny: selection.requiredTokensAny,
        optionalTokens: selection.optionalTokens ?? [],
        formCodeRegex: selection.formCodeRegex,
      });
      const existing = listTemplateFingerprints();
      return detectTemplateCollisions(candidate, existing);
    }),

  // ============ PR-17: EXCEPTION MANAGEMENT ============

  /**
   * Hold-queue SLA timers + ageing buckets.
   */
  getHoldQueueSla: protectedProcedure.query(async () => {
    const holdItems = await db.getExceptionHoldQueueItems();
    return buildHoldQueueSlaSummary({
      items: holdItems as HoldQueueItemRow[],
    });
  }),

  /**
   * Per-rule overturn / waiver rates from resolved findings.
   */
  getOverturnAnalytics: protectedProcedure
    .input(periodInput)
    .query(async ({ input }) => {
      const period = resolveExceptionPeriod(input?.startDate, input?.endDate);
      const findings = await db.getExceptionOverturnFindings({
        startDate: new Date(period.start),
        endDate: new Date(period.end),
      });
      return buildOverturnAnalytics({
        findings: findings as OverturnFindingRow[],
        startDate: period.start,
        endDate: period.end,
      });
    }),

  /**
   * Recurring rule+site clusters in the period.
   */
  getRecurrence: protectedProcedure
    .input(
      z
        .object({
          startDate: z.string().optional(),
          endDate: z.string().optional(),
          threshold: z.number().min(2).max(50).optional(),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const period = resolveExceptionPeriod(input?.startDate, input?.endDate);
      const findings = await db.getExceptionOverturnFindings({
        startDate: new Date(period.start),
        endDate: new Date(period.end),
      });
      return buildRecurrenceSummary({
        findings: findings as OverturnFindingRow[],
        startDate: period.start,
        endDate: period.end,
        threshold: input?.threshold,
      });
    }),

  /**
   * Combined exception management dashboard payload.
   */
  getExceptionSummary: protectedProcedure
    .input(periodInput)
    .query(async ({ input }) => {
      const loaded = await loadExceptionAnalyticsInputs(input);
      return buildExceptionManagementSummary({
        holdItems: loaded.holdItems,
        findings: loaded.findings,
        startDate: loaded.period.start,
        endDate: loaded.period.end,
      });
    }),

  /**
   * DLQ status + light retry pass (no live OCR/LLM). Rate-limited.
   */
  getDlqStatus: adminProcedure.query(() => {
    const stats = getDLQStats();
    return {
      ...stats,
      oldestJob: stats.oldestJob?.toISOString() ?? null,
      recoverableJobs: getRecoverableJobs().map(j => ({
        id: j.id,
        jobSheetId: j.jobSheetId,
        stage: j.stage,
        attempts: j.attempts,
        maxAttempts: j.maxAttempts,
        errorMessage: j.error.message,
        createdAt: j.createdAt.toISOString(),
      })),
    };
  }),

  runDlqRetry: adminProcedure
    .input(
      z
        .object({
          limit: z.number().min(1).max(100).optional(),
        })
        .optional()
    )
    .mutation(async ({ ctx, input }) => {
      throwIfRateLimited(() =>
        enforceRateLimit(`user:${ctx.user.id}:review`, RATE_LIMITS.review)
      );
      return runDlqRetryPass({ limit: input?.limit });
    }),

  // ============ PR-18: DRIFT DETECTION ============

  /**
   * EWMA/CUSUM defect-rate drift + calibration histograms + alerts.
   */
  getDriftSummary: protectedProcedure
    .input(periodInput)
    .query(async ({ input }) => {
      const loaded = await loadDriftAnalyticsInputs(input);
      return buildDriftAnalyticsSummary({
        documents: loaded.documents,
        findings: loaded.findings,
        startDate: loaded.period.start,
        endDate: loaded.period.end,
      });
    }),

  /**
   * Active drift alerts only (sorted by severity).
   */
  getDriftAlerts: protectedProcedure
    .input(periodInput)
    .query(async ({ input }) => {
      const loaded = await loadDriftAnalyticsInputs(input);
      const summary = buildDriftAnalyticsSummary({
        documents: loaded.documents,
        findings: loaded.findings,
        startDate: loaded.period.start,
        endDate: loaded.period.end,
      });
      return {
        period: summary.period,
        asOf: summary.asOf,
        alerts: summary.alerts,
        summary: summary.summary,
      };
    }),

  // ============ PR-19: PREDICTIVE RISK ============

  /**
   * Leading-indicator risk scores, attention queue, and fix packs.
   */
  getPredictiveRiskSummary: protectedProcedure
    .input(periodInput)
    .query(async ({ input }) => {
      const loaded = await loadPredictiveRiskInputs(input);
      return buildPredictiveRiskSummary({
        documents: loaded.documents,
        findings: loaded.findings,
        disputes: loaded.disputes,
        users: loaded.users,
        startDate: loaded.period.start,
        endDate: loaded.period.end,
      });
    }),

  /**
   * Attention queue only (entities above risk threshold), sorted by score.
   */
  getAttentionQueue: protectedProcedure
    .input(periodInput)
    .query(async ({ input }) => {
      const loaded = await loadPredictiveRiskInputs(input);
      const summary = buildPredictiveRiskSummary({
        documents: loaded.documents,
        findings: loaded.findings,
        disputes: loaded.disputes,
        users: loaded.users,
        startDate: loaded.period.start,
        endDate: loaded.period.end,
      });
      return {
        period: summary.period,
        asOf: summary.asOf,
        attentionQueue: summary.attentionQueue,
        summary: summary.summary,
      };
    }),

  /**
   * Fix packs for engineers in the attention queue.
   */
  getPredictiveFixPacks: protectedProcedure
    .input(periodInput)
    .query(async ({ input }) => {
      const loaded = await loadPredictiveRiskInputs(input);
      const summary = buildPredictiveRiskSummary({
        documents: loaded.documents,
        findings: loaded.findings,
        disputes: loaded.disputes,
        users: loaded.users,
        startDate: loaded.period.start,
        endDate: loaded.period.end,
      });
      return {
        period: summary.period,
        asOf: summary.asOf,
        fixPacks: summary.fixPacks,
        count: summary.fixPacks.length,
      };
    }),

  // ============ PR-21: SHADOW / CHAMPION-CHALLENGER ============

  /**
   * Shadow comparison disagreement report + feature-flag status.
   */
  getShadowChallengerSummary: protectedProcedure
    .input(periodInput)
    .query(async ({ input }) => {
      const loaded = await loadShadowChallengerInputs(input);
      const summary = buildShadowChallengerSummary({
        reportJsons: loaded.reportJsons,
      });
      return {
        ...summary,
        period: loaded.period,
      };
    }),

  /**
   * Disagreement-only slice for weekly review.
   */
  getShadowDisagreements: protectedProcedure
    .input(periodInput)
    .query(async ({ input }) => {
      const loaded = await loadShadowChallengerInputs(input);
      const summary = buildShadowChallengerSummary({
        reportJsons: loaded.reportJsons,
      });
      return {
        period: loaded.period,
        asOf: summary.asOf,
        enabled: summary.enabled,
        mode: summary.mode,
        disagreementRate: summary.report.disagreementRate,
        resultDisagreementRate: summary.report.resultDisagreementRate,
        topFieldDisagreements: summary.report.topFieldDisagreements,
        recentDisagreements: summary.report.recentDisagreements,
        byOutcomePair: summary.report.byOutcomePair,
      };
    }),

  /**
   * Current shadow/canary feature-flag config (no secrets).
   */
  getShadowChallengerConfig: protectedProcedure.query(() => {
    return getShadowChallengerConfig();
  }),
});

export type AnalyticsRouter = typeof analyticsRouter;
