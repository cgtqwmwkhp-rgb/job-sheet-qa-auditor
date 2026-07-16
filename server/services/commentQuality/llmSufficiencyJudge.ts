/**
 * Per-sheet senior-engineer sufficiency judge (advisory only).
 *
 * Floor = deterministic rubric from COMMENT-C signals.
 * Optional Gemini enrich when FEATURE_SHEET_SUFFICIENCY_LLM=true + GEMINI_API_KEY.
 * Org AI Persona shapes soft gaps + LLM prompt — never sole hard-fail.
 */

import type { AiPersona } from "../aiPersona";
import {
  buildPersonaPromptBlock,
  personaSoftGaps,
  strictnessBand,
} from "../aiPersona";
import type { CommentQualityResult } from "./index";

export const FEATURE_SHEET_SUFFICIENCY_LLM = "FEATURE_SHEET_SUFFICIENCY_LLM";

export function isSheetSufficiencyLlmEnabled(): boolean {
  return process.env[FEATURE_SHEET_SUFFICIENCY_LLM] === "true";
}

export interface SheetSufficiencyDossier {
  commentSnippet: string;
  onFailurePath: boolean;
  failMarkCount: number;
  partsSummary?: string | null;
  photoSummary?: string | null;
  jobSummarySignals?: string | null;
}

export interface SheetSufficiencyAdvisory {
  enabled: boolean;
  usedLlm: boolean;
  provider: "deterministic" | "gemini" | "mock";
  model: string;
  adequate: boolean | null;
  confidence: number;
  gaps: string[];
  summary: string;
  /** Advisory only — never emit as hard findings from this module. */
  advisoryOnly: true;
  persona?: {
    version: string;
    strictness: number;
    band: string;
  };
}

export function buildDeterministicSufficiencyAdvisory(
  result: CommentQualityResult,
  dossier: SheetSufficiencyDossier,
  persona?: AiPersona | null
): SheetSufficiencyAdvisory {
  const s = result.signals;
  const personaMeta = persona
    ? {
        version: persona.version,
        strictness: persona.strictness,
        band: strictnessBand(persona.strictness),
      }
    : undefined;

  if (!dossier.onFailurePath && !s.onFailurePath) {
    return {
      enabled: false,
      usedLlm: false,
      provider: "deterministic",
      model: "sufficiency-rubric-v1",
      adequate: null,
      confidence: 1,
      gaps: [],
      summary: "Not on failure path — sufficiency judge skipped.",
      advisoryOnly: true,
      persona: personaMeta,
    };
  }

  const gaps: string[] = [];
  if (!s.present) gaps.push("Missing clinical narrative (what failed).");
  if (s.present && !s.hasWhat) gaps.push("No clear defect / fault statement.");
  if (s.present && !s.hasNextAction && !s.hasPartsStance) {
    gaps.push("No next action or parts stance.");
  }
  if (s.isVagueOnly || s.isTooThin) {
    gaps.push("Narrative too thin / vague for senior-engineer review.");
  }
  if (dossier.failMarkCount > 0 && !s.hasWhat) {
    gaps.push(
      `Fail marks present (${dossier.failMarkCount}) but comment lacks defect detail.`
    );
  }
  if (
    dossier.partsSummary &&
    /still required|parts/i.test(dossier.partsSummary) &&
    !s.hasPartsStance
  ) {
    gaps.push("Parts outstanding signal without parts stance in comments.");
  }

  if (persona) {
    gaps.push(
      ...personaSoftGaps({
        persona,
        onFailurePath: true,
        hasWhat: s.hasWhat,
        hasNextAction: s.hasNextAction,
        hasPartsStance: s.hasPartsStance,
        isVagueOnly: s.isVagueOnly || s.isTooThin,
        commentSnippet: dossier.commentSnippet,
      })
    );
  }

  const uniqueGaps = Array.from(new Set(gaps));
  const adequate = uniqueGaps.length === 0;
  return {
    enabled: true,
    usedLlm: false,
    provider: "deterministic",
    model: "sufficiency-rubric-v1",
    adequate,
    confidence: adequate ? 0.75 : 0.7,
    gaps: uniqueGaps,
    summary: adequate
      ? "Rubric: write-up appears sufficient for failure-path documentation."
      : `Rubric gaps: ${uniqueGaps.join(" ")}`,
    advisoryOnly: true,
    persona: personaMeta,
  };
}

