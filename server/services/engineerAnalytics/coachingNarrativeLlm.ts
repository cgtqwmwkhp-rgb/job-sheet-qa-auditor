/**
 * Round 2+ — Multi-provider coaching critic + adversarial verifier.
 *
 * Pipeline:
 *   1. Deterministic draft (Round 1) is the floor
 *   2. Writer (Claude preferred → OpenAI → Gemini) refines from dossier only
 *   3. Hard cite / snippet gates strip unsupported lines
 *   4. Optional second-provider verifier removes unsupported claims
 *
 * Fail-soft at every step. QA Lead still owns the text.
 */

import type { CoachingNarrativeDraft } from "./coachingNarrative";
import {
  dossierAllowedJobSheetIds,
  type EvidenceDossier,
} from "./evidenceDossier";
import {
  invokeCoachingLlm,
  isAnyCoachingLlmConfigured,
  modelForProvider,
  resolveCoachingVerifierProvider,
  resolveCoachingWriterProvider,
  type CoachingLlmProvider,
} from "./coachingCriticProviders";

export const FEATURE_COACHING_LLM_NARRATIVE = "FEATURE_COACHING_LLM_NARRATIVE";

export function isCoachingLlmNarrativeEnabled(): boolean {
  const raw = process.env[FEATURE_COACHING_LLM_NARRATIVE];
  if (raw === "false" || raw === "0") return false;
  if (raw === "true" || raw === "1") return true;
  return isAnyCoachingLlmConfigured();
}

export interface LlmNarrativePayload {
  opening?: unknown;
  strengths?: unknown;
  themesSummary?: unknown;
  development?: unknown;
  coachingAsks?: unknown;
  criticalAssessment?: unknown;
  evidenceAnchors?: unknown;
  patternCritique?: unknown;
  successCriteria?: unknown;
}

interface VerifierPayload {
  unsupportedLines?: unknown;
  reasons?: unknown;
}

/** Extract JS-123 style ids mentioned in text. */
export function extractCitedJobSheetIds(text: string): number[] {
  const ids: number[] = [];
  const re = /\bJS-(\d+)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const id = Number(m[1]);
    if (Number.isFinite(id)) ids.push(id);
  }
  return ids;
}

export function textOnlyUsesAllowedIds(
  text: string,
  allowed: Set<number>
): boolean {
  const cited = extractCitedJobSheetIds(text);
  if (cited.length === 0) return true;
  return cited.every(id => allowed.has(id));
}

