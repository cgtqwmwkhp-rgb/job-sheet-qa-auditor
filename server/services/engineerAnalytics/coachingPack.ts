/**
 * Build a period-scoped engineer coaching pack for QA Lead 1:1s.
 * Pure aggregation — no DB / network.
 */

import {
  buildEngineerScoreCards,
  resolvePeriod,
  toEngineerProfile,
  type EngineerDocumentRow,
  type EngineerUserRow,
} from "./aggregateFromDb";
import {
  composeCoachingNarrative,
  type CoachingNarrativeDraft,
} from "./coachingNarrative";
import {
  aggregateCoachingThemes,
  classifyFindingTheme,
  type ThemeAggregate,
} from "./coachingThemes";
import type { RawFindingRow } from "./mapFindings";
import { toIssueOccurrence } from "./mapFindings";
import { generateFixPack } from "./analyticsService";
import type { EngineerScoreCard, FixPack } from "./types";

export interface CoachingJobCard {
  jobSheetId: number;
  referenceNumber: string | null;
  siteInfo: string | null;
  processedAt: string;
  outcome: "pass" | "fail" | "review_queue" | "waived" | "unknown";
  docPercent: number | null;
  findingCount: number;
  majorCount: number;
  primaryTheme: string | null;
  primaryRuleId: string | null;
}

export interface CoachingWorkedExample {
  jobSheetId: number;
  referenceNumber: string | null;
  themeTitle: string;
  ruleId: string | null;
  severity: string;
  fieldName: string;
  whatWentWrong: string;
  correctApproach: string;
}

export interface EngineerCoachingPack {
  engineerId: string;
  engineerName: string;
  period: { start: string; end: string };
  priorPeriod: { start: string; end: string };
  scoreCard: EngineerScoreCard;
  priorScore: number | null;
  summaryMetrics: {
    cardsAssessed: number;
    passCount: number;
    reviewCount: number;
    failCount: number;
    avgDocPercent: number | null;
    majorCount: number;
    totalFindings: number;
    peerPercentile: number;
  };
  themes: ThemeAggregate[];
  strengths: string[];
  developmentAreas: ThemeAggregate[];
  jobCards: CoachingJobCard[];
  workedExamples: CoachingWorkedExample[];
  coachingAsks: string[];
  draftNarrative: CoachingNarrativeDraft;
  fixPack: FixPack | null;
  evidenceRoi: {
    commentFailCount: number;
    photoFailCount: number;
    coherenceFailCount: number;
    totalEvidenceFindings: number;
  };
}

