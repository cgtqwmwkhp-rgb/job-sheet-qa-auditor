/**
 * Round 2 — LLM critic/refiner for coaching narrative.
 * Grounded ONLY in the evidence dossier. Fail-soft; cite-validated.
 * Gated by FEATURE_COACHING_LLM_NARRATIVE (default ON when Gemini configured).
 */

import { invokeLLM, isLLMConfigured } from "../../_core/llm";
import type { CoachingNarrativeDraft } from "./coachingNarrative";
import {
  dossierAllowedJobSheetIds,
  type EvidenceDossier,
} from "./evidenceDossier";

export const FEATURE_COACHING_LLM_NARRATIVE = "FEATURE_COACHING_LLM_NARRATIVE";

export function isCoachingLlmNarrativeEnabled(): boolean {
  const raw = process.env[FEATURE_COACHING_LLM_NARRATIVE];
  if (raw === "false") return false;
  if (raw === "true") return true;
  // Default ON when Gemini is available — coaching quality depends on depth.
  return isLLMConfigured();
}

interface LlmNarrativePayload {
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

function textOnlyUsesAllowedIds(
  text: string,
  allowed: Set<number>
): boolean {
  const cited = extractCitedJobSheetIds(text);
  if (cited.length === 0) return true;
  return cited.every(id => allowed.has(id));
}

function filterLinesToAllowed(
  lines: string[] | null,
  allowed: Set<number>,
  fallback: string[]
): string[] {
  if (!lines) return fallback;
  const kept = lines.filter(line => textOnlyUsesAllowedIds(line, allowed));
  return kept.length > 0 ? kept : fallback;
}

function mergePayload(
  base: CoachingNarrativeDraft,
  payload: LlmNarrativePayload,
  allowed: Set<number>
): CoachingNarrativeDraft {
  const opening = asNonEmptyString(payload.opening);
  const themesSummary = asNonEmptyString(payload.themesSummary);

  return {
    opening:
      opening && textOnlyUsesAllowedIds(opening, allowed)
        ? opening
        : base.opening,
    strengths: filterLinesToAllowed(
      asStringArray(payload.strengths, 5),
      allowed,
      base.strengths
    ),
    themesSummary:
      themesSummary && textOnlyUsesAllowedIds(themesSummary, allowed)
        ? themesSummary
        : base.themesSummary,
    development: filterLinesToAllowed(
      asStringArray(payload.development, 6),
      allowed,
      base.development
    ),
    coachingAsks: filterLinesToAllowed(
      asStringArray(payload.coachingAsks, 5),
      allowed,
      base.coachingAsks
    ),
    criticalAssessment: filterLinesToAllowed(
      asStringArray(payload.criticalAssessment, 6),
      allowed,
      base.criticalAssessment
    ),
    evidenceAnchors: filterLinesToAllowed(
      asStringArray(payload.evidenceAnchors, 10),
      allowed,
      base.evidenceAnchors
    ),
    patternCritique: filterLinesToAllowed(
      asStringArray(payload.patternCritique, 6),
      allowed,
      base.patternCritique
    ),
    successCriteria: filterLinesToAllowed(
      asStringArray(payload.successCriteria, 6),
      allowed,
      base.successCriteria
    ),
    enrichment: base.enrichment,
  };
}

function parseJsonContent(content: string): LlmNarrativePayload | null {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1].trim() : trimmed;
  try {
    const parsed = JSON.parse(raw) as LlmNarrativePayload;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1)) as LlmNarrativePayload;
      } catch {
        return null;
      }
    }
    return null;
  }
}

const SYSTEM_PROMPT = `You are a senior QA Lead writing evidence-based coaching feedback for a field engineer.
Rules:
1. Second-person voice ("you"). Professional, direct, fair — never insulting.
2. Judge DOCUMENTATION quality only (comments, photos, coherence, completeness) — not whether the asset/job physically passed.
3. Every critical claim MUST cite job sheets using JS-<id> that appear in the evidence dossier. Do not invent cards, quotes, or findings.
4. Be specific: quote or paraphrase dossier snippets; name missing behaviours (what-failed, parts stance, next action, photo pairs).
5. Strengths must also be evidence-grounded when possible.
6. Return ONLY valid JSON matching the schema. No markdown outside JSON.`;

/**
 * Enrich a deterministic narrative with an LLM critical pass.
 * Fail-soft: returns base draft on any error / disabled flag.
 */
export async function enrichCoachingNarrativeWithLlm(input: {
  draft: CoachingNarrativeDraft;
  dossier: EvidenceDossier;
  forceMock?: boolean;
}): Promise<CoachingNarrativeDraft> {
  const { draft, dossier } = input;
  const allowed = dossierAllowedJobSheetIds(dossier);

  if (!isCoachingLlmNarrativeEnabled() && !input.forceMock) {
    return draft;
  }

  if (input.forceMock || !isLLMConfigured()) {
    return {
      ...draft,
      enrichment: {
        provider: "mock",
        model: "mock-coaching-critic",
        enrichedAt: new Date().toISOString(),
        usedLlm: false,
      },
      criticalAssessment: [
        ...draft.criticalAssessment,
        "[Mock critic] Re-read each dossier cite before the 1:1 and ask the engineer to rewrite one thin comment live.",
      ],
    };
  }

  const userPrompt = `Refine this coaching pack using ONLY the evidence dossier.

## Evidence dossier
${dossier.compactMarkdown.slice(0, 12000)}

## Current draft (improve depth and objectivity; keep structure)
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
development (string[]),
coachingAsks (string[]),
criticalAssessment (string[] — deep critical eye, evidence-cited),
evidenceAnchors (string[] — one cite per bullet),
patternCritique (string[]),
successCriteria (string[] — measurable next-period criteria).`;

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      maxTokens: 2500,
      responseFormat: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    const text =
      typeof content === "string"
        ? content
        : Array.isArray(content)
          ? content
              .map(part =>
                typeof part === "object" &&
                part &&
                "text" in part &&
                typeof (part as { text?: unknown }).text === "string"
                  ? (part as { text: string }).text
                  : ""
              )
              .join("")
          : "";

    const payload = parseJsonContent(text);
    if (!payload) {
      console.warn(
        "[CoachingNarrativeLlm] Failed to parse LLM JSON — keeping deterministic draft"
      );
      return draft;
    }

    const merged = mergePayload(draft, payload, allowed);
    return {
      ...merged,
      enrichment: {
        provider: "gemini",
        model:
          process.env.JUDGMENT_MODEL?.trim() ||
          process.env.GEMINI_MODEL?.trim() ||
          "gemini-2.5-pro",
        enrichedAt: new Date().toISOString(),
        usedLlm: true,
      },
    };
  } catch (error) {
    console.warn(
      "[CoachingNarrativeLlm] Enrichment failed (non-fatal):",
      error
    );
    return draft;
  }
}
