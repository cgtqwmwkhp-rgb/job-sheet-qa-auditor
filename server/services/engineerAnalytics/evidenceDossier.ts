/**
 * Round 1 — Evidence dossier for engineer coaching.
 * Deterministic extraction from findings + audit reportJson.
 * Every coaching claim must be groundable in this dossier.
 */

import type { EngineerDocumentRow } from "./aggregateFromDb";
import {
  classifyFindingTheme,
  type CoachingThemeId,
} from "./coachingThemes";
import type { RawFindingRow } from "./mapFindings";

export interface EvidenceCite {
  jobSheetId: number;
  referenceNumber: string | null;
  siteInfo: string | null;
  outcome: string;
  findingId: number;
  severity: string;
  reasonCode: string;
  ruleId: string | null;
  fieldName: string;
  themeId: CoachingThemeId;
  snippet: string | null;
  suggestedFix: string | null;
  whyItMatters: string | null;
  pageNumber: number | null;
  commentSnippet: string | null;
  commentHasWhat: boolean | null;
  commentHasNextAction: boolean | null;
  commentHasPartsStance: boolean | null;
  commentVague: boolean | null;
  deepNoteGaps: string[];
  photoPairFailed: boolean | null;
  photoPairSummary: string | null;
  failurePathActive: boolean | null;
  coherenceIssue: string | null;
}

export interface EvidenceSignalRollup {
  citesWithSnippets: number;
  commentFindingCount: number;
  missingWhatCount: number;
  missingNextOrPartsCount: number;
  vagueCommentCount: number;
  photoPairFailCount: number;
  coherenceIssueCount: number;
  failurePathCards: number;
  majorCiteCount: number;
}

