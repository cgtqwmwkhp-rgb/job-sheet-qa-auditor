/**
 * Deep Note honesty + per-sheet sufficiency advisory contracts.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  buildCommentDeepNoteAdvisory,
  buildDeterministicDeepNote,
  FEATURE_COMMENT_LLM_ADVISORY,
} from "../../services/commentQuality/advisory";
import {
  buildDeterministicSufficiencyAdvisory,
  buildSheetSufficiencyAdvisory,
  FEATURE_SHEET_SUFFICIENCY_LLM,
} from "../../services/commentQuality/llmSufficiencyJudge";
import type { CommentQualityResult } from "../../services/commentQuality";

function sampleResult(
  overrides: Partial<CommentQualityResult["signals"]> = {}
): CommentQualityResult {
  return {
    signals: {
      onFailurePath: true,
      present: true,
      hasWhat: false,
      hasPartsStance: false,
      hasNextAction: false,
      hasImpact: false,
      isVagueOnly: false,
      isTooThin: false,
      coherent: false,
      returnVisit: false,
      partsStillRequired: false,
      partsStillSnippet: "",
      snippet: "Done as requested",
      wordCount: 3,
      ...overrides,
    },
    findings: [],
    summary: "test",
    scores: { completeness: 40, clarity: 50, actionability: 20 },
  };
}

describe("Deep Note honesty", () => {
  const prevAdv = process.env[FEATURE_COMMENT_LLM_ADVISORY];
  const prevKey = process.env.GEMINI_API_KEY;

  afterEach(() => {
    vi.restoreAllMocks();
    if (prevAdv === undefined) delete process.env[FEATURE_COMMENT_LLM_ADVISORY];
    else process.env[FEATURE_COMMENT_LLM_ADVISORY] = prevAdv;
    if (prevKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = prevKey;
  });

  it("deterministic floor never claims usedLlm", () => {
    const note = buildDeterministicDeepNote(sampleResult());
    expect(note.usedLlm).toBe(false);
    expect(note.provider).toBe("deterministic");
  });

  it("restores deterministic advisory when the live Gemini call fails", async () => {
    process.env[FEATURE_COMMENT_LLM_ADVISORY] = "true";
    process.env.GEMINI_API_KEY = "test-key-not-used";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      })
    );
    const note = await buildCommentDeepNoteAdvisory(sampleResult());
    expect(note.usedLlm).toBe(false);
    expect(note.provider).toBe("deterministic");
  });

  it("uses Gemini only after a structured live response", async () => {
    process.env[FEATURE_COMMENT_LLM_ADVISORY] = "true";
    process.env.GEMINI_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              candidates: [
                {
                  content: {
                    parts: [
                      {
                        text: JSON.stringify({
                          completenessScore: 62,
                          toneScore: 88,
                          clarityScore: 71,
                          gaps: ["Name the failed component."],
                          summary: "The note needs a specific component.",
                          coachRewrite:
                            "Coupling cracked; return visit required.",
                          recommendEscalate: false,
                        }),
                      },
                    ],
                  },
                },
              ],
            }),
            { status: 200 }
          )
      )
    );

    const note = await buildCommentDeepNoteAdvisory(sampleResult());
    expect(note.usedLlm).toBe(true);
    expect(note.provider).toBe("gemini");
    expect(note.completenessScore).toBe(62);
    expect(note.gaps).toContain("Name the failed component.");
  });

  it("UI badge uses Rubric advisory when usedLlm false", () => {
    const pane = readFileSync(
      path.join(process.cwd(), "client/src/components/DeepNoteAnalysis.tsx"),
      "utf8"
    );
    expect(pane).toContain("Rubric advisory");
    expect(pane).toContain("usedLlm");
  });

  it("HelpCenter no longer claims Sentiment LLM theater", () => {
    const help = readFileSync(
      path.join(process.cwd(), "client/src/pages/HelpCenter.tsx"),
      "utf8"
    );
    expect(help).not.toMatch(/Sentiment \(is it/);
    expect(help).toMatch(/COMMENT-C/);
  });
});

describe("Sheet sufficiency advisory", () => {
  const prev = process.env[FEATURE_SHEET_SUFFICIENCY_LLM];

  beforeEach(() => {
    delete process.env[FEATURE_SHEET_SUFFICIENCY_LLM];
  });

  afterEach(() => {
    if (prev === undefined) delete process.env[FEATURE_SHEET_SUFFICIENCY_LLM];
    else process.env[FEATURE_SHEET_SUFFICIENCY_LLM] = prev;
  });

  it("rubric flags missing what/next on failure path", () => {
    const adv = buildDeterministicSufficiencyAdvisory(sampleResult(), {
      commentSnippet: "Done as requested",
      onFailurePath: true,
      failMarkCount: 2,
    });
    expect(adv.enabled).toBe(true);
    expect(adv.advisoryOnly).toBe(true);
    expect(adv.usedLlm).toBe(false);
    expect(adv.adequate).toBe(false);
    expect(adv.gaps.length).toBeGreaterThan(0);
  });

  it("flag off returns rubric only", async () => {
    const adv = await buildSheetSufficiencyAdvisory(
      sampleResult({ hasWhat: true, hasNextAction: true, present: true }),
      {
        commentSnippet: "Cracked coupling. Return visit to fit part.",
        onFailurePath: true,
        failMarkCount: 1,
      }
    );
    expect(adv.usedLlm).toBe(false);
    expect(adv.provider).toBe("deterministic");
  });

  it("documentProcessor persists sheetSufficiencyAdvisory", () => {
    const src = readFileSync(
      path.join(process.cwd(), "server/services/documentProcessor.ts"),
      "utf8"
    );
    expect(src).toContain("buildSheetSufficiencyAdvisory");
    expect(src).toContain("sheetSufficiencyAdvisory");
    expect(src).not.toContain("photoSummary: null");
    expect(src).toContain("photoEvidenceArtifact?.summary");
  });
});