async function enrichWithGemini(
  floor: SheetSufficiencyAdvisory,
  dossier: SheetSufficiencyDossier,
  persona?: AiPersona | null
): Promise<SheetSufficiencyAdvisory> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return {
      ...floor,
      provider: "mock",
      model: "mock-sufficiency",
      usedLlm: false,
      summary: `${floor.summary} [sufficiency LLM mock — no GEMINI_API_KEY]`,
    };
  }

  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const personaBlock = persona ? buildPersonaPromptBlock(persona) : "";
  const prompt = `You are a senior field-service QA engineer reviewing one job sheet write-up.
Judge whether the engineer commentary is SUFFICIENT documentation given Fail marks / parts / photos.
Return JSON only: {"adequate":boolean,"confidence":0-1,"gaps":string[],"summary":string}
Do not invent job sheet IDs. Stay advisory — documentation quality only, not asset pass/fail.

${personaBlock ? `${personaBlock}\n` : ""}
Comment snippet:
${dossier.commentSnippet.slice(0, 2000)}

Context:
failMarkCount=${dossier.failMarkCount}
partsSummary=${dossier.partsSummary ?? "n/a"}
photoSummary=${dossier.photoSummary ?? "n/a"}
jobSummary=${dossier.jobSummarySignals ?? "n/a"}
rubricGaps=${JSON.stringify(floor.gaps)}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 512,
          responseMimeType: "application/json",
        },
      }),
    });
    if (!res.ok) {
      return {
        ...floor,
        summary: `${floor.summary} [sufficiency LLM HTTP ${res.status} — rubric retained]`,
      };
    }
    const body = (await res.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };
    const text = body.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
    const parsed = JSON.parse(text) as {
      adequate?: boolean;
      confidence?: number;
      gaps?: string[];
      summary?: string;
    };
    const gaps = Array.isArray(parsed.gaps)
      ? parsed.gaps
          .filter(
            (g): g is string => typeof g === "string" && g.trim().length > 0
          )
          .slice(0, 8)
      : floor.gaps;
    const mergedGaps = Array.from(new Set([...floor.gaps, ...gaps]));
    const llmSaysOk =
      typeof parsed.adequate === "boolean" ? parsed.adequate : true;
    return {
      enabled: true,
      usedLlm: true,
      provider: "gemini",
      model,
      adequate: mergedGaps.length === 0 && llmSaysOk,
      confidence:
        typeof parsed.confidence === "number"
          ? Math.max(0, Math.min(1, parsed.confidence))
          : floor.confidence,
      gaps: mergedGaps,
      summary:
        typeof parsed.summary === "string" && parsed.summary.trim()
          ? parsed.summary.trim().slice(0, 500)
          : floor.summary,
      advisoryOnly: true,
      persona: floor.persona,
    };
  } catch (err) {
    return {
      ...floor,
      summary: `${floor.summary} [sufficiency LLM failed — rubric retained: ${
        err instanceof Error ? err.message : "error"
      }]`,
    };
  }
}

/**
 * Build per-sheet sufficiency advisory. Fail-soft; never hard-fail.
 */
export async function buildSheetSufficiencyAdvisory(
  result: CommentQualityResult,
  dossier: SheetSufficiencyDossier,
  options: { forceMock?: boolean; persona?: AiPersona | null } = {}
): Promise<SheetSufficiencyAdvisory> {
  const floor = buildDeterministicSufficiencyAdvisory(
    result,
    dossier,
    options.persona
  );
  if (!isSheetSufficiencyLlmEnabled() && !options.forceMock) {
    return floor;
  }
  if (options.forceMock || !process.env.GEMINI_API_KEY?.trim()) {
    return {
      ...floor,
      provider: "mock",
      model: "mock-sufficiency",
      usedLlm: false,
      summary: `${floor.summary} [sufficiency LLM mock]`,
    };
  }
  return enrichWithGemini(floor, dossier, options.persona);
}