export interface EvidenceDossier {
  engineerName: string;
  period: { start: string; end: string };
  cardsAssessed: number;
  cites: EvidenceCite[];
  signalRollup: EvidenceSignalRollup;
  /** Compact markdown for LLM prompts / QA Lead inspection. */
  compactMarkdown: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asBool(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function truncate(text: string | null, max = 220): string | null {
  if (!text) return null;
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1)}…`;
}

function parseReport(reportJson: unknown): Record<string, unknown> | null {
  if (typeof reportJson === "string") {
    try {
      return asRecord(JSON.parse(reportJson));
    } catch {
      return null;
    }
  }
  return asRecord(reportJson);
}

function extractDeepNoteGaps(report: Record<string, unknown> | null): string[] {
  const note = asRecord(report?.commentDeepNote);
  if (!note) return [];
  const gaps = note.gaps;
  if (!Array.isArray(gaps)) return [];
  return gaps
    .map(g => (typeof g === "string" ? g.trim() : ""))
    .filter(Boolean)
    .slice(0, 5);
}

function extractPhotoPair(
  report: Record<string, unknown> | null
): { failed: boolean | null; summary: string | null } {
  const pair = asRecord(report?.photoPairCompare);
  if (!pair) return { failed: null, summary: null };
  const passed = asBool(pair.passed ?? pair.ok ?? pair.pairOk);
  const summary =
    asString(pair.summary) ??
    asString(pair.reason) ??
    asString(pair.failureReason) ??
    null;
  if (passed === null && summary == null) {
    const findings = pair.findings;
    if (Array.isArray(findings) && findings.length > 0) {
      return {
        failed: true,
        summary: truncate(
          findings
            .map(f => {
              const r = asRecord(f);
              return asString(r?.message) ?? asString(r?.ruleId) ?? "";
            })
            .filter(Boolean)
            .join("; "),
          180
        ),
      };
    }
  }
  return {
    failed: passed === null ? null : !passed,
    summary: truncate(summary, 180),
  };
}

function extractCoherence(
  report: Record<string, unknown> | null
): string | null {
  const c = asRecord(report?.evidenceCoherenceSummary);
  if (!c) return null;
  const issue =
    asString(c.issue) ??
    asString(c.summary) ??
    asString(c.reason) ??
    asString(c.message);
  if (issue) return truncate(issue, 180);
  if (asBool(c.passed) === false || asBool(c.coherent) === false) {
    return "Comment and photo evidence were judged incoherent on this card.";
  }
  return null;
}

function extractFailurePath(
  report: Record<string, unknown> | null
): boolean | null {
  const s = asRecord(report?.failurePathSignals);
  if (!s) return null;
  if (asBool(s.onFailurePath) != null) return asBool(s.onFailurePath);
  // Heuristic: worksComplete No / parts still required / fail marks
  const parts = asBool(s.partsStillRequired);
  const works = asBool(s.worksCompleteYes);
  if (parts === true) return true;
  if (works === false) return true;
  return null;
}

function extractCommentSignals(report: Record<string, unknown> | null): {
  snippet: string | null;
  hasWhat: boolean | null;
  hasNextAction: boolean | null;
  hasPartsStance: boolean | null;
  vague: boolean | null;
} {
  const s = asRecord(report?.commentQualitySignals);
  if (!s) {
    return {
      snippet: null,
      hasWhat: null,
      hasNextAction: null,
      hasPartsStance: null,
      vague: null,
    };
  }
  return {
    snippet: truncate(asString(s.snippet), 220),
    hasWhat: asBool(s.hasWhat),
    hasNextAction: asBool(s.hasNextAction),
    hasPartsStance: asBool(s.hasPartsStance),
    vague: asBool(s.isVagueOnly) === true || asBool(s.isTooThin) === true,
  };
}

function findingSnippet(f: RawFindingRow): string | null {
  return truncate(
    asString(f.normalisedSnippet) ?? asString(f.rawSnippet),
    220
  );
}

/**
 * Build an evidence dossier from period findings + optional reportJson map.
 */
export function buildEvidenceDossier(input: {
  engineerName: string;
  period: { start: string; end: string };
  documents: EngineerDocumentRow[];
  findings: RawFindingRow[];
  reportsByJobSheetId?: Record<number, unknown>;
  maxCites?: number;
}): EvidenceDossier {
  const maxCites = input.maxCites ?? 16;
  const docsById = new Map(
    input.documents.map(d => [d.jobSheetId, d] as const)
  );
  const reports = input.reportsByJobSheetId ?? {};

  const ranked = [...input.findings].sort((a, b) => {
    const rank = (s: string) =>
      s === "S0" ? 0 : s === "S1" ? 1 : s === "S2" ? 2 : 3;
    const bySev = rank(a.severity) - rank(b.severity);
    if (bySev !== 0) return bySev;
    return b.findingId - a.findingId;
  });

  const cites: EvidenceCite[] = [];
  for (const f of ranked) {
    if (cites.length >= maxCites) break;
    const doc = docsById.get(f.jobSheetId);
    const report = parseReport(reports[f.jobSheetId]);
    const comment = extractCommentSignals(report);
    const photo = extractPhotoPair(report);
    const themeId = classifyFindingTheme(f);

    cites.push({
      jobSheetId: f.jobSheetId,
      referenceNumber: doc?.referenceNumber ?? null,
      siteInfo: doc?.siteInfo ?? null,
      outcome: doc?.result ?? "unknown",
      findingId: f.findingId,
      severity: f.severity,
      reasonCode: f.reasonCode,
      ruleId: f.ruleId ?? null,
      fieldName: f.fieldName,
      themeId,
      snippet: findingSnippet(f) ?? comment.snippet,
      suggestedFix: truncate(asString(f.suggestedFix), 180),
      whyItMatters: truncate(asString(f.whyItMatters), 180),
      pageNumber: f.pageNumber ?? null,
      commentSnippet: comment.snippet,
      commentHasWhat: comment.hasWhat,
      commentHasNextAction: comment.hasNextAction,
      commentHasPartsStance: comment.hasPartsStance,
      commentVague: comment.vague,
      deepNoteGaps: extractDeepNoteGaps(report),
      photoPairFailed: photo.failed,
      photoPairSummary: photo.summary,
      failurePathActive: extractFailurePath(report),
      coherenceIssue: extractCoherence(report),
    });
  }

  const failurePathCards = new Set(
    cites.filter(c => c.failurePathActive === true).map(c => c.jobSheetId)
  );

  const signalRollup: EvidenceSignalRollup = {
    citesWithSnippets: cites.filter(c => Boolean(c.snippet || c.commentSnippet))
      .length,
    commentFindingCount: cites.filter(c => c.themeId === "comment_narrative")
      .length,
    missingWhatCount: cites.filter(c => c.commentHasWhat === false).length,
    missingNextOrPartsCount: cites.filter(
      c =>
        c.commentHasNextAction === false && c.commentHasPartsStance === false
    ).length,
    vagueCommentCount: cites.filter(c => c.commentVague === true).length,
    photoPairFailCount: cites.filter(c => c.photoPairFailed === true).length,
    coherenceIssueCount: cites.filter(c => Boolean(c.coherenceIssue)).length,
    failurePathCards: failurePathCards.size,
    majorCiteCount: cites.filter(
      c => c.severity === "S0" || c.severity === "S1"
    ).length,
  };

  const compactMarkdown = renderCompactMarkdown({
    engineerName: input.engineerName,
    period: input.period,
    cardsAssessed: input.documents.length,
    cites,
    signalRollup,
  });

  return {
    engineerName: input.engineerName,
    period: input.period,
    cardsAssessed: input.documents.length,
    cites,
    signalRollup,
    compactMarkdown,
  };
}

function refLabel(cite: EvidenceCite): string {
  return cite.referenceNumber || `JS-${cite.jobSheetId}`;
}

function renderCompactMarkdown(input: {
  engineerName: string;
  period: { start: string; end: string };
  cardsAssessed: number;
  cites: EvidenceCite[];
  signalRollup: EvidenceSignalRollup;
}): string {
  const lines: string[] = [
    `# Evidence dossier — ${input.engineerName}`,
    `Period: ${input.period.start} → ${input.period.end}`,
    `Cards assessed: ${input.cardsAssessed}`,
    `Signal rollup: majors=${input.signalRollup.majorCiteCount}; commentFindings=${input.signalRollup.commentFindingCount}; missingWhat=${input.signalRollup.missingWhatCount}; vague=${input.signalRollup.vagueCommentCount}; photoPairFails=${input.signalRollup.photoPairFailCount}; coherence=${input.signalRollup.coherenceIssueCount}; failurePathCards=${input.signalRollup.failurePathCards}`,
    "",
    "## Cites (use ONLY these job-sheet IDs in feedback)",
  ];

  for (const c of input.cites) {
    lines.push(
      `- ${refLabel(c)} (JS-${c.jobSheetId}) · ${c.severity} · ${c.ruleId ?? c.reasonCode} · theme=${c.themeId} · outcome=${c.outcome}`
    );
    if (c.snippet) lines.push(`  snippet: "${c.snippet}"`);
    if (c.commentSnippet && c.commentSnippet !== c.snippet) {
      lines.push(`  comment: "${c.commentSnippet}"`);
    }
    if (c.commentHasWhat === false) lines.push("  gap: missing what-failed");
    if (
      c.commentHasNextAction === false &&
      c.commentHasPartsStance === false
    ) {
      lines.push("  gap: missing next-action / parts stance");
    }
    if (c.commentVague === true) lines.push("  gap: vague/thin comment");
    if (c.deepNoteGaps.length > 0) {
      lines.push(`  deepNoteGaps: ${c.deepNoteGaps.join("; ")}`);
    }
    if (c.photoPairFailed === true) {
      lines.push(
        `  photoPair: FAIL${c.photoPairSummary ? ` — ${c.photoPairSummary}` : ""}`
      );
    }
    if (c.coherenceIssue) lines.push(`  coherence: ${c.coherenceIssue}`);
    if (c.suggestedFix) lines.push(`  suggestedFix: ${c.suggestedFix}`);
    if (c.whyItMatters) lines.push(`  whyItMatters: ${c.whyItMatters}`);
  }

  return lines.join("\n");
}

/** Allowed JS ids for LLM cite validation. */
export function dossierAllowedJobSheetIds(dossier: EvidenceDossier): Set<number> {
  return new Set(dossier.cites.map(c => c.jobSheetId));
}
