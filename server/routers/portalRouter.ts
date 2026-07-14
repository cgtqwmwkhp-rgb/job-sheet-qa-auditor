/**
 * Technician portal — scorecard + defects for the signed-in technician.
 * Reuses engineer-analytics aggregation (same source as staff scorecards).
 */

import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";
import { buildEngineerScoreCardDetail } from "../services/engineerAnalytics/aggregateFromDb";
import type { RawFindingRow } from "../services/engineerAnalytics/mapFindings";
import { formatDistanceToNow } from "date-fns";

const MONTHLY_TARGET = 95;

function priorWindowStart(startIso: string, endIso: string): Date {
  const startMs = new Date(startIso).getTime();
  const endMs = new Date(endIso).getTime();
  const duration = Math.max(endMs - startMs, 24 * 60 * 60 * 1000);
  return new Date(startMs - duration);
}

function resolvePeriod(startDate?: string, endDate?: string) {
  const end = endDate ? new Date(endDate) : new Date();
  const start = startDate
    ? new Date(startDate)
    : new Date(end.getFullYear(), end.getMonth(), 1);
  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

function severityLabel(severity: string): "Critical" | "Warning" | "Minor" {
  if (severity === "S0" || severity === "S1") return "Critical";
  if (severity === "S2") return "Warning";
  return "Minor";
}

function humanizeFieldFinding(fieldName: string, reasonCode: string): string {
  const field = fieldName?.trim() || "Field";
  const pretty = field
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase());
  switch (reasonCode) {
    case "MISSING_FIELD":
      return `Missing ${pretty}`;
    case "UNREADABLE_FIELD":
      return `Unreadable ${pretty}`;
    case "LOW_CONFIDENCE":
      return `Low confidence: ${pretty}`;
    case "INVALID_FORMAT":
      return `Invalid format: ${pretty}`;
    case "INCOMPLETE_EVIDENCE":
      return `Incomplete evidence: ${pretty}`;
    default:
      return `${reasonCode.replace(/_/g, " ")} — ${pretty}`;
  }
}

async function loadTechnicianAnalytics(technicianId: number) {
  const period = resolvePeriod();
  const fetchStart = priorWindowStart(period.start, period.end);
  const fetchEnd = new Date(period.end);

  const [users, documents, findings] = await Promise.all([
    db.getAllUsers(),
    db.getEngineerAnalyticsDocuments({
      startDate: fetchStart,
      endDate: fetchEnd,
      technicianId,
    }),
    db.getEngineerAnalyticsFindings({
      startDate: fetchStart,
      endDate: fetchEnd,
      technicianId,
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

export const portalRouter = router({
  /**
   * Signed-in technician dashboard: scorecard, recent audits, open defects.
   * Always scoped to ctx.user.id — no engineerId input (prevents cross-tech reads).
   */
  myDashboard: protectedProcedure.query(async ({ ctx }) => {
    const technicianId = ctx.user.id;
    const engineerId = String(technicianId);
    const loaded = await loadTechnicianAnalytics(technicianId);

    const detail = buildEngineerScoreCardDetail({
      users: loaded.users,
      documents: loaded.documents,
      findings: loaded.findings,
      engineerId,
      startDate: loaded.period.start,
      endDate: loaded.period.end,
    });

    const scoreCard = detail.scoreCard;
    const passedAudits = loaded.documents.filter(
      d => d.technicianId === technicianId && d.result === "pass"
    ).length;
    const defectCount = detail.drilldown.length;

    const recentAudits = loaded.documents
      .filter(d => d.technicianId === technicianId)
      .sort(
        (a, b) =>
          new Date(b.processedAt).getTime() - new Date(a.processedAt).getTime()
      )
      .slice(0, 10)
      .map(d => ({
        jobSheetId: d.jobSheetId,
        referenceNumber: d.referenceNumber,
        siteInfo: d.siteInfo,
        result: d.result,
        processedAt: d.processedAt,
        relativeTime: formatDistanceToNow(new Date(d.processedAt), {
          addSuffix: true,
        }),
      }));

    const openDefects = detail.drilldown
      .filter(d => d.resolutionStatus === "open")
      .slice(0, 20)
      .map(d => ({
        findingId: d.findingId,
        jobSheetId: d.jobSheetId,
        severity: d.severity,
        severityLabel: severityLabel(d.severity),
        reasonCode: d.reasonCode,
        fieldName: d.fieldName,
        title: humanizeFieldFinding(d.fieldName, d.reasonCode),
        occurredAt: d.occurredAt,
        relativeTime: formatDistanceToNow(new Date(d.occurredAt), {
          addSuffix: true,
        }),
      }));

    return {
      scorecard: scoreCard
        ? {
            overallScore: scoreCard.overallScore,
            trend: scoreCard.trend,
            documentsProcessed: scoreCard.documentsProcessed,
            documentsWithIssues: scoreCard.documentsWithIssues,
            issueRate: scoreCard.issueRate,
            percentile: scoreCard.peerComparison.percentile,
            monthlyTarget: MONTHLY_TARGET,
            deltaToTarget: Number(
              (scoreCard.overallScore - MONTHLY_TARGET).toFixed(1)
            ),
          }
        : {
            overallScore: 0,
            trend: "stable" as const,
            documentsProcessed: 0,
            documentsWithIssues: 0,
            issueRate: 0,
            percentile: 0,
            monthlyTarget: MONTHLY_TARGET,
            deltaToTarget: -MONTHLY_TARGET,
          },
      stats: {
        passedAudits,
        defectsFound: defectCount,
      },
      recentAudits,
      defects: openDefects,
    };
  }),

  /**
   * Fresh file URL for a job sheet attributed to the signed-in technician.
   */
  evidenceUrl: protectedProcedure
    .input(z.object({ jobSheetId: z.number() }))
    .query(async ({ ctx, input }) => {
      const jobSheet = await db.getJobSheetById(input.jobSheetId);
      const { enforceJobSheetAccess } = await import("../utils/authorization");
      enforceJobSheetAccess(jobSheet, ctx.user);

      if (jobSheet?.fileKey) {
        const { getStorageAdapter } = await import("../storage");
        const storage = getStorageAdapter();
        const { url } = await storage.get(jobSheet.fileKey);
        return {
          url,
          fileName: jobSheet.fileName,
          fileType: jobSheet.fileType,
        };
      }

      return {
        url: jobSheet?.fileUrl ?? null,
        fileName: jobSheet?.fileName ?? null,
        fileType: jobSheet?.fileType ?? null,
      };
    }),
});

export type PortalRouter = typeof portalRouter;
