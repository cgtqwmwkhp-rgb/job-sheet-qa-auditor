/**
 * LLM Deep Note advisory for engineer comments — non-blocking, structured gaps.
 * Gated by FEATURE_COMMENT_LLM_ADVISORY (default off). Never sole hard-fail.
 *
 * Honesty: never label provider "gemini" unless usedLlm === true and a real
 * network call succeeded.
 */

import type { AiPersona } from "../aiPersona";
import { buildPersonaPromptBlock, strictnessBand } from "../aiPersona";
import type { CommentQualityResult, CommentQualitySignals } from "./index";

export const FEATURE_COMMENT_LLM_ADVISORY = "FEATURE_COMMENT_LLM_ADVISORY";

export function isCommentLlmAdvisoryEnabled(): boolean {
  return process.env[FEATURE_COMMENT_LLM_ADVISORY] === "true";
}

export interface CommentDeepNoteAdvisory {
  enabled: boolean;
  provider: "deterministic" | "gemini" | "mock" | "gemini-ready";
  model: string;
  /** True only when a live LLM call produced this advisory. */
  usedLlm: boolean;
  completenessScore: number;
  toneScore: number;
  clarityScore: number;
  flags: Array<{ type: "warning" | "error" | "success"; message: string }>;
  summary: string;
  coachRewrite: string;
  gaps: string[];
  recommendEscalate: boolean;
  persona?: {
    version: string;
    strictness: number;
    band: string;
  };
}

/**
 * Build a deterministic Deep Note from comment-quality scores (no network).
 * Used always; Gemini path can enrich when flag + key present.
 */
export function buildDeterministicDeepNote(
  result: CommentQualityResult,
  persona?: AiPersona | null
): CommentDeepNoteAdvisory {
  const s = result.signals;
  const flags: CommentDeepNoteAdvisory["flags"] = [];
  const gaps: string[] = [];
  const personaMeta = persona
    ? {
        version: persona.version,
        strictness: persona.strictness,
        band: strictnessBand(persona.strictness),
      }
    : undefined;

  // No narrative and not on failure path → nothing useful to coach.
  if (!s.present && !s.onFailurePath) {
    return {
      enabled: false,
      provider: "deterministic",
      model: "comment-quality-v1",
      usedLlm: false,
      completenessScore: 100,
      toneScore: 100,
      clarityScore: 100,
      flags: [
        {
          type: "success",
          message: "No engineer comments — Deep Note skipped.",
        },
      ],
      summary: "No comment narrative to assess.",
      coachRewrite: "",
      gaps: [],
      recommendEscalate: false,
      persona: personaMeta,
    };
  }

  if (!s.onFailurePath && s.present) {
    flags.push({
      type: "success",
      message:
        "Standard path — coaching engineer overview for completeness (not a hard fail).",
    });
  }

  if (!s.present) {
    flags.push({
      type: "error",
      message: "Missing clinical diagnosis narrative (COMMENT-C010).",
    });
    gaps.push("Write what failed, parts stance, and next action.");
  } else {
    if (s.hasWhat) {
      flags.push({
        type: "success",
        message: `Defect/fault language detected: "${s.snippet.slice(0, 80)}"`,
      });
    } else {
      flags.push({
        type: "error",
        message: "Missing clear 'what failed' statement.",
      });
      gaps.push("Name the defect (e.g. cracked coupling, worn tread).");
    }
    if (s.hasImpact) {
      flags.push({
        type: "success",
        message: "Impact / safety stance language present.",
      });
    } else if (s.onFailurePath) {
      flags.push({
        type: "warning",
        message: "Impact / unsafe-VOR stance not explicit.",
      });
      gaps.push("State impact (unsafe / VOR / downtime) where relevant.");
    }
    if (s.hasNextAction || s.hasPartsStance) {
      flags.push({
        type: "success",
        message: s.hasNextAction
          ? "Next action language present."
          : "Parts stance language present.",
      });
    } else {
      flags.push({
        type: "warning",
        message: "Missing next action or parts stance.",
      });
      gaps.push("State return visit / parts ordered / no further action.");
    }
    if (s.isVagueOnly || s.isTooThin) {
      flags.push({
        type: "warning",
        message: "Comments are vague or too thin for clinical QA.",
      });
      gaps.push("Replace VOR / see above with a full defect sentence.");
    }
  }

  const recommendEscalate = result.findings.some(f => f.severity === "S1");
  const coachRewrite =
    gaps.length === 0
      ? s.snippet
      : `Coupling/defect: [describe fault]. Impact: unsafe/VOR as applicable. Parts: ${
          s.partsStillRequired
            ? s.partsStillSnippet || "still required — list items"
            : "fitted / none"
        }. Next: ${s.returnVisit ? "return visit to fit/retest" : "no further action"}.`;

  return {
    enabled: true,
    provider: "deterministic",
    model: "comment-quality-v1",
    usedLlm: false,
    completenessScore: result.scores.completeness,
    toneScore: 90,
    clarityScore: result.scores.clarity,
    flags,
    summary:
      gaps.length === 0
        ? "Clinical narrative covers defect and follow-up stance."
        : `Gaps to close: ${gaps.join(" ")}`,
    coachRewrite,
    gaps,
    recommendEscalate,
    persona: personaMeta,
  };
}

