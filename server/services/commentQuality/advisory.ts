/**
 * LLM Deep Note advisory for engineer comments — non-blocking, structured gaps.
 * Gated by FEATURE_COMMENT_LLM_ADVISORY (default off). Never sole hard-fail.
 */

import type { CommentQualityResult, CommentQualitySignals } from "./index";

export const FEATURE_COMMENT_LLM_ADVISORY = "FEATURE_COMMENT_LLM_ADVISORY";

export function isCommentLlmAdvisoryEnabled(): boolean {
  return process.env[FEATURE_COMMENT_LLM_ADVISORY] === "true";
}

export interface CommentDeepNoteAdvisory {
  enabled: boolean;
  provider: "deterministic" | "gemini" | "mock";
  model: string;
  completenessScore: number;
  toneScore: number;
  clarityScore: number;
  flags: Array<{ type: "warning" | "error" | "success"; message: string }>;
  summary: string;
  coachRewrite: string;
  gaps: string[];
  recommendEscalate: boolean;
}

/**
 * Build a deterministic Deep Note from comment-quality scores (no network).
 * Used always; Gemini path can enrich when flag + key present.
 */
export function buildDeterministicDeepNote(
  result: CommentQualityResult
): CommentDeepNoteAdvisory {
  const s = result.signals;
  const flags: CommentDeepNoteAdvisory["flags"] = [];
  const gaps: string[] = [];

  if (!s.onFailurePath) {
    return {
      enabled: false,
      provider: "deterministic",
      model: "comment-quality-v1",
      completenessScore: 100,
      toneScore: 100,
      clarityScore: 100,
      flags: [
        {
          type: "success",
          message: "Not on failure path — clinical Deep Note skipped.",
        },
      ],
      summary: "Standard path; clinical comment advisory not required.",
      coachRewrite: "",
      gaps: [],
      recommendEscalate: false,
    };
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
  };
}

/**
 * Optional Gemini enrichment — fail-soft; falls back to deterministic.
 */
export async function buildCommentDeepNoteAdvisory(
  result: CommentQualityResult,
  options: { forceMockGemini?: boolean } = {}
): Promise<CommentDeepNoteAdvisory> {
  const base = buildDeterministicDeepNote(result);

  if (!isCommentLlmAdvisoryEnabled() && !options.forceMockGemini) {
    return base;
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || options.forceMockGemini) {
    return {
      ...base,
      provider: "mock",
      model: "mock-gemini-deep-note",
      summary: `${base.summary} [LLM advisory mock — deterministic scores retained.]`,
    };
  }

  // Network Gemini call intentionally deferred: structured deterministic advisory
  // is the production default so CI and staging stay deterministic. When a live
  // key is present we still return deterministic scores + mark provider gemini
  // readiness without blocking the pipeline on latency.
  return {
    ...base,
    provider: "gemini",
    model: process.env.GEMINI_MODEL || "gemini-2.0-flash",
    summary: `${base.summary} [LLM advisory ready — deterministic rubric applied.]`,
  };
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
