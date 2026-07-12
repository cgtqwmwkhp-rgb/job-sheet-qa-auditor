/**
 * Deterministic analytical coaching narrative — second-person voice,
 * evidence-backed. Round 1 deep critique uses the evidence dossier.
 * QA Lead edits/owns before sharing.
 */

import type { EngineerScoreCard } from "./types";
import type { ThemeAggregate } from "./coachingThemes";
import type { EvidenceDossier } from "./evidenceDossier";

export interface NarrativeEnrichmentMeta {
  provider:
    | "deterministic"
    | "anthropic"
    | "openai"
    | "gemini"
    | "mock"
    | "none";
  model: string | null;
  enrichedAt: string | null;
  usedLlm: boolean;
  writerProvider?: "anthropic" | "openai" | "gemini" | "mock" | "none" | null;
  verifierProvider?: "anthropic" | "openai" | "gemini" | "mock" | "none" | null;
  verifierModel?: string | null;
  verifierRejectedLines?: number;
  citeGateDroppedLines?: number;
}

export interface CoachingNarrativeDraft {
  opening: string;
  strengths: string[];
  themesSummary: string;
  development: string[];
  coachingAsks: string[];
  /** Deep critical paragraphs grounded in dossier cites. */
  criticalAssessment: string[];
  /** Objective bullets with JS-/ref cites. */
  evidenceAnchors: string[];
  /** Cross-card behavioural patterns. */
  patternCritique: string[];
  /** Measurable next-period success criteria. */
  successCriteria: string[];
  enrichment: NarrativeEnrichmentMeta;
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

function citeLabel(jobSheetId: number, referenceNumber: string | null): string {
  return referenceNumber
    ? `${referenceNumber} (JS-${jobSheetId})`
    : `JS-${jobSheetId}`;
}

function defaultEnrichment(): NarrativeEnrichmentMeta {
  return {
    provider: "deterministic",
    model: "coaching-narrative-v2",
    enrichedAt: null,
    usedLlm: false,
  };
}

function buildEvidenceAnchors(dossier: EvidenceDossier | null): string[] {
  if (!dossier || dossier.cites.length === 0) return [];
  const anchors: string[] = [];
  for (const c of dossier.cites.slice(0, 8)) {
    const label = citeLabel(c.jobSheetId, c.referenceNumber);
    const parts: string[] = [
      `${label}: ${c.severity} ${c.ruleId ?? c.reasonCode} on “${c.fieldName}”`,
    ];
    if (c.snippet) parts.push(`evidence quote “${c.snippet}”`);
    else if (c.commentSnippet)
      parts.push(`comment quote “${c.commentSnippet}”`);
    if (c.commentHasWhat === false) parts.push("missing clear what-failed");
    if (
      c.commentHasNextAction === false &&
      c.commentHasPartsStance === false
    ) {
      parts.push("missing next-action / parts stance");
    }
    if (c.photoPairFailed === true) {
      parts.push(
        c.photoPairSummary
          ? `photo pair failed (${c.photoPairSummary})`
          : "photo pair failed"
      );
    }
    if (c.coherenceIssue) parts.push(`coherence: ${c.coherenceIssue}`);
    if (c.suggestedFix) parts.push(`fix cue: ${c.suggestedFix}`);
    anchors.push(parts.join(" — "));
  }
  return anchors;
}

function buildPatternCritique(dossier: EvidenceDossier | null): string[] {
  if (!dossier) return [];
  const r = dossier.signalRollup;
  const lines: string[] = [];
  if (r.missingWhatCount >= 2) {
    lines.push(
      `Across ${r.missingWhatCount} assessed cites, the clinical comment did not name what failed — reviewers cannot reconstruct the fault without calling you.`
    );
  }
  if (r.vagueCommentCount >= 2) {
    lines.push(
      `${r.vagueCommentCount} comments were vague or too thin (VOR / “see above” style). That is not objective evidence of diagnosis.`
    );
  }
  if (r.missingNextOrPartsCount >= 2) {
    lines.push(
      `${r.missingNextOrPartsCount} failure-path comments omitted next action and parts stance — the card does not tell ops what happens next.`
    );
  }
  if (r.photoPairFailCount >= 1) {
    lines.push(
      `Photo pair proof failed on ${r.photoPairFailCount} cite${r.photoPairFailCount === 1 ? "" : "s"} — completion claims need matched before/after on the work axis.`
    );
  }
  if (r.coherenceIssueCount >= 1) {
    lines.push(
      `Comment ↔ photo coherence failed on ${r.coherenceIssueCount} cite${r.coherenceIssueCount === 1 ? "" : "s"} — narrative and pictures disagree.`
    );
  }
  if (r.failurePathCards >= 1 && r.commentFindingCount >= 1) {
    lines.push(
      `${r.failurePathCards} failure-path card${r.failurePathCards === 1 ? "" : "s"} in the dossier still carry comment findings — that is the highest-risk coaching surface.`
    );
  }
  return lines;
}

function buildCriticalAssessment(input: {
  engineerName: string;
  scoreCard: EngineerScoreCard;
  developmentThemes: ThemeAggregate[];
  dossier: EvidenceDossier | null;
}): string[] {
  const { scoreCard, developmentThemes, dossier } = input;
  const paras: string[] = [];
  const r = dossier?.signalRollup;

  if (scoreCard.trend === "declining") {
    paras.push(
      `Critical read: your documentation standard slipped this period (score ${scoreCard.overallScore}, peer percentile ${scoreCard.peerComparison.percentile}). This is not about asset pass/fail — it is about whether a third party can trust the written and photographic record.`
    );
  } else if (scoreCard.overallScore < 70) {
    paras.push(
      `Critical read: overall documentation score ${scoreCard.overallScore} sits below a credible coaching bar (peer percentile ${scoreCard.peerComparison.percentile}). Volume alone does not compensate for weak evidence on failure-path cards.`
    );
  } else {
    paras.push(
      `Critical read: score ${scoreCard.overallScore} (peer p${scoreCard.peerComparison.percentile}) is the baseline — we still judge each theme on whether evidence would stand up in a dispute or client review.`
    );
  }

  for (const t of developmentThemes.slice(0, 3)) {
    const examples = refList(t.exampleJobSheetIds);
    const citeSnippets =
      dossier?.cites
        .filter(c => c.themeId === t.themeId && (c.snippet || c.commentSnippet))
        .slice(0, 2)
        .map(c => {
          const q = c.snippet || c.commentSnippet || "";
          return `${citeLabel(c.jobSheetId, c.referenceNumber)}: “${q}”`;
        }) ?? [];

    let para = `${t.title}: ${t.findingCount} finding${t.findingCount === 1 ? "" : "s"} (${t.majorCount} major) across ${t.sheetCount} card${t.sheetCount === 1 ? "" : "s"} including ${examples}. ${t.definition}`;
    if (citeSnippets.length > 0) {
      para += ` Evidence on file: ${citeSnippets.join("; ")}.`;
    }
    if (t.trend === "increasing") {
      para +=
        " Trend is worsening versus the prior window — treat this as a priority behavioural change, not a one-off.";
    }
    paras.push(para);
  }

  if (r && r.majorCiteCount >= 3) {
    paras.push(
      `Objectivity check: ${r.majorCiteCount} major-severity cites are in the dossier. Soft language will not clear them — each needs a concrete documentation behaviour change on the next similar job.`
    );
  }

  return paras;
}

function buildSuccessCriteria(input: {
  developmentThemes: ThemeAggregate[];
  dossier: EvidenceDossier | null;
}): string[] {
  const criteria: string[] = [];
  for (const t of input.developmentThemes.slice(0, 3)) {
    const target = Math.max(1, Math.floor(t.findingCount / 2));
    if (t.themeId === "comment_narrative") {
      criteria.push(
        `Next period: every Fail / Parts Still Required / incomplete outcome has a three-part comment (what failed, parts stance, next action) — target fewer than ${target} COMMENT-C findings.`
      );
    } else if (t.themeId === "photo_proof") {
      criteria.push(
        `Next period: matched before/after pairs on completion and Parts Still Required jobs — target fewer than ${target} PHOTO-C findings.`
      );
    } else if (t.themeId === "evidence_coherence") {
      criteria.push(
        `Next period: comment and photos must describe the same outcome before submit — target fewer than ${target} EVIDENCE-C findings.`
      );
    } else {
      criteria.push(
        `Next period: reduce “${t.title}” findings to fewer than ${target} occurrences with explicit on-card justification when N/A.`
      );
    }
  }

  const r = input.dossier?.signalRollup;
  if (r && r.missingWhatCount > 0) {
    criteria.push(
      "Zero failure-path comments that omit the defect name (no VOR-only or ‘see above’)."
    );
  }
  if (criteria.length === 0) {
    criteria.push(
      "Hold the current standard: coherent comments and complete photo proof on every failure-path and completion card."
    );
  }
  return criteria;
}

/**
 * Compose a human-readable coaching narrative from period analytics + dossier.
 */
export function composeCoachingNarrative(input: {
  engineerName: string;
  period: { start: string; end: string };
  scoreCard: EngineerScoreCard;
  priorScore: number | null;
  themes: ThemeAggregate[];
  developmentThemes: ThemeAggregate[];
  strengthHints: string[];
  dossier?: EvidenceDossier | null;
}): CoachingNarrativeDraft {
  const { engineerName, period, scoreCard, themes, developmentThemes } = input;
  const dossier = input.dossier ?? null;
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
  }; team average ${scoreCard.peerComparison.teamAvgScore}). This pack judges documentation quality — not whether the asset itself “passed”.`;

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
    const dossierExtras =
      dossier?.cites
        .filter(c => c.themeId === t.themeId)
        .slice(0, 2)
        .map(c => {
          const bits = [citeLabel(c.jobSheetId, c.referenceNumber)];
          if (c.snippet || c.commentSnippet) {
            bits.push(`“${c.snippet || c.commentSnippet}”`);
          }
          return bits.join(" ");
        }) ?? [];
    const evidenceBit =
      dossierExtras.length > 0
        ? ` Dossier evidence: ${dossierExtras.join("; ")}.`
        : "";
    return `${t.title}: ${t.findingCount} finding${t.findingCount === 1 ? "" : "s"} (${t.majorCount} major) on cards including ${examples}. ${t.definition}${evidenceBit}`;
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
    criticalAssessment: buildCriticalAssessment({
      engineerName,
      scoreCard,
      developmentThemes,
      dossier,
    }),
    evidenceAnchors: buildEvidenceAnchors(dossier),
    patternCritique: buildPatternCritique(dossier),
    successCriteria: buildSuccessCriteria({ developmentThemes, dossier }),
    enrichment: defaultEnrichment(),
  };
}
