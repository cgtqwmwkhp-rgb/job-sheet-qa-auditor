/**
 * Cohort Analytics — aggregate audit quality by site / assetType / workType.
 *
 * PR-16: Pure aggregation over DB-shaped rows (fixtures in contract tests).
 * Dimensions come from jobSheets.siteInfo and template metadata joined via
 * selection / goldSpec when available; unknown buckets are labelled explicitly.
 */

export type CohortDimension = "site" | "assetType" | "workType";

export interface CohortDocumentRow {
  jobSheetId: number;
  siteInfo: string | null;
  assetType: string | null;
  workType: string | null;
  templateSlug: string | null;
  result: "pass" | "fail" | "review_queue" | "waived";
  confidenceScore: number | null;
  processedAt: Date | string;
}

export interface CohortFindingRow {
  findingId: number;
  jobSheetId: number;
  severity: "S0" | "S1" | "S2" | "S3";
  reasonCode: string;
  fieldName: string;
  occurredAt: Date | string;
}

export interface CohortBucketMetrics {
  key: string;
  label: string;
  documentCount: number;
  passCount: number;
  failCount: number;
  reviewCount: number;
  passRate: number;
  issueCount: number;
  criticalIssueCount: number;
  issueRate: number;
  avgConfidence: number | null;
  topIssueTypes: Array<{ reasonCode: string; count: number }>;
  drilldownJobSheetIds: number[];
}

export interface CohortDimensionSummary {
  dimension: CohortDimension;
  buckets: CohortBucketMetrics[];
  totalDocuments: number;
  totalIssues: number;
}

export interface CohortAnalyticsSummary {
  period: { start: string; end: string };
  bySite: CohortDimensionSummary;
  byAssetType: CohortDimensionSummary;
  byWorkType: CohortDimensionSummary;
  totals: {
    documentCount: number;
    issueCount: number;
    criticalIssueCount: number;
    passRate: number;
  };
}

export interface CohortDrilldownItem {
  jobSheetId: number;
  findingId: number;
  severity: string;
  reasonCode: string;
  fieldName: string;
  occurredAt: string;
  site: string;
  assetType: string;
  workType: string;
}

const UNKNOWN = "Unknown";

function toIso(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toISOString();
}

