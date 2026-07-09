/**
 * Aggregate engineer scorecards from DB-shaped rows.
 * Pure functions — no DB / network. Used by tRPC + contract tests.
 */

import {
  calculateScoreCard,
  calculateTrendAnalytics,
  generateFixPack,
} from "./analyticsService";
import { toIssueOccurrence, type RawFindingRow } from "./mapFindings";
import type {
  EngineerProfile,
  EngineerScoreCard,
  FixPack,
  TrendAnalytics,
} from "./types";

export interface EngineerDocumentRow {
  technicianId: number;
  jobSheetId: number;
  processedAt: Date | string;
}

export interface EngineerUserRow {
  id: number;
  name: string | null;
  email: string | null;
  role: string;
  createdAt: Date | string;
  isActive?: boolean;
}

export interface EngineerLeaderboardEntry {
  engineerId: string;
  engineerName: string;
  overallScore: number;
  trend: EngineerScoreCard["trend"];
  documentsProcessed: number;
  documentsWithIssues: number;
  issueRate: number;
  criticalIssues: number;
  totalIssues: number;
  topIssueType: string | null;
}

export interface EngineerDrilldownItem {
  jobSheetId: number;
  findingId: number;
  severity: string;
  reasonCode: string;
  issueType: string;
  fieldName: string;
  resolutionStatus: string;
  occurredAt: string;
}

export interface EngineerAnalyticsSummary {
  period: { start: string; end: string };
  engineerCount: number;
  totalDocuments: number;
  totalIssues: number;
  teamAvgScore: number;
  leaderboard: EngineerLeaderboardEntry[];
  trends: TrendAnalytics;
}

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

export function resolvePeriod(
  startDate?: string,
  endDate?: string
): { start: string; end: string } {
  const fallback = defaultPeriod();
  const start = startDate ? new Date(startDate).toISOString() : fallback.start;
  const end = endDate ? new Date(endDate).toISOString() : fallback.end;
  return { start, end };
}

export function toEngineerProfile(user: EngineerUserRow): EngineerProfile {
  return {
    id: String(user.id),
    name: user.name?.trim() || user.email || `Technician ${user.id}`,
    employeeId: `EMP-${user.id}`,
    startDate: toIso(user.createdAt).split("T")[0],
    isActive: user.isActive ?? true,
  };
}

function previousPeriod(
  start: string,
  end: string
): { start: string; end: string } {
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  const duration = Math.max(endMs - startMs, 24 * 60 * 60 * 1000);
  return {
    start: new Date(startMs - duration).toISOString(),
    end: start,
  };
}

function filterDocsForEngineer(
  docs: EngineerDocumentRow[],
  engineerId: number,
  start: string,
  end: string
): EngineerDocumentRow[] {
  return docs.filter(
    d =>
      d.technicianId === engineerId &&
      toIso(d.processedAt) >= start &&
      toIso(d.processedAt) <= end
  );
}

function filterFindingsForEngineer(
  findings: RawFindingRow[],
  engineerId: number,
  start: string,
  end: string
): RawFindingRow[] {
  return findings.filter(
    f =>
      f.technicianId === engineerId &&
      toIso(f.occurredAt) >= start &&
      toIso(f.occurredAt) <= end
  );
}

function scoreFromCard(card: EngineerScoreCard): number {
  return card.overallScore;
}

/**
 * Build scorecards for every engineer that has documents or findings in-period.
 */