function asStringArray(value: unknown, max: number): string[] | null {
  if (!Array.isArray(value)) return null;
  const out = value
    .map(v => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean)
    .slice(0, max);
  return out.length > 0 ? out : null;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

export function parseJsonObject<T extends object>(content: string): T | null {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1].trim() : trimmed;
  try {
    const parsed = JSON.parse(raw) as T;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1)) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function normalizeForOverlap(text: string): string {
  return text
    .toLowerCase()
    .replace(/[“”"']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Quoted spans in feedback should overlap dossier evidence when present.
 * Soft check: if a "…" quote exists, require ≥12-char overlap with dossier text.
 */
export function quotesGroundedInDossier(
  line: string,
  dossierCorpus: string
): boolean {
  const quotes: string[] = [];
  const quoteRe = /[“"]([^”"]{8,})[”"]/g;
  let qm: RegExpExecArray | null;
  while ((qm = quoteRe.exec(line)) !== null) {
    quotes.push(qm[1]);
  }
  if (quotes.length === 0) return true;
  const corpus = normalizeForOverlap(dossierCorpus);
  return quotes.every(q => {
    const nq = normalizeForOverlap(q);
    if (nq.length < 12) return true;
    if (corpus.includes(nq)) return true;
    // Allow partial overlap on longer quotes (first 40 chars)
    const head = nq.slice(0, Math.min(40, nq.length));
    return corpus.includes(head);
  });
}

function buildDossierCorpus(dossier: EvidenceDossier): string {
  return [
    dossier.compactMarkdown,
    ...dossier.cites.flatMap(c => [
      c.snippet ?? "",
      c.commentSnippet ?? "",
      c.suggestedFix ?? "",
      c.whyItMatters ?? "",
      c.photoPairSummary ?? "",
      c.coherenceIssue ?? "",
      ...c.deepNoteGaps,
    ]),
  ].join("\n");
}

export interface CiteGateStats {
  droppedInventedIds: number;
  droppedMissingCite: number;
  droppedUngroundedQuote: number;
}

/**
 * Hard gates for critical sections when the dossier has cites:
 * - no invented JS ids
 * - critical / anchors / development / patterns must cite ≥1 allowed JS
 * - quoted text must overlap dossier corpus
 */
export function applyHardCiteGates(
  lines: string[],
  allowed: Set<number>,
  dossierCorpus: string,
  options: { requireCite: boolean }
): { kept: string[]; stats: CiteGateStats } {
  const stats: CiteGateStats = {
    droppedInventedIds: 0,
    droppedMissingCite: 0,
    droppedUngroundedQuote: 0,
  };
  const kept: string[] = [];

  for (const line of lines) {
    if (!textOnlyUsesAllowedIds(line, allowed)) {
      stats.droppedInventedIds++;
      continue;
    }
    if (options.requireCite && allowed.size > 0) {
      const cites = extractCitedJobSheetIds(line).filter(id => allowed.has(id));
      if (cites.length === 0) {
        stats.droppedMissingCite++;
        continue;
      }
    }
    if (!quotesGroundedInDossier(line, dossierCorpus)) {
      stats.droppedUngroundedQuote++;
      continue;
    }
    kept.push(line);
  }

  return { kept, stats };
}

function filterLinesToAllowed(
  lines: string[] | null,
  allowed: Set<number>,
  fallback: string[],
  dossierCorpus: string,
  requireCite: boolean
): { lines: string[]; stats: CiteGateStats } {
  const candidate = lines ?? null;
  if (!candidate) {
    return {
      lines: fallback,
      stats: {
        droppedInventedIds: 0,
        droppedMissingCite: 0,
        droppedUngroundedQuote: 0,
      },
    };
  }
  const gated = applyHardCiteGates(candidate, allowed, dossierCorpus, {
    requireCite,
  });
  return {
    lines: gated.kept.length > 0 ? gated.kept : fallback,
    stats: gated.stats,
  };
}

function mergePayload(
  base: CoachingNarrativeDraft,
  payload: LlmNarrativePayload,
  allowed: Set<number>,
  dossierCorpus: string
): { draft: CoachingNarrativeDraft; gateDropped: number } {
  const opening = asNonEmptyString(payload.opening);
  const themesSummary = asNonEmptyString(payload.themesSummary);
  let gateDropped = 0;

  const strengths = filterLinesToAllowed(
    asStringArray(payload.strengths, 5),
    allowed,
    base.strengths,
    dossierCorpus,
    false
  );
  gateDropped +=
    strengths.stats.droppedInventedIds +
    strengths.stats.droppedMissingCite +
    strengths.stats.droppedUngroundedQuote;

  const development = filterLinesToAllowed(
    asStringArray(payload.development, 6),
    allowed,
    base.development,
    dossierCorpus,
    true
  );
  gateDropped +=
    development.stats.droppedInventedIds +
    development.stats.droppedMissingCite +
    development.stats.droppedUngroundedQuote;

  const coachingAsks = filterLinesToAllowed(
    asStringArray(payload.coachingAsks, 5),
    allowed,
    base.coachingAsks,
    dossierCorpus,
    false
  );
  gateDropped +=
    coachingAsks.stats.droppedInventedIds +
    coachingAsks.stats.droppedMissingCite +
    coachingAsks.stats.droppedUngroundedQuote;

  const criticalAssessment = filterLinesToAllowed(
    asStringArray(payload.criticalAssessment, 6),
    allowed,
    base.criticalAssessment,
    dossierCorpus,
    true
  );
  gateDropped +=
    criticalAssessment.stats.droppedInventedIds +
    criticalAssessment.stats.droppedMissingCite +
    criticalAssessment.stats.droppedUngroundedQuote;

  const evidenceAnchors = filterLinesToAllowed(
    asStringArray(payload.evidenceAnchors, 10),
    allowed,
    base.evidenceAnchors,
    dossierCorpus,
    true
  );
  gateDropped +=
    evidenceAnchors.stats.droppedInventedIds +
    evidenceAnchors.stats.droppedMissingCite +
    evidenceAnchors.stats.droppedUngroundedQuote;

  const patternCritique = filterLinesToAllowed(
    asStringArray(payload.patternCritique, 6),
    allowed,
    base.patternCritique,
    dossierCorpus,
    allowed.size > 0
  );
  gateDropped +=
    patternCritique.stats.droppedInventedIds +
    patternCritique.stats.droppedMissingCite +
    patternCritique.stats.droppedUngroundedQuote;

  const successCriteria = filterLinesToAllowed(
    asStringArray(payload.successCriteria, 6),
    allowed,
    base.successCriteria,
    dossierCorpus,
    false
  );
  gateDropped +=
    successCriteria.stats.droppedInventedIds +
    successCriteria.stats.droppedMissingCite +
    successCriteria.stats.droppedUngroundedQuote;

  const openingOk =
    opening &&
    textOnlyUsesAllowedIds(opening, allowed) &&
    quotesGroundedInDossier(opening, dossierCorpus);
  const themesOk =
    themesSummary &&
    textOnlyUsesAllowedIds(themesSummary, allowed) &&
    quotesGroundedInDossier(themesSummary, dossierCorpus);

  return {
    gateDropped,
    draft: {
      opening: openingOk ? opening! : base.opening,
      strengths: strengths.lines,
      themesSummary: themesOk ? themesSummary! : base.themesSummary,
      development: development.lines,
      coachingAsks: coachingAsks.lines,
      criticalAssessment: criticalAssessment.lines,
      evidenceAnchors: evidenceAnchors.lines,
      patternCritique: patternCritique.lines,
      successCriteria: successCriteria.lines,
      enrichment: base.enrichment,
    },
  };
}

const WRITER_SYSTEM = `You are a senior QA Lead writing evidence-based coaching feedback for a field engineer.
Rules (non-negotiable):
1. Second-person voice ("you"). Professional, direct, fair — never insulting or sarcastic.
2. Judge DOCUMENTATION quality only (comments, photos, coherence, completeness) — NEVER whether the asset/job physically passed.
3. Every critical, development, pattern, and evidence-anchor claim MUST cite job sheets as JS-<id> from the dossier. Inventing cards/quotes/findings is forbidden.
4. Prefer quoting short dossier snippets in quotes when criticising a card.
5. Strengths must be evidence-grounded when possible; do not invent praise.
6. Be objective and specific: name missing behaviours (what-failed, parts stance, next action, photo pairs).
7. Return ONLY valid JSON with the required keys. No markdown outside JSON.`;

function buildWriterUserPrompt(
  draft: CoachingNarrativeDraft,
  dossier: EvidenceDossier
): string {
  return `Refine this coaching pack using ONLY the evidence dossier.

## Evidence dossier (SOLE source of truth)
${dossier.compactMarkdown.slice(0, 12000)}

## Current deterministic draft (improve depth and objectivity; keep structure)
${JSON.stringify(
  {
    opening: draft.opening,
    strengths: draft.strengths,
    themesSummary: draft.themesSummary,
    development: draft.development,
    coachingAsks: draft.coachingAsks,
    criticalAssessment: draft.criticalAssessment,
    evidenceAnchors: draft.evidenceAnchors,
    patternCritique: draft.patternCritique,
    successCriteria: draft.successCriteria,
  },
  null,
  2
).slice(0, 8000)}

Return JSON with keys:
opening (string),
strengths (string[]),
themesSummary (string),
development (string[] — each line cites JS-<id>),
coachingAsks (string[]),
criticalAssessment (string[] — deep critical eye; each line cites JS-<id>),
evidenceAnchors (string[] — one cite per bullet; each cites JS-<id>),
patternCritique (string[] — cite JS-<id> when referencing cards),
successCriteria (string[] — measurable next-period criteria).`;
}

const VERIFIER_SYSTEM = `You are an adversarial QA auditor checking coaching feedback for unsupported claims.
Remove any line that is not strictly supported by the evidence dossier.
Do NOT rewrite style. Do NOT add new praise or criticism.
Return JSON only: {"unsupportedLines": string[], "reasons": string[]}.
unsupportedLines must be exact copies of lines from the draft that should be removed.`;

function buildVerifierUserPrompt(
  draft: CoachingNarrativeDraft,
  dossier: EvidenceDossier
): string {
  const candidateLines = [
    ...draft.criticalAssessment,
    ...draft.evidenceAnchors,
    ...draft.development,
    ...draft.patternCritique,
    ...draft.strengths,
  ];
  return `## Evidence dossier
${dossier.compactMarkdown.slice(0, 10000)}

## Candidate lines (remove only unsupported)
${JSON.stringify(candidateLines, null, 2).slice(0, 6000)}

Return {"unsupportedLines":[...exact lines to remove...],"reasons":[...]}`;
}

function applyVerifierRemovals(
  draft: CoachingNarrativeDraft,
  unsupported: string[]
): { draft: CoachingNarrativeDraft; rejected: number } {
  if (unsupported.length === 0) return { draft, rejected: 0 };
  const normalized = new Set(unsupported.map(s => s.trim()).filter(Boolean));
  const strip = (lines: string[]) =>
    lines.filter(line => !normalized.has(line.trim()));

  const next: CoachingNarrativeDraft = {
    ...draft,
    strengths: strip(draft.strengths),
    development: strip(draft.development),
    criticalAssessment: strip(draft.criticalAssessment),
    evidenceAnchors: strip(draft.evidenceAnchors),
    patternCritique: strip(draft.patternCritique),
  };

  // Never leave critical sections empty if verifier wiped everything — restore base via caller.
  const rejected =
    draft.strengths.length -
    next.strengths.length +
    (draft.development.length - next.development.length) +
    (draft.criticalAssessment.length - next.criticalAssessment.length) +
    (draft.evidenceAnchors.length - next.evidenceAnchors.length) +
    (draft.patternCritique.length - next.patternCritique.length);

  return { draft: next, rejected };
}

function withEnrichment(
  draft: CoachingNarrativeDraft,
  meta: CoachingNarrativeDraft["enrichment"]
): CoachingNarrativeDraft {
  return { ...draft, enrichment: meta };
}

function restoreIfEmptied(
  enriched: CoachingNarrativeDraft,
  base: CoachingNarrativeDraft
): CoachingNarrativeDraft {
  return {
    ...enriched,
    criticalAssessment:
      enriched.criticalAssessment.length > 0
        ? enriched.criticalAssessment
        : base.criticalAssessment,
    evidenceAnchors:
      enriched.evidenceAnchors.length > 0
        ? enriched.evidenceAnchors
        : base.evidenceAnchors,
    development:
      enriched.development.length > 0 ? enriched.development : base.development,
    strengths:
      enriched.strengths.length > 0 ? enriched.strengths : base.strengths,
    coachingAsks:
      enriched.coachingAsks.length > 0
        ? enriched.coachingAsks
        : base.coachingAsks,
    successCriteria:
      enriched.successCriteria.length > 0
        ? enriched.successCriteria
        : base.successCriteria,
    patternCritique:
      enriched.patternCritique.length > 0
        ? enriched.patternCritique
        : base.patternCritique,
  };
}

/**
 * Enrich a deterministic narrative with multi-provider critic + verifier.
 * Fail-soft: returns base draft on disable / total failure.
 */
export async function enrichCoachingNarrativeWithLlm(input: {
  draft: CoachingNarrativeDraft;
  dossier: EvidenceDossier;
  forceMock?: boolean;
}): Promise<CoachingNarrativeDraft> {
  const { draft, dossier } = input;
  const allowed = dossierAllowedJobSheetIds(dossier);
  const dossierCorpus = buildDossierCorpus(dossier);

  if (!isCoachingLlmNarrativeEnabled() && !input.forceMock) {
    return draft;
  }

  const writer: CoachingLlmProvider = input.forceMock
    ? "mock"
    : resolveCoachingWriterProvider();

  if (writer === "none") {
    return draft;
  }

  if (writer === "mock") {
    return withEnrichment(
      {
        ...draft,
        criticalAssessment: [
          ...draft.criticalAssessment,
          "[Mock critic] Re-read each dossier cite before the 1:1 and ask the engineer to rewrite one thin comment live.",
        ],
      },
      {
        provider: "mock",
        model: modelForProvider("mock"),
        enrichedAt: new Date().toISOString(),
        usedLlm: false,
        writerProvider: "mock",
        verifierProvider: "none",
        verifierRejectedLines: 0,
        citeGateDroppedLines: 0,
      }
    );
  }

  let gateDropped = 0;
  let verifierRejected = 0;
  let working = draft;
  let writerModel = modelForProvider(writer);
  let verifierProvider: CoachingLlmProvider = "none";
  let verifierModel: string | null = null;

  try {
    const writerResult = await invokeCoachingLlm({
      provider: writer,
      system: WRITER_SYSTEM,
      user: buildWriterUserPrompt(draft, dossier),
      maxTokens: 2800,
    });
    writerModel = writerResult.model;

    if (writerResult.ok && writerResult.text.trim()) {
      const payload = parseJsonObject<LlmNarrativePayload>(writerResult.text);
      if (payload) {
        const merged = mergePayload(draft, payload, allowed, dossierCorpus);
        gateDropped += merged.gateDropped;
        working = restoreIfEmptied(merged.draft, draft);
      } else {
        console.warn(
          "[CoachingNarrativeLlm] Writer JSON parse failed — keeping deterministic draft"
        );
      }
    } else {
      console.warn(
        "[CoachingNarrativeLlm] Writer failed:",
        writerResult.error || "empty"
      );
    }

    verifierProvider = resolveCoachingVerifierProvider(writer);
    if (verifierProvider !== "none") {
      const verifierResult = await invokeCoachingLlm({
        provider: verifierProvider,
        system: VERIFIER_SYSTEM,
        user: buildVerifierUserPrompt(working, dossier),
        maxTokens: 1200,
      });
      verifierModel = verifierResult.model;
      if (verifierResult.ok && verifierResult.text.trim()) {
        const vPayload = parseJsonObject<VerifierPayload>(verifierResult.text);
        const unsupported = asStringArray(vPayload?.unsupportedLines, 40) ?? [];
        const applied = applyVerifierRemovals(working, unsupported);
        verifierRejected = applied.rejected;
        working = restoreIfEmptied(applied.draft, draft);
      } else {
        console.warn(
          "[CoachingNarrativeLlm] Verifier failed (non-fatal):",
          verifierResult.error || "empty"
        );
        verifierProvider = "none";
      }
    }

    // Final safety pass: never allow invented ids / ungrounded quotes through.
    // Missing-cite is enforced at merge time for LLM lines; deterministic
    // thematic paragraphs may omit JS ids and must remain usable as floor.
    const finalCritical = applyHardCiteGates(
      working.criticalAssessment,
      allowed,
      dossierCorpus,
      { requireCite: false }
    );
    const finalAnchors = applyHardCiteGates(
      working.evidenceAnchors,
      allowed,
      dossierCorpus,
      { requireCite: false }
    );
    gateDropped +=
      finalCritical.stats.droppedInventedIds +
      finalCritical.stats.droppedMissingCite +
      finalCritical.stats.droppedUngroundedQuote +
      finalAnchors.stats.droppedInventedIds +
      finalAnchors.stats.droppedMissingCite +
      finalAnchors.stats.droppedUngroundedQuote;

    working = restoreIfEmptied(
      {
        ...working,
        criticalAssessment: finalCritical.kept,
        evidenceAnchors: finalAnchors.kept,
      },
      draft
    );

    return withEnrichment(working, {
      provider: writer,
      model: writerModel,
      enrichedAt: new Date().toISOString(),
      usedLlm: true,
      writerProvider: writer,
      verifierProvider: verifierProvider === "none" ? "none" : verifierProvider,
      verifierModel,
      verifierRejectedLines: verifierRejected,
      citeGateDroppedLines: gateDropped,
    });
  } catch (error) {
    console.warn(
      "[CoachingNarrativeLlm] Enrichment failed (non-fatal):",
      error
    );
    return draft;
  }
}
