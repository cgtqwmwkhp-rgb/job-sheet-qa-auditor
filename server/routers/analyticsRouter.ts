/**
 * Analytics Router
 * 
 * PR-I: API endpoints for selection analytics and ops dashboard.
 * Admin/QA Lead only access for sensitive selection data.
 */

import { z } from 'zod';
import { protectedProcedure, adminProcedure, router } from '../_core/trpc';
import {
  getSelectionAnalytics,
  getAmbiguousTemplatePairs,
  getTokenCollisions,
  getTemplateAnalyticsSummary,
  checkAmbiguityAlert,
  getSelectionRecords,
} from '../services/selectionAnalytics';

/**
 * Analytics Router
 */
export const analyticsRouter = router({
  /**
   * Get overall selection analytics
   */
  getOverview: adminProcedure
    .input(z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }).optional())
    .query(({ input }) => {
      const startDate = input?.startDate ? new Date(input.startDate) : undefined;
      const endDate = input?.endDate ? new Date(input.endDate) : undefined;
      return getSelectionAnalytics(startDate, endDate);
    }),

  /**
   * Get confidence distribution
   */
  getConfidenceDistribution: adminProcedure
    .query(() => {
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
    .input(z.object({
      limit: z.number().min(1).max(50).optional(),
    }).optional())
    .query(({ input }) => {
      return getAmbiguousTemplatePairs(input?.limit ?? 10);
    }),

  /**
   * Get tokens causing collisions
   */
  getTokenCollisions: adminProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).optional(),
    }).optional())
    .query(({ input }) => {
      return getTokenCollisions(input?.limit ?? 20);
    }),

  /**
   * Get per-template analytics
   */
  getTemplateStats: adminProcedure
    .query(() => {
      return getTemplateAnalyticsSummary();
    }),

  /**
   * Check ambiguity alert status
   */
  checkAmbiguityAlert: adminProcedure
    .input(z.object({
      thresholdPercent: z.number().min(0).max(100).optional(),
    }).optional())
    .query(({ input }) => {
      return checkAmbiguityAlert(input?.thresholdPercent ?? 15);
    }),

  /**
   * Get selection records with filtering
   */
  getRecords: adminProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).optional(),
      offset: z.number().min(0).optional(),
      templateSlug: z.string().optional(),
      confidenceBand: z.enum(['HIGH', 'MEDIUM', 'LOW']).optional(),
      onlyAmbiguous: z.boolean().optional(),
    }).optional())
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
  getDashboardSummary: adminProcedure
    .query(() => {
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
});

export type AnalyticsRouter = typeof analyticsRouter;