export function buildEngineerScoreCards(input: {
  users: EngineerUserRow[];
  documents: EngineerDocumentRow[];
  findings: RawFindingRow[];
  periodStart: string;
  periodEnd: string;
}): EngineerScoreCard[] {
  const { users, documents, findings, periodStart, periodEnd } = input;
  const prev = previousPeriod(periodStart, periodEnd);

  const engineerIds = new Set<number>();
  for (const d of documents) {
    if (
      toIso(d.processedAt) >= periodStart &&
      toIso(d.processedAt) <= periodEnd
    ) {
      engineerIds.add(d.technicianId);
    }
  }
  for (const f of findings) {
    if (
      toIso(f.occurredAt) >= periodStart &&
      toIso(f.occurredAt) <= periodEnd
    ) {
      engineerIds.add(f.technicianId);
    }
  }

  const userById = new Map(users.map(u => [u.id, u]));
  const cards: EngineerScoreCard[] = [];

  for (const id of Array.from(engineerIds).sort((a, b) => a - b)) {
    const user = userById.get(id) ?? {
      id,
      name: `Technician ${id}`,
      email: null,
      role: "technician",
      createdAt: periodStart,
    };
    const profile = toEngineerProfile(user);
    const periodDocs = filterDocsForEngineer(
      documents,
      id,
      periodStart,
      periodEnd
    );
    const periodFindings = filterFindingsForEngineer(
      findings,
      id,
      periodStart,
      periodEnd
    );
    const issues = periodFindings.map(toIssueOccurrence);

    const prevDocs = filterDocsForEngineer(documents, id, prev.start, prev.end);
    const prevFindings = filterFindingsForEngineer(
      findings,
      id,
      prev.start,
      prev.end
    );
    const prevIssues = prevFindings.map(toIssueOccurrence);
    const prevCard = calculateScoreCard(
      profile,
      prevIssues,
      prevDocs.length,
      prev.start,
      prev.end
    );

    const card = calculateScoreCard(
      profile,
      issues,
      periodDocs.length,
      periodStart,
      periodEnd
    );

    // Replace hardcoded previous-score assumption with real prior period.
    const delta = card.overallScore - prevCard.overallScore;
    const trend: EngineerScoreCard["trend"] =
      delta > 5 ? "improving" : delta < -5 ? "declining" : "stable";

    cards.push({
      ...card,
      trend,
    });
  }

  // Peer comparison from real cohort averages
  if (cards.length > 0) {
    const avg =
      cards.reduce((sum, c) => sum + c.overallScore, 0) / cards.length;
    const sorted = [...cards].sort((a, b) => a.overallScore - b.overallScore);

    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const rankIndex = sorted.findIndex(c => c.engineerId === card.engineerId);
      const percentile =
        cards.length === 1
          ? 50
          : Math.round((rankIndex / (cards.length - 1)) * 100);
      cards[i] = {
        ...card,
        peerComparison: {
          percentile,
          teamAvgScore: Math.round(avg),
          regionAvgScore: Math.round(avg),
        },
      };
    }
  }

  return cards.sort((a, b) => {
    if (b.overallScore !== a.overallScore) {
      return b.overallScore - a.overallScore;
    }
    return a.engineerName.localeCompare(b.engineerName);
  });
}

export function toLeaderboard(
  cards: EngineerScoreCard[]
): EngineerLeaderboardEntry[] {
  return cards.map(card => ({
    engineerId: card.engineerId,
    engineerName: card.engineerName,
    overallScore: card.overallScore,
    trend: card.trend,
    documentsProcessed: card.documentsProcessed,
    documentsWithIssues: card.documentsWithIssues,
    issueRate: card.issueRate,
    criticalIssues: card.issuesBySeverity.S0 + card.issuesBySeverity.S1,
    totalIssues: card.issuesByType.reduce((sum, t) => sum + t.count, 0),
    topIssueType: card.issuesByType[0]?.issueType ?? null,
  }));
}

