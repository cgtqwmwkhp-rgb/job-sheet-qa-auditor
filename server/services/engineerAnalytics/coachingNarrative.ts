/**
 * Deterministic analytical coaching narrative — second-person voice,
 * evidence-backed. QA Lead edits/owns before sharing.
 */

import type { EngineerScoreCard } from "./types";
import type { ThemeAggregate } from "./coachingThemes";

export interface CoachingNarrativeDraft {
  opening: string;
  strengths: string[];
  themesSummary: string;
  development: string[];
  coachingAsks: string[];
}

function formatPeriodLabel(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  const opts: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
    year: "numeric",
  };
  return `${s.toLocaleDateString("en-GB", opts)} – ${e.toLocaleDateString("en-GB", opts)}`;
}

function judgementPhrase(
  trend: EngineerScoreCard["trend"],
  scoreDelta: number
): string {
  if (trend === "improving") {
    return `Documentation quality is improving versus the prior period${
      scoreDelta !== 0
        ? ` (score ${scoreDelta > 0 ? "+" : ""}${scoreDelta})`
        : ""
    }`;
  }
  if (trend === "declining") {
    return `Documentation quality has softened versus the prior period${
      scoreDelta !== 0 ? ` (score ${scoreDelta})` : ""
    }`;
  }
  return "Documentation quality is broadly stable versus the prior period";
}

function refList(jobSheetIds: number[]): string {
  if (jobSheetIds.length === 0) return "several cards";
  return jobSheetIds.map(id => `JS-${id}`).join(", ");
}

/**
 * Compose a human-readable coaching narrative from period analytics.
 */
export function composeCoachingNarrative(input: {
  engineerName: string;
  period: { start: string; end: string };
  scoreCard: EngineerScoreCard;
  priorScore: number | null;
  themes: ThemeAggregate[];
  developmentThemes: ThemeAggregate[];
  strengthHints: string[];
}): CoachingNarrativeDraft {
  const { engineerName, period, scoreCard, themes, developmentThemes } = input;
  const cards = scoreCard.documentsProcessed;
  const scoreDelta =
    input.priorScore != null ? scoreCard.overallScore - input.priorScore : 0;

  const opening = `${engineerName}, over ${formatPeriodLabel(
    period.start,
    period.end
  )} we assessed ${cards} job card${cards === 1 ? "" : "s"}. ${judgementPhrase(
    scoreCard.trend,
    scoreDelta
  )}. Overall documentation score sits at ${scoreCard.overallScore} (peer percentile ${
    scoreCard.peerComparison.percentile
  }; team average ${scoreCard.peerComparison.teamAvgScore}).`;

  const strengths: string[] =
    input.strengthHints.length > 0
      ? input.strengthHints
      : [
          cards > 0 && scoreCard.issueRate < 0.35
            ? `You kept issue density relatively low — ${scoreCard.documentsWithIssues} of ${cards} cards carried findings (${Math.round(scoreCard.issueRate * 100)}%).`
            : `You completed ${cards} attributed card${cards === 1 ? "" : "s"} in this window — use that volume as the base for tightening the themes below.`,
        ];

  const themesSummary =
    themes.length === 0
      ? "No dominant evidence themes this period — keep the current standard of documentation."
      : `The main themes this period were ${themes
          .map(
            t =>
              `${t.title} (${t.findingCount} finding${t.findingCount === 1 ? "" : "s"} across ${t.sheetCount} card${t.sheetCount === 1 ? "" : "s"}, ${t.percentageOfIssues}% of issues, trend ${t.trend})`
          )
          .join("; ")}.`;

  const development: string[] = developmentThemes.map(t => {
    const examples = refList(t.exampleJobSheetIds);
    return `${t.title}: ${t.findingCount} finding${t.findingCount === 1 ? "" : "s"} (${t.majorCount} major) on cards including ${examples}. ${t.definition}`;
  });

  const coachingAsks: string[] = developmentThemes.slice(0, 3).map(t => {
    if (t.themeId === "comment_narrative") {
      return `On every Fail / incomplete outcome next period, write a three-part comment (what failed, what you did, clear next step) before leaving site — aim to clear COMMENT-C majors.`;
    }
    if (t.themeId === "photo_proof") {
      return `Capture matched before/after pairs on completion and Parts Still Required jobs so PHOTO-C pair checks can pass without a rework.`;
    }
    if (t.themeId === "evidence_coherence") {
      return `Before submit, re-read your comment against the photos — they must tell the same story (no “complete” narrative with incomplete proof).`;
    }
    if (t.themeId === "checklist_completeness") {
      return `Close required checklist and field gaps on-site; if N/A, say so explicitly rather than leaving blanks.`;
    }
    return `Focus the next period on reducing “${t.title}” findings — target fewer than ${Math.max(1, Math.floor(t.findingCount / 2))} occurrences.`;
  });

  if (coachingAsks.length === 0) {
    coachingAsks.push(
      "Hold the current standard: coherent comments and complete photo proof on every failure-path and completion card."
    );
  }

  return {
    opening,
    strengths,
    themesSummary,
    development,
    coachingAsks,
  };
}
