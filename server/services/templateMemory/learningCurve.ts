/**
 * Wave-7 P3: learning-curve metrics by template cohort (first 100–200 audits).
 */

import { and, asc, eq, isNotNull, sql } from "drizzle-orm";
import {
  auditResults,
  reviewCorrections,
  templateMemoryCandidates,
} from "../../../drizzle/schema";
import { getDb } from "../../db";

export type CohortBucket = "1-50" | "51-100" | "101-200" | "201+";

export function cohortForIndex(oneBasedIndex: number): CohortBucket {
  if (oneBasedIndex <= 50) return "1-50";
  if (oneBasedIndex <= 100) return "51-100";
  if (oneBasedIndex <= 200) return "101-200";
  return "201+";
}

export interface TemplateLearningCurve {
  templateId: number;
  totalAudits: number;
  memoryFunnel: {
    collecting: number;
    candidate: number;
    shadow: number;
    approved: number;
    rejected: number;
  };
  pctAuditsWithMemoryApplied: number;
  cohorts: Record<
    CohortBucket,
    {
      audits: number;
      correctionEvents: number;
      memoryAppliedAudits: number;
      fieldCorrectionRate: number;
    }
  >;
}

/**
 * Compute per-template learning curve from audit_results + review_corrections.
 * memoryApplied counted from reportJson.memoryAppliedCount when present.
 */
export async function computeTemplateLearningCurve(
  templateId: number
): Promise<TemplateLearningCurve | null> {
  const db = await getDb();
  if (!db) return null;

  const audits = await db
    .select({
      id: auditResults.id,
      createdAt: auditResults.createdAt,
      reportJson: auditResults.reportJson,
    })
    .from(auditResults)
    .where(eq(auditResults.templateId, templateId))
    .orderBy(asc(auditResults.createdAt));

  const empty = (): TemplateLearningCurve["cohorts"][CohortBucket] => ({
    audits: 0,
    correctionEvents: 0,
    memoryAppliedAudits: 0,
    fieldCorrectionRate: 0,
  });

  const cohorts: TemplateLearningCurve["cohorts"] = {
    "1-50": empty(),
    "51-100": empty(),
    "101-200": empty(),
    "201+": empty(),
  };

  const auditIdToCohort = new Map<number, CohortBucket>();
  audits.forEach((a, i) => {
    const bucket = cohortForIndex(i + 1);
    auditIdToCohort.set(a.id, bucket);
    cohorts[bucket].audits += 1;
    const report = a.reportJson as { memoryAppliedCount?: number } | null;
    if (report && Number(report.memoryAppliedCount ?? 0) > 0) {
      cohorts[bucket].memoryAppliedAudits += 1;
    }
  });

  if (audits.length > 0) {
    const corrections = await db
      .select({
        auditResultId: reviewCorrections.auditResultId,
        correctionType: reviewCorrections.correctionType,
      })
      .from(reviewCorrections)
      .where(
        and(
          eq(reviewCorrections.templateId, templateId),
          sql`${reviewCorrections.undoneAt} IS NULL`
        )
      );

    for (const c of corrections) {
      const bucket = auditIdToCohort.get(c.auditResultId);
      if (!bucket) continue;
      cohorts[bucket].correctionEvents += 1;
    }
  }

  for (const bucket of Object.keys(cohorts) as CohortBucket[]) {
    const c = cohorts[bucket];
    c.fieldCorrectionRate = c.audits > 0 ? c.correctionEvents / c.audits : 0;
  }

  const memoryRows = await db
    .select({
      promotionStatus: templateMemoryCandidates.promotionStatus,
    })
    .from(templateMemoryCandidates)
    .where(eq(templateMemoryCandidates.templateId, templateId));

  const memoryFunnel = {
    collecting: 0,
    candidate: 0,
    shadow: 0,
    approved: 0,
    rejected: 0,
  };
  for (const row of memoryRows) {
    const s = row.promotionStatus;
    if (s === "collecting") memoryFunnel.collecting += 1;
    else if (s === "candidate") memoryFunnel.candidate += 1;
    else if (s === "shadow") memoryFunnel.shadow += 1;
    else if (s === "approved") memoryFunnel.approved += 1;
    else if (s === "rejected") memoryFunnel.rejected += 1;
  }

  const memoryAppliedAuditsTotal = Object.values(cohorts).reduce(
    (sum, c) => sum + c.memoryAppliedAudits,
    0
  );

  return {
    templateId,
    totalAudits: audits.length,
    memoryFunnel,
    pctAuditsWithMemoryApplied:
      audits.length > 0 ? memoryAppliedAuditsTotal / audits.length : 0,
    cohorts,
  };
}

export async function listTemplatesWithLineage(limit = 50): Promise<number[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .selectDistinct({ templateId: auditResults.templateId })
    .from(auditResults)
    .where(isNotNull(auditResults.templateId))
    .limit(limit);
  return rows
    .map(r => r.templateId)
    .filter((id): id is number => typeof id === "number");
}
