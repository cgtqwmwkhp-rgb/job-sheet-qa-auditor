/**
 * Analytics Router
 *
 * PR-I: selection analytics / ops dashboard.
 * PR-15: engineer scorecards, trends, and drill-through.
 */

import { z } from "zod";
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
});

export type AnalyticsRouter = typeof analyticsRouter;