function defaultPeriod(): { start: string; end: string } {
  const end = new Date();
  const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function resolveCohortPeriod(
  startDate?: string,
  endDate?: string
): { start: string; end: string } {
  const fallback = defaultPeriod();
  return {
    start: startDate ? new Date(startDate).toISOString() : fallback.start,
    end: endDate ? new Date(endDate).toISOString() : fallback.end,
  };
}

export function normalizeCohortKey(
  value: string | null | undefined,
  fallback: string = UNKNOWN
): string {
  if (value == null) return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function inPeriod(value: Date | string, start: string, end: string): boolean {
  const t = new Date(value).getTime();
  return t >= new Date(start).getTime() && t <= new Date(end).getTime();
}

function dimensionValue(
  doc: CohortDocumentRow,
  dimension: CohortDimension
): string {
  switch (dimension) {
    case "site":
      return normalizeCohortKey(doc.siteInfo);
    case "assetType":
      return normalizeCohortKey(doc.assetType);
    case "workType":
      return normalizeCohortKey(doc.workType);
  }
}

function buildBucket(
  key: string,
  docs: CohortDocumentRow[],
  findingsByJob: Map<number, CohortFindingRow[]>
): CohortBucketMetrics {
  let passCount = 0;
  let failCount = 0;
  let reviewCount = 0;
  let confidenceSum = 0;
  let confidenceN = 0;
  let issueCount = 0;
  let criticalIssueCount = 0;
  const reasonCounts = new Map<string, number>();
  const drilldownJobSheetIds: number[] = [];

  for (const doc of docs) {
    if (doc.result === "pass" || doc.result === "waived") passCount++;
    else if (doc.result === "fail") failCount++;
    else reviewCount++;

    if (doc.confidenceScore != null && Number.isFinite(doc.confidenceScore)) {
      confidenceSum += doc.confidenceScore;
      confidenceN++;
    }

    drilldownJobSheetIds.push(doc.jobSheetId);
    const findings = findingsByJob.get(doc.jobSheetId) ?? [];
    issueCount += findings.length;
    for (const f of findings) {
      if (f.severity === "S0" || f.severity === "S1") criticalIssueCount++;
      reasonCounts.set(f.reasonCode, (reasonCounts.get(f.reasonCode) ?? 0) + 1);
    }
  }

  const documentCount = docs.length;
  const passRate =
    documentCount > 0
      ? Math.round((passCount / documentCount) * 1000) / 1000
      : 0;
  const issueRate =
    documentCount > 0
      ? Math.round((issueCount / documentCount) * 1000) / 1000
      : 0;

  const topIssueTypes = Array.from(reasonCounts.entries())
    .map(([reasonCode, count]) => ({ reasonCode, count }))
    .sort(
      (a, b) => b.count - a.count || a.reasonCode.localeCompare(b.reasonCode)
    )
    .slice(0, 5);

  return {
    key,
    label: key,
    documentCount,
    passCount,
    failCount,
    reviewCount,
    passRate,
    issueCount,
    criticalIssueCount,
    issueRate,
    avgConfidence:
      confidenceN > 0
        ? Math.round((confidenceSum / confidenceN) * 100) / 100
        : null,
    topIssueTypes,
    drilldownJobSheetIds: drilldownJobSheetIds
      .sort((a, b) => a - b)
      .slice(0, 50),
  };
}

export function aggregateCohortDimension(
  dimension: CohortDimension,
  documents: CohortDocumentRow[],
  findings: CohortFindingRow[],
  periodStart: string,
  periodEnd: string
): CohortDimensionSummary {
  const periodDocs = documents.filter(d =>
    inPeriod(d.processedAt, periodStart, periodEnd)
  );
  const periodFindings = findings.filter(f =>
    inPeriod(f.occurredAt, periodStart, periodEnd)
  );

  const findingsByJob = new Map<number, CohortFindingRow[]>();
  for (const f of periodFindings) {
    const list = findingsByJob.get(f.jobSheetId) ?? [];
    list.push(f);
    findingsByJob.set(f.jobSheetId, list);
  }

  const groups = new Map<string, CohortDocumentRow[]>();
  for (const doc of periodDocs) {
    const key = dimensionValue(doc, dimension);
    const list = groups.get(key) ?? [];
    list.push(doc);
    groups.set(key, list);
  }

  const buckets = Array.from(groups.entries())
    .map(([key, docs]) => buildBucket(key, docs, findingsByJob))
    .sort(
      (a, b) =>
        b.documentCount - a.documentCount || a.label.localeCompare(b.label)
    );

  return {
    dimension,
    buckets,
    totalDocuments: periodDocs.length,
    totalIssues: periodFindings.length,
  };
}

export function buildCohortAnalyticsSummary(input: {
  documents: CohortDocumentRow[];
  findings: CohortFindingRow[];
  startDate?: string;
  endDate?: string;
}): CohortAnalyticsSummary {
  const period = resolveCohortPeriod(input.startDate, input.endDate);
  const bySite = aggregateCohortDimension(
    "site",
    input.documents,
    input.findings,
    period.start,
    period.end
  );
  const byAssetType = aggregateCohortDimension(
    "assetType",
    input.documents,
    input.findings,
    period.start,
    period.end
  );
  const byWorkType = aggregateCohortDimension(
    "workType",
    input.documents,
    input.findings,
    period.start,
    period.end
  );

  const periodDocs = input.documents.filter(d =>
    inPeriod(d.processedAt, period.start, period.end)
  );
  const periodFindings = input.findings.filter(f =>
    inPeriod(f.occurredAt, period.start, period.end)
  );
  const passCount = periodDocs.filter(
    d => d.result === "pass" || d.result === "waived"
  ).length;
  const criticalIssueCount = periodFindings.filter(
    f => f.severity === "S0" || f.severity === "S1"
  ).length;

  return {
    period,
    bySite,
    byAssetType,
    byWorkType,
    totals: {
      documentCount: periodDocs.length,
      issueCount: periodFindings.length,
      criticalIssueCount,
      passRate:
        periodDocs.length > 0
          ? Math.round((passCount / periodDocs.length) * 1000) / 1000
          : 0,
    },
  };
}

export function buildCohortDrilldown(input: {
  documents: CohortDocumentRow[];
  findings: CohortFindingRow[];
  dimension: CohortDimension;
  key: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
}): CohortDrilldownItem[] {
  const period = resolveCohortPeriod(input.startDate, input.endDate);
  const docById = new Map(
    input.documents
      .filter(d => inPeriod(d.processedAt, period.start, period.end))
      .map(d => [d.jobSheetId, d])
  );

  const items: CohortDrilldownItem[] = [];
  for (const f of input.findings) {
    if (!inPeriod(f.occurredAt, period.start, period.end)) continue;
    const doc = docById.get(f.jobSheetId);
    if (!doc) continue;
    if (dimensionValue(doc, input.dimension) !== input.key) continue;
    items.push({
      jobSheetId: f.jobSheetId,
      findingId: f.findingId,
      severity: f.severity,
      reasonCode: f.reasonCode,
      fieldName: f.fieldName,
      occurredAt: toIso(f.occurredAt),
      site: normalizeCohortKey(doc.siteInfo),
      assetType: normalizeCohortKey(doc.assetType),
      workType: normalizeCohortKey(doc.workType),
    });
  }

  return items
    .sort(
      (a, b) =>
        new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime() ||
        a.findingId - b.findingId
    )
    .slice(0, input.limit ?? 50);
}
