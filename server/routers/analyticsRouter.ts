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
import {
  adminProcedure,
  qaLeadProcedure,
  router,
  staffProcedure,
} from "../_core/trpc";
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
import {
  buildEngineerCoachingPack,
  enrichCoachingNarrativeWithLlm,
  getCoachingSession,
  markCoachingSessionCompleted,
} from "../services/engineerAnalytics";
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
  buildEvidenceRoiAnalytics,
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
import {
  computeOverturnMetrics,
  isOverturnMetricsEnabled,
  type AuditActionLogEntry,
} from "../services/overturnMetrics";

const periodInput = z
  .object({
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    site: z.string().optional(),
  })
  .optional();

type AnalyticsPeriodInput = {
  startDate?: string;
  endDate?: string;
  site?: string;
};

function normalizeSite(site?: string): string | undefined {
  const trimmed = site?.trim();
  return trimmed ? trimmed : undefined;
}

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
  site?: string;
}) {
  const period = resolvePeriod(input?.startDate, input?.endDate);
  const fetchStart = priorWindowStart(period.start, period.end);
  const fetchEnd = new Date(period.end);
  const site = normalizeSite(input?.site);

  const [users, documents, findings] = await Promise.all([
    db.getAllUsers(),
    db.getEngineerAnalyticsDocuments({
      startDate: fetchStart,
      endDate: fetchEnd,
      technicianId: input?.technicianId,
      site,
    }),
    db.getEngineerAnalyticsFindings({
      startDate: fetchStart,
      endDate: fetchEnd,
      technicianId: input?.technicianId,
      site,
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

async function loadCohortAnalyticsInputs(input?: AnalyticsPeriodInput) {
  const period = resolveCohortPeriod(input?.startDate, input?.endDate);
  const fetchStart = new Date(period.start);
  const fetchEnd = new Date(period.end);
  const site = normalizeSite(input?.site);

  const [documents, findings] = await Promise.all([
    db.getCohortAnalyticsDocuments({
      startDate: fetchStart,
      endDate: fetchEnd,
      site,
    }),
    db.getCohortAnalyticsFindings({
      startDate: fetchStart,
      endDate: fetchEnd,
      site,
    }),
  ]);

  return {
    period,
    documents: documents as CohortDocumentRow[],
    findings: findings as CohortFindingRow[],
  };
}

async function loadExceptionAnalyticsInputs(input?: AnalyticsPeriodInput) {
  const period = resolveExceptionPeriod(input?.startDate, input?.endDate);
  const site = normalizeSite(input?.site);
  const [holdItems, findings] = await Promise.all([
    db.getExceptionHoldQueueItems({ site }),
    db.getExceptionOverturnFindings({
      startDate: new Date(period.start),
      endDate: new Date(period.end),
      site,
    }),
  ]);

  return {
    period,
    holdItems: holdItems as HoldQueueItemRow[],
    findings: findings as OverturnFindingRow[],
  };
}

async function loadDriftAnalyticsInputs(input?: AnalyticsPeriodInput) {
  const period = resolveDriftPeriod(input?.startDate, input?.endDate);
  const site = normalizeSite(input?.site);
  const [documents, findings] = await Promise.all([
    db.getDriftAnalyticsDocuments({
      startDate: new Date(period.start),
      endDate: new Date(period.end),
      site,
    }),
    db.getDriftAnalyticsFindings({
      startDate: new Date(period.start),
      endDate: new Date(period.end),
      site,
    }),
  ]);

  return {
    period,
    documents: documents as DriftDocumentRow[],
    findings: findings as DriftFindingRow[],
  };
}

async function loadPredictiveRiskInputs(input?: AnalyticsPeriodInput) {
  const period = resolvePredictivePeriod(input?.startDate, input?.endDate);
  const site = normalizeSite(input?.site);
  const [documents, findings, disputes, users] = await Promise.all([
    db.getPredictiveRiskDocuments({
      startDate: new Date(period.start),
      endDate: new Date(period.end),
      site,
    }),
    db.getPredictiveRiskFindings({
      startDate: new Date(period.start),
      endDate: new Date(period.end),
      site,
    }),
    db.getPredictiveRiskDisputes({
      startDate: new Date(period.start),
      endDate: new Date(period.end),
      site,
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

async function loadShadowChallengerInputs(input?: AnalyticsPeriodInput) {
  const period = resolveShadowPeriod(input);
  const reportJsons = await db.getShadowComparisonReportJsons({
    startDate: new Date(period.start),
    endDate: new Date(period.end),
    site: normalizeSite(input?.site),
  });
  return { period, reportJsons };
}

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

  /**
   * Period-scoped executive KPIs (Phase 1.6).
   * reviewQueue is a live hold-queue snapshot and is intentionally not
   * filtered by startDate/endDate — document that in UI copy if needed.
   */
  getExecutiveSummary: staffProcedure
    .input(periodInput)
    .query(async ({ input }) => {
      const period = resolvePeriod(input?.startDate, input?.endDate);
      const stats = await db.getExecutiveSummaryStats({
        startDate: new Date(period.start),
        endDate: new Date(period.end),
        site: normalizeSite(input?.site),
      });
      if (!stats) {
        return {
          totalAudits: 0,
          passRate: "0",
          criticalIssues: 0,
          reviewQueue: 0,
          period,
        };
      }
      return stats;
    }),

  // ============ PR-15: ENGINEER ANALYTICS ============

  /**
   * Leaderboard + team trends from technician-attributed job sheets / findings.
   */
  getEngineerSummary: staffProcedure
    .input(periodInput)
    .query(async ({ input }) => {
      const loaded = await loadEngineerAnalyticsInputs(input);
      const summary = buildEngineerAnalyticsSummary({
        users: loaded.users,
        documents: loaded.documents,
        findings: loaded.findings,
        startDate: loaded.period.start,
        endDate: loaded.period.end,
      });
      const unattributed = await db.getUnattributedJobSheets({
        startDate: new Date(loaded.period.start),
        endDate: new Date(loaded.period.end),
        limit: 500,
      });
      return {
        ...summary,
        unattributedCount: unattributed.length,
      };
    }),

  /**
   * Single engineer scorecard + fix pack + finding drill-through rows.
   */
  getEngineerScoreCard: staffProcedure
    .input(
      z.object({
        engineerId: z.string().min(1),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        site: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const technicianId = Number(input.engineerId);
      const loaded = await loadEngineerAnalyticsInputs({
        startDate: input.startDate,
        endDate: input.endDate,
        technicianId: Number.isFinite(technicianId) ? technicianId : undefined,
        site: input.site,
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

  /**
   * Period-scoped analytical coaching pack for QA Lead 1:1s.
   * Round 1: evidence dossier from findings + reportJson.
   * Round 2: optional LLM critic grounded only in that dossier.
   */
  getEngineerCoachingPack: staffProcedure
    .input(
      z.object({
        engineerId: z.string().min(1),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        site: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const technicianId = Number(input.engineerId);
      const loaded = await loadEngineerAnalyticsInputs({
        startDate: input.startDate,
        endDate: input.endDate,
        technicianId: Number.isFinite(technicianId) ? technicianId : undefined,
        site: input.site,
      });

      const periodDocIds = loaded.documents
        .filter(d => {
          if (
            Number.isFinite(technicianId) &&
            d.technicianId !== technicianId
          ) {
            return false;
          }
          const iso =
            d.processedAt instanceof Date
              ? d.processedAt.toISOString()
              : new Date(d.processedAt).toISOString();
          return iso >= loaded.period.start && iso <= loaded.period.end;
        })
        .map(d => d.jobSheetId);

      const reportsByJobSheetId =
        await db.getLatestAuditReportJsonsForJobSheets(periodDocIds);

      let pack = buildEngineerCoachingPack({
        users: loaded.users,
        documents: loaded.documents,
        findings: loaded.findings,
        engineerId: input.engineerId,
        startDate: loaded.period.start,
        endDate: loaded.period.end,
        reportsByJobSheetId,
      });
      if (!pack) {
        return { pack: null, session: null };
      }

      try {
        const orgPersona = await db.getAiPersona();
        const enrichedNarrative = await enrichCoachingNarrativeWithLlm({
          draft: pack.draftNarrative,
          dossier: pack.evidenceDossier,
          persona: orgPersona,
        });
        pack = {
          ...pack,
          draftNarrative: enrichedNarrative,
          strengths: enrichedNarrative.strengths,
          coachingAsks: enrichedNarrative.coachingAsks,
        };
      } catch (error) {
        console.warn(
          "[analytics.getEngineerCoachingPack] LLM enrichment failed (non-fatal):",
          error
        );
      }

      const session = getCoachingSession({
        engineerId: input.engineerId,
        periodStart: pack.period.start,
        periodEnd: pack.period.end,
      });
      return { pack, session };
    }),

  /**
   * QA Lead marks a coaching session completed (stores note + narrative snapshot).
   */
  markCoachingCompleted: qaLeadProcedure
    .input(
      z.object({
        engineerId: z.string().min(1),
        engineerName: z.string().min(1),
        periodStart: z.string().min(1),
        periodEnd: z.string().min(1),
        qaLeadNote: z.string().max(4000).default(""),
        narrativeOpening: z.string().max(4000),
        coachingAsks: z.array(z.string().max(500)).max(10),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const session = markCoachingSessionCompleted({
        engineerId: input.engineerId,
        engineerName: input.engineerName,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        qaLeadUserId: ctx.user.id,
        qaLeadNote: input.qaLeadNote,
        narrativeOpening: input.narrativeOpening,
        coachingAsks: input.coachingAsks,
      });
      return { session };
    }),

  // ============ PR-16: COHORT ANALYTICS + COLLISION GOVERNANCE ============

  /**
   * Cohort summary by site / assetType / workType from DB-backed audits.
   */
  getCohortSummary: staffProcedure
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
  getCohortDrilldown: staffProcedure
    .input(
      z.object({
        dimension: z.enum(["site", "assetType", "workType"]),
        key: z.string().min(1),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        site: z.string().optional(),
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
  getHoldQueueSla: staffProcedure.query(async () => {
    const holdItems = await db.getExceptionHoldQueueItems();
    return buildHoldQueueSlaSummary({
      items: holdItems as HoldQueueItemRow[],
    });
  }),

  /**
   * Per-rule overturn / waiver rates from resolved findings.
   */
  getOverturnAnalytics: staffProcedure
    .input(periodInput)
    .query(async ({ input }) => {
      const period = resolveExceptionPeriod(input?.startDate, input?.endDate);
      const findings = await db.getExceptionOverturnFindings({
        startDate: new Date(period.start),
        endDate: new Date(period.end),
        site: normalizeSite(input?.site),
      });
      return buildOverturnAnalytics({
        findings: findings as OverturnFindingRow[],
        startDate: period.start,
        endDate: period.end,
      });
    }),

  /**
   * Overturn metrics summary from audit action logs (scaffold #248).
   * Gated by FEATURE_OVERTURN_METRICS env var.
   */
  getOverturnMetricsSummary: staffProcedure
    .input(periodInput)
    .query(async ({ input }) => {
      if (!isOverturnMetricsEnabled()) {
        return { enabled: false as const };
      }
      const period = resolveExceptionPeriod(input?.startDate, input?.endDate);
      const rows = await db.getOverturnMetricsActionLogs({
        startDate: new Date(period.start),
        endDate: new Date(period.end),
      });

      const entries: AuditActionLogEntry[] = rows.map(r => ({
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId ?? 0,
        userId: r.userId ?? 0,
        timestamp: r.createdAt.toISOString(),
        details: (r.details as Record<string, unknown>) ?? {},
      }));

      const summary = computeOverturnMetrics(entries);
      return { enabled: true as const, period, ...summary };
    }),

  /**
   * Recurring rule+site clusters in the period.
   */
  getRecurrence: staffProcedure
    .input(
      z
        .object({
          startDate: z.string().optional(),
          endDate: z.string().optional(),
          site: z.string().optional(),
          threshold: z.number().min(2).max(50).optional(),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const period = resolveExceptionPeriod(input?.startDate, input?.endDate);
      const findings = await db.getExceptionOverturnFindings({
        startDate: new Date(period.start),
        endDate: new Date(period.end),
        site: normalizeSite(input?.site),
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
  getExceptionSummary: staffProcedure
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
   * Evidence ROI — COMMENT/PHOTO/EVIDENCE fail rates (money-saving dashboard).
   */
  getEvidenceRoi: staffProcedure.input(periodInput).query(async ({ input }) => {
    const loaded = await loadExceptionAnalyticsInputs(input);
    const engineerByFindingId: Record<number, string> = {};
    for (const f of loaded.findings) {
      if (f.technicianId != null) {
        engineerByFindingId[f.findingId] = String(f.technicianId);
      }
    }
    return buildEvidenceRoiAnalytics({
      findings: loaded.findings,
      startDate: loaded.period.start,
      endDate: loaded.period.end,
      engineerByFindingId,
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
      await throwIfRateLimited(() =>
        enforceRateLimit(`user:${ctx.user.id}:review`, RATE_LIMITS.review)
      );
      return runDlqRetryPass({ limit: input?.limit });
    }),

  // ============ PR-18: DRIFT DETECTION ============

  /**
   * EWMA/CUSUM defect-rate drift + calibration histograms + alerts.
   */
  getDriftSummary: staffProcedure
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
  getDriftAlerts: staffProcedure.input(periodInput).query(async ({ input }) => {
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
  getPredictiveRiskSummary: staffProcedure
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
  getAttentionQueue: staffProcedure
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
  getPredictiveFixPacks: staffProcedure
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
  getShadowChallengerSummary: staffProcedure
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
  getShadowDisagreements: staffProcedure
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
  getShadowChallengerConfig: staffProcedure.query(() => {
    return getShadowChallengerConfig();
  }),

  /**
   * Wave-7: learning curve by template (audit cohorts 1–50 / 51–100 / 101–200).
   */
  getTemplateLearningCurve: staffProcedure
    .input(z.object({ templateId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const { computeTemplateLearningCurve } = await import(
        "../services/templateMemory/learningCurve"
      );
      const curve = await computeTemplateLearningCurve(input.templateId);
      if (!curve) {
        return { enabled: false as const, templateId: input.templateId };
      }
      return { enabled: true as const, ...curve };
    }),
});

export type AnalyticsRouter = typeof analyticsRouter;