export function buildEngineerAnalyticsSummary(input: {
  users: EngineerUserRow[];
  documents: EngineerDocumentRow[];
  findings: RawFindingRow[];
  startDate?: string;
  endDate?: string;
}): EngineerAnalyticsSummary {
  const period = resolvePeriod(input.startDate, input.endDate);
  const cards = buildEngineerScoreCards({
    users: input.users,
    documents: input.documents,
    findings: input.findings,
    periodStart: period.start,
    periodEnd: period.end,
  });

  const periodDocs = input.documents.filter(
    d =>
      toIso(d.processedAt) >= period.start && toIso(d.processedAt) <= period.end
  );
  const periodFindings = input.findings.filter(
    f =>
      toIso(f.occurredAt) >= period.start && toIso(f.occurredAt) <= period.end
  );

  const teamAvgScore =
    cards.length > 0
      ? Math.round(
          cards.reduce((sum, c) => sum + scoreFromCard(c), 0) / cards.length
        )
      : 0;

  const trends = calculateTrendAnalytics(
    periodFindings.map(toIssueOccurrence),
    periodDocs.map(d => ({
      id: String(d.jobSheetId),
      processedAt: toIso(d.processedAt),
    })),
    period.start,
    period.end,
    "week"
  );

  // Fill engineer trend lists from real scorecards vs prior period
  const prev = previousPeriod(period.start, period.end);
  const prevCards = buildEngineerScoreCards({
    users: input.users,
    documents: input.documents,
    findings: input.findings,
    periodStart: prev.start,
    periodEnd: prev.end,
  });
  const prevById = new Map(prevCards.map(c => [c.engineerId, c]));

  const engineerTrends = cards.map(card => {
    const previous = prevById.get(card.engineerId);
    const previousScore = previous?.overallScore ?? card.overallScore;
    const changePercent =
      previousScore > 0
        ? Math.round(
            ((card.overallScore - previousScore) / previousScore) * 100
          )
        : 0;
    return {
      engineerId: card.engineerId,
      engineerName: card.engineerName,
      currentScore: card.overallScore,
      previousScore,
      changePercent,
      trend: card.trend,
    };
  });

  const topImproving = [...engineerTrends]
    .filter(e => e.trend === "improving")
    .sort((a, b) => b.changePercent - a.changePercent)
    .slice(0, 5);
  const needingAttention = [...engineerTrends]
    .filter(e => e.trend === "declining" || e.currentScore < 70)
    .sort((a, b) => a.currentScore - b.currentScore)
    .slice(0, 5);

  return {
    period,
    engineerCount: cards.length,
    totalDocuments: periodDocs.length,
    totalIssues: periodFindings.length,
    teamAvgScore,
    leaderboard: toLeaderboard(cards),
    trends: {
      ...trends,
      topImproving,
      needingAttention,
    },
  };
}

export function buildEngineerScoreCardDetail(input: {
  users: EngineerUserRow[];
  documents: EngineerDocumentRow[];
  findings: RawFindingRow[];
  engineerId: string;
  startDate?: string;
  endDate?: string;
}): {
  scoreCard: EngineerScoreCard | null;
  fixPack: FixPack | null;
  drilldown: EngineerDrilldownItem[];
} {
  const period = resolvePeriod(input.startDate, input.endDate);
  const cards = buildEngineerScoreCards({
    users: input.users,
    documents: input.documents,
    findings: input.findings,
    periodStart: period.start,
    periodEnd: period.end,
  });
  const scoreCard = cards.find(c => c.engineerId === input.engineerId) ?? null;

  if (!scoreCard) {
    return { scoreCard: null, fixPack: null, drilldown: [] };
  }

  const engineerNumericId = Number(input.engineerId);
  const periodFindings = filterFindingsForEngineer(
    input.findings,
    engineerNumericId,
    period.start,
    period.end
  );
  const issues = periodFindings.map(toIssueOccurrence);
  const user =
    input.users.find(u => String(u.id) === input.engineerId) ??
    ({
      id: engineerNumericId,
      name: scoreCard.engineerName,
      email: null,
      role: "technician",
      createdAt: period.start,
    } satisfies EngineerUserRow);

  const fixPack = generateFixPack(toEngineerProfile(user), issues);

  const drilldown: EngineerDrilldownItem[] = periodFindings
    .map(f => ({
      jobSheetId: f.jobSheetId,
      findingId: f.findingId,
      severity: f.severity,
      reasonCode: f.reasonCode,
      issueType: mapIssueTypeFromRow(f),
      fieldName: f.fieldName,
      resolutionStatus: f.resolutionStatus,
      occurredAt: toIso(f.occurredAt),
    }))
    .sort((a, b) => {
      const sevOrder: Record<string, number> = {
        S0: 0,
        S1: 1,
        S2: 2,
        S3: 3,
      };
      const sa = sevOrder[a.severity] ?? 9;
      const sb = sevOrder[b.severity] ?? 9;
      if (sa !== sb) return sa - sb;
      return b.occurredAt.localeCompare(a.occurredAt);
    });

  return { scoreCard, fixPack, drilldown };
}

function mapIssueTypeFromRow(row: RawFindingRow): string {
  return toIssueOccurrence(row).issueType;
}