function toIso(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toISOString();
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

function inWindow(iso: string, start: string, end: string): boolean {
  return iso >= start && iso <= end;
}

function ruleLabel(ruleId: string | null, reasonCode: string): string {
  if (ruleId?.startsWith("COMMENT-C")) {
    return "Clinical comment did not meet documentation standard for this outcome path.";
  }
  if (ruleId?.startsWith("PHOTO-C")) {
    return "Before/after photo proof was incomplete or failed pair comparison.";
  }
  if (ruleId?.startsWith("EVIDENCE-C")) {
    return "Comment and photo evidence were not coherent with each other.";
  }
  return `Finding on ${reasonCode.replace(/_/g, " ").toLowerCase()}.`;
}

function correctApproachFor(ruleId: string | null, themeTitle: string): string {
  if (ruleId?.startsWith("COMMENT-C")) {
    return "Rewrite the engineer comment to cover what failed, what was done, and the clear next step before leaving site.";
  }
  if (ruleId?.startsWith("PHOTO-C")) {
    return "Capture matched before and after photos that show the work axis claimed on the card.";
  }
  if (ruleId?.startsWith("EVIDENCE-C")) {
    return "Align the written narrative with what the photos show before submitting.";
  }
  return `Apply the “good” standard for ${themeTitle} on the next similar job.`;
}

function buildStrengthHints(input: {
  scoreCard: EngineerScoreCard;
  themes: ThemeAggregate[];
  evidenceRoi: EngineerCoachingPack["evidenceRoi"];
  cardsAssessed: number;
}): string[] {
  const hints: string[] = [];
  const { scoreCard, themes, evidenceRoi, cardsAssessed } = input;

  if (scoreCard.trend === "improving") {
    hints.push(
      `Your overall documentation score improved this period to ${scoreCard.overallScore} — keep that trajectory.`
    );
  }
  if (scoreCard.peerComparison.percentile >= 60) {
    hints.push(
      `You sit at peer percentile ${scoreCard.peerComparison.percentile} against a team average of ${scoreCard.peerComparison.teamAvgScore}.`
    );
  }
  if (
    cardsAssessed >= 3 &&
    evidenceRoi.commentFailCount === 0 &&
    themes.every(t => t.themeId !== "comment_narrative")
  ) {
    hints.push(
      "Clinical comments held up this period — no COMMENT-C theme concentration in the rollup."
    );
  }
  if (
    cardsAssessed >= 3 &&
    evidenceRoi.photoFailCount === 0 &&
    themes.every(t => t.themeId !== "photo_proof")
  ) {
    hints.push(
      "Photo proof stayed clean this period — no PHOTO-C theme concentration in the rollup."
    );
  }
  if (scoreCard.issueRate <= 0.25 && cardsAssessed > 0) {
    hints.push(
      `Issue density stayed controlled: ${scoreCard.documentsWithIssues}/${cardsAssessed} cards with findings (${Math.round(scoreCard.issueRate * 100)}%).`
    );
  }

  return hints.slice(0, 3);
}

/**
 * Compose the full coaching pack for one engineer and period.
 */
export function buildEngineerCoachingPack(input: {
  users: EngineerUserRow[];
  documents: EngineerDocumentRow[];
  findings: RawFindingRow[];
  engineerId: string;
  startDate?: string;
  endDate?: string;
}): EngineerCoachingPack | null {
  const period = resolvePeriod(input.startDate, input.endDate);
  const priorPeriod = previousPeriod(period.start, period.end);
  const engineerNumericId = Number(input.engineerId);
  if (!Number.isFinite(engineerNumericId)) return null;

  const cards = buildEngineerScoreCards({
    users: input.users,
    documents: input.documents,
    findings: input.findings,
    periodStart: period.start,
    periodEnd: period.end,
  });
  const scoreCard = cards.find(c => c.engineerId === input.engineerId) ?? null;
  if (!scoreCard) return null;

  const priorCards = buildEngineerScoreCards({
    users: input.users,
    documents: input.documents,
    findings: input.findings,
    periodStart: priorPeriod.start,
    periodEnd: priorPeriod.end,
  });
  const priorScore =
    priorCards.find(c => c.engineerId === input.engineerId)?.overallScore ??
    null;

  const periodDocs = input.documents.filter(
    d =>
      d.technicianId === engineerNumericId &&
      inWindow(toIso(d.processedAt), period.start, period.end)
  );
  const periodFindings = input.findings.filter(
    f =>
      f.technicianId === engineerNumericId &&
      inWindow(toIso(f.occurredAt), period.start, period.end)
  );
  const priorFindings = input.findings.filter(
    f =>
      f.technicianId === engineerNumericId &&
      inWindow(toIso(f.occurredAt), priorPeriod.start, priorPeriod.end)
  );

  const themes = aggregateCoachingThemes({
    currentFindings: periodFindings,
    priorFindings,
    limit: 4,
  });
  const developmentAreas = themes.filter(
    t => t.majorCount > 0 || t.findingCount >= 2
  );
  const developmentForPack =
    developmentAreas.length > 0
      ? developmentAreas.slice(0, 3)
      : themes.slice(0, 2);

  const findingsBySheet = new Map<number, RawFindingRow[]>();
  for (const f of periodFindings) {
    const list = findingsBySheet.get(f.jobSheetId) ?? [];
    list.push(f);
    findingsBySheet.set(f.jobSheetId, list);
  }

  const jobCards: CoachingJobCard[] = periodDocs
    .map(d => {
      const sheetFindings = findingsBySheet.get(d.jobSheetId) ?? [];
      const majors = sheetFindings.filter(
        f => f.severity === "S0" || f.severity === "S1"
      );
      const primary = [...sheetFindings].sort((a, b) => {
        const rank = (s: string) =>
          s === "S0" ? 0 : s === "S1" ? 1 : s === "S2" ? 2 : 3;
        return rank(a.severity) - rank(b.severity);
      })[0];
      const themeId = primary ? classifyFindingTheme(primary) : null;
      const outcome: CoachingJobCard["outcome"] = d.result ?? "unknown";
      return {
        jobSheetId: d.jobSheetId,
        referenceNumber: d.referenceNumber ?? null,
        siteInfo: d.siteInfo ?? null,
        processedAt: toIso(d.processedAt),
        outcome,
        docPercent:
          d.confidenceScore != null
            ? Math.round(Number(d.confidenceScore))
            : null,
        findingCount: sheetFindings.length,
        majorCount: majors.length,
        primaryTheme: themeId
          ? (themes.find(t => t.themeId === themeId)?.title ?? themeId)
          : null,
        primaryRuleId: primary?.ruleId ?? null,
      };
    })
    .sort((a, b) => b.processedAt.localeCompare(a.processedAt));

  let passCount = 0;
  let reviewCount = 0;
  let failCount = 0;
  let docSum = 0;
  let docN = 0;
  for (const c of jobCards) {
    if (c.outcome === "pass") passCount++;
    else if (c.outcome === "review_queue") reviewCount++;
    else if (c.outcome === "fail") failCount++;
    if (c.docPercent != null) {
      docSum += c.docPercent;
      docN++;
    }
  }

  const evidenceRoi = {
    commentFailCount: 0,
    photoFailCount: 0,
    coherenceFailCount: 0,
    totalEvidenceFindings: 0,
  };
  for (const f of periodFindings) {
    const ruleId = (f.ruleId ?? "").trim();
    if (ruleId.startsWith("COMMENT-C")) {
      evidenceRoi.commentFailCount++;
      evidenceRoi.totalEvidenceFindings++;
    } else if (ruleId.startsWith("PHOTO-C")) {
      evidenceRoi.photoFailCount++;
      evidenceRoi.totalEvidenceFindings++;
    } else if (ruleId.startsWith("EVIDENCE-C")) {
      evidenceRoi.coherenceFailCount++;
      evidenceRoi.totalEvidenceFindings++;
    }
  }

  const strengthHints = buildStrengthHints({
    scoreCard,
    themes,
    evidenceRoi,
    cardsAssessed: periodDocs.length,
  });

  const draftNarrative = composeCoachingNarrative({
    engineerName: scoreCard.engineerName,
    period,
    scoreCard,
    priorScore,
    themes,
    developmentThemes: developmentForPack,
    strengthHints,
  });

  const workedExamples: CoachingWorkedExample[] = [];
  for (const theme of developmentForPack) {
    for (const sheetId of theme.exampleJobSheetIds.slice(0, 1)) {
      const finding = (findingsBySheet.get(sheetId) ?? []).find(
        f => classifyFindingTheme(f) === theme.themeId
      );
      if (!finding) continue;
      const doc = periodDocs.find(d => d.jobSheetId === sheetId);
      workedExamples.push({
        jobSheetId: sheetId,
        referenceNumber: doc?.referenceNumber ?? null,
        themeTitle: theme.title,
        ruleId: finding.ruleId ?? null,
        severity: finding.severity,
        fieldName: finding.fieldName,
        whatWentWrong: ruleLabel(finding.ruleId ?? null, finding.reasonCode),
        correctApproach: correctApproachFor(
          finding.ruleId ?? null,
          theme.title
        ),
      });
    }
  }

  const user =
    input.users.find(u => String(u.id) === input.engineerId) ??
    ({
      id: engineerNumericId,
      name: scoreCard.engineerName,
      email: null,
      role: "technician",
      createdAt: period.start,
    } satisfies EngineerUserRow);

  const issues = periodFindings.map(toIssueOccurrence);
  const fixPack =
    issues.length > 0 ? generateFixPack(toEngineerProfile(user), issues) : null;

  return {
    engineerId: input.engineerId,
    engineerName: scoreCard.engineerName,
    period,
    priorPeriod,
    scoreCard,
    priorScore,
    summaryMetrics: {
      cardsAssessed: periodDocs.length,
      passCount,
      reviewCount,
      failCount,
      avgDocPercent: docN > 0 ? Math.round(docSum / docN) : null,
      majorCount: scoreCard.issuesBySeverity.S0 + scoreCard.issuesBySeverity.S1,
      totalFindings: periodFindings.length,
      peerPercentile: scoreCard.peerComparison.percentile,
    },
    themes,
    strengths: draftNarrative.strengths,
    developmentAreas: developmentForPack,
    jobCards,
    workedExamples,
    coachingAsks: draftNarrative.coachingAsks,
    draftNarrative,
    fixPack,
    evidenceRoi,
  };
}