/**
 * Optional Gemini enrichment — fail-soft; falls back to deterministic.
 * Never sets provider "gemini" without a successful network call.
 */
export async function buildCommentDeepNoteAdvisory(
  result: CommentQualityResult,
  options: { forceMockGemini?: boolean; persona?: AiPersona | null } = {}
): Promise<CommentDeepNoteAdvisory> {
  const base = buildDeterministicDeepNote(result, options.persona);

  if (!isCommentLlmAdvisoryEnabled() && !options.forceMockGemini) {
    return base;
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || options.forceMockGemini) {
    return {
      ...base,
      provider: "mock",
      model: "mock-gemini-deep-note",
      usedLlm: false,
      summary: `${base.summary} [LLM advisory mock — deterministic scores retained.]`,
    };
  }

  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const personaBlock = options.persona
    ? buildPersonaPromptBlock(options.persona)
    : "";
  const prompt = `You are a senior field-service QA coach reviewing engineer comments.
Assess documentation quality only. Do not decide asset pass/fail and do not invent facts.
Return JSON only with this shape:
{"completenessScore":0-100,"toneScore":0-100,"clarityScore":0-100,"gaps":["string"],"summary":"string","coachRewrite":"string","recommendEscalate":boolean}
The deterministic COMMENT-C rubric remains authoritative; provide advisory coaching.

${personaBlock ? `${personaBlock}\n` : ""}
Comment: ${result.signals.snippet.slice(0, 2000)}
Failure path: ${result.signals.onFailurePath}
Parts still required: ${result.signals.partsStillRequired}
Return visit: ${result.signals.returnVisit}
Deterministic gaps: ${JSON.stringify(base.gaps)}
Deterministic scores: ${JSON.stringify(result.scores)}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 768,
          responseMimeType: "application/json",
        },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return base;

    const body = (await response.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };
    const text = body.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) return base;
    const parsed = JSON.parse(text) as {
      completenessScore?: unknown;
      toneScore?: unknown;
      clarityScore?: unknown;
      gaps?: unknown;
      summary?: unknown;
      coachRewrite?: unknown;
      recommendEscalate?: unknown;
    };
    const score = (value: unknown, fallback: number): number =>
      typeof value === "number" && Number.isFinite(value)
        ? Math.max(0, Math.min(100, Math.round(value)))
        : fallback;
    const llmGaps = Array.isArray(parsed.gaps)
      ? parsed.gaps
          .filter(
            (gap): gap is string =>
              typeof gap === "string" && gap.trim().length > 0
          )
          .map(gap => gap.trim().slice(0, 300))
          .slice(0, 8)
      : [];

    return {
      ...base,
      provider: "gemini",
      model,
      usedLlm: true,
      completenessScore: score(
        parsed.completenessScore,
        base.completenessScore
      ),
      toneScore: score(parsed.toneScore, base.toneScore),
      clarityScore: score(parsed.clarityScore, base.clarityScore),
      gaps: Array.from(new Set([...base.gaps, ...llmGaps])),
      summary:
        typeof parsed.summary === "string" && parsed.summary.trim()
          ? parsed.summary.trim().slice(0, 500)
          : base.summary,
      coachRewrite:
        typeof parsed.coachRewrite === "string" && parsed.coachRewrite.trim()
          ? parsed.coachRewrite.trim().slice(0, 1000)
          : base.coachRewrite,
      recommendEscalate:
        base.recommendEscalate || parsed.recommendEscalate === true,
    };
  } catch {
    return base;
  }
}

export function mapDeepNoteFromSignals(
  signals: CommentQualitySignals | null | undefined,
  advisory: CommentDeepNoteAdvisory | null | undefined
): CommentDeepNoteAdvisory | null {
  if (advisory) return advisory;
  if (!signals) return null;
  return buildDeterministicDeepNote({
    signals,
    findings: [],
    summary: "",
    scores: {
      completeness: signals.present ? (signals.hasWhat ? 70 : 40) : 0,
      clarity: signals.isVagueOnly ? 25 : signals.isTooThin ? 45 : 80,
      actionability: signals.hasNextAction ? 80 : 30,
    },
  });
}
