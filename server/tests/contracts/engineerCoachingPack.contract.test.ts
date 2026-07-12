/**
 * Engineer coaching pack — evidence dossier + deep narrative + LLM critic gate.
 */

import { describe, expect, it } from "vitest";
import { buildEngineerCoachingPack } from "../../services/engineerAnalytics/coachingPack";
import { composeCoachingNarrative } from "../../services/engineerAnalytics/coachingNarrative";
import {
  extractCitedJobSheetIds,
  isCoachingLlmNarrativeEnabled,
  enrichCoachingNarrativeWithLlm,
  applyHardCiteGates,
  quotesGroundedInDossier,
} from "../../services/engineerAnalytics/coachingNarrativeLlm";
import { buildEvidenceDossier } from "../../services/engineerAnalytics/evidenceDossier";
import {
  aggregateCoachingThemes,
  classifyFindingTheme,
} from "../../services/engineerAnalytics/coachingThemes";
import type { RawFindingRow } from "../../services/engineerAnalytics/mapFindings";

const now = new Date("2026-07-10T12:00:00.000Z");
const start = new Date("2026-06-26T12:00:00.000Z").toISOString();
const end = now.toISOString();

function finding(
  partial: Partial<RawFindingRow> &
    Pick<RawFindingRow, "findingId" | "jobSheetId">
): RawFindingRow {
  return {
    technicianId: 7,
    severity: "S1",
    reasonCode: "INCOMPLETE_EVIDENCE",
    fieldName: "Engineer Comments",
    ruleId: "COMMENT-C010",
    resolutionStatus: "open",
    occurredAt: "2026-07-01T10:00:00.000Z",
    ...partial,
  };
}

describe("coachingThemes", () => {
  it("classifies COMMENT/PHOTO/EVIDENCE rule families", () => {
    expect(classifyFindingTheme({ ruleId: "COMMENT-C020" })).toBe(
      "comment_narrative"
    );
    expect(classifyFindingTheme({ ruleId: "PHOTO-C012" })).toBe("photo_proof");
    expect(classifyFindingTheme({ ruleId: "EVIDENCE-C010" })).toBe(
      "evidence_coherence"
    );
  });

  it("aggregates themes with evidence cites and prior trend", () => {
    const current: RawFindingRow[] = [
      finding({ findingId: 1, jobSheetId: 101, ruleId: "COMMENT-C010" }),
      finding({ findingId: 2, jobSheetId: 102, ruleId: "COMMENT-C040" }),
      finding({
        findingId: 3,
        jobSheetId: 103,
        ruleId: "PHOTO-C012",
        fieldName: "Before/After",
      }),
    ];
    const prior: RawFindingRow[] = [
      finding({ findingId: 9, jobSheetId: 90, ruleId: "COMMENT-C010" }),
    ];
    const themes = aggregateCoachingThemes({
      currentFindings: current,
      priorFindings: prior,
    });
    expect(themes[0]?.themeId).toBe("comment_narrative");
    expect(themes[0]?.exampleJobSheetIds.length).toBeGreaterThan(0);
    expect(themes[0]?.findingCount).toBe(2);
  });
});

describe("evidenceDossier", () => {
  it("merges finding snippets with reportJson comment/photo signals", () => {
    const dossier = buildEvidenceDossier({
      engineerName: "Alex Engineer",
      period: { start, end },
      documents: [
        {
          technicianId: 7,
          jobSheetId: 101,
          referenceNumber: "DV23-101",
          siteInfo: "North",
          result: "fail",
          confidenceScore: 50,
          processedAt: "2026-07-01T09:00:00.000Z",
        },
      ],
      findings: [
        finding({
          findingId: 1,
          jobSheetId: 101,
          normalisedSnippet: "VOR — see above",
          suggestedFix: "Name the defect and next action.",
        }),
      ],
      reportsByJobSheetId: {
        101: {
          commentQualitySignals: {
            snippet: "VOR — see above",
            hasWhat: false,
            hasNextAction: false,
            hasPartsStance: false,
            isVagueOnly: true,
            isTooThin: true,
          },
          failurePathSignals: { partsStillRequired: true },
          photoPairCompare: { passed: false, summary: "No after photo" },
          evidenceCoherenceSummary: {
            coherent: false,
            summary: "Comment claims complete; photos show open work",
          },
        },
      },
    });

    expect(dossier.cites).toHaveLength(1);
    expect(dossier.cites[0].snippet).toMatch(/VOR/);
    expect(dossier.cites[0].commentHasWhat).toBe(false);
    expect(dossier.cites[0].photoPairFailed).toBe(true);
    expect(dossier.signalRollup.vagueCommentCount).toBe(1);
    expect(dossier.signalRollup.photoPairFailCount).toBe(1);
    expect(dossier.compactMarkdown).toContain("JS-101");
    expect(dossier.compactMarkdown).toContain("missing what-failed");
  });
});

describe("composeCoachingNarrative", () => {
  it("writes second-person analytical prose with evidence", () => {
    const draft = composeCoachingNarrative({
      engineerName: "Alex Engineer",
      period: { start, end },
      scoreCard: {
        engineerId: "7",
        engineerName: "Alex Engineer",
        period: { start, end },
        overallScore: 72,
        trend: "declining",
        documentsProcessed: 5,
        documentsWithIssues: 3,
        issueRate: 0.6,
        issuesBySeverity: { S0: 0, S1: 4, S2: 1, S3: 0 },
        issuesByType: [],
        topRecurringIssues: [],
        peerComparison: {
          percentile: 35,
          teamAvgScore: 80,
          regionAvgScore: 80,
        },
        recommendations: [],
      },
      priorScore: 85,
      themes: [
        {
          themeId: "comment_narrative",
          title: "Clinical comment narrative",
          definition: "Thin failure-path comments.",
          goodLooksLike: "Three-part comments.",
          findingCount: 3,
          majorCount: 2,
          sheetCount: 2,
          percentageOfIssues: 60,
          priorFindingCount: 1,
          trend: "increasing",
          exampleJobSheetIds: [101, 102],
          exampleRuleIds: ["COMMENT-C010"],
        },
      ],
      developmentThemes: [
        {
          themeId: "comment_narrative",
          title: "Clinical comment narrative",
          definition: "Thin failure-path comments.",
          goodLooksLike: "Three-part comments.",
          findingCount: 3,
          majorCount: 2,
          sheetCount: 2,
          percentageOfIssues: 60,
          priorFindingCount: 1,
          trend: "increasing",
          exampleJobSheetIds: [101, 102],
          exampleRuleIds: ["COMMENT-C010"],
        },
      ],
      strengthHints: ["Photo pairs stayed clean on completion cards."],
    });

    expect(draft.opening).toMatch(/Alex Engineer/);
    expect(draft.opening).toMatch(/5 job cards/);
    expect(draft.opening).toMatch(/documentation quality/i);
    expect(draft.strengths[0]).toMatch(/Photo pairs/);
    expect(draft.development[0]).toMatch(/JS-101/);
    expect(draft.coachingAsks.length).toBeGreaterThan(0);
    expect(draft.criticalAssessment.length).toBeGreaterThan(0);
    expect(draft.successCriteria.length).toBeGreaterThan(0);
    expect(draft.enrichment.provider).toBe("deterministic");
  });
});

describe("coachingNarrativeLlm", () => {
  it("extracts JS cites for validation", () => {
    expect(extractCitedJobSheetIds("See JS-101 and JS-102.")).toEqual([
      101, 102,
    ]);
  });

  it("respects FEATURE_COACHING_LLM_NARRATIVE=false", () => {
    const prev = process.env.FEATURE_COACHING_LLM_NARRATIVE;
    process.env.FEATURE_COACHING_LLM_NARRATIVE = "false";
    expect(isCoachingLlmNarrativeEnabled()).toBe(false);
    if (prev === undefined) delete process.env.FEATURE_COACHING_LLM_NARRATIVE;
    else process.env.FEATURE_COACHING_LLM_NARRATIVE = prev;
  });

  it("hard cite gate drops invented ids, missing cites, and ungrounded quotes", () => {
    const allowed = new Set([101, 102]);
    const corpus = 'snippet: "pump seal failed — parts still required"';
    expect(
      quotesGroundedInDossier(
        'On JS-101 you wrote "pump seal failed — parts still required"',
        corpus
      )
    ).toBe(true);
    expect(
      quotesGroundedInDossier(
        'On JS-101 you wrote "completely fabricated quote here"',
        corpus
      )
    ).toBe(false);

    const gated = applyHardCiteGates(
      [
        "JS-101 missing next action on failure path",
        "JS-999 invented card",
        "No cite but claims a major documentation failure",
        'JS-101 quote "completely fabricated quote here"',
      ],
      allowed,
      corpus,
      { requireCite: true }
    );
    expect(gated.kept).toEqual([
      "JS-101 missing next action on failure path",
    ]);
    expect(gated.stats.droppedInventedIds).toBe(1);
    expect(gated.stats.droppedMissingCite).toBe(1);
    expect(gated.stats.droppedUngroundedQuote).toBe(1);
  });

  it("mock enrichment adds critic note without inventing cites", async () => {
    const prev = process.env.FEATURE_COACHING_LLM_NARRATIVE;
    process.env.FEATURE_COACHING_LLM_NARRATIVE = "true";

    const dossier = buildEvidenceDossier({
      engineerName: "Alex",
      period: { start, end },
      documents: [
        {
          technicianId: 7,
          jobSheetId: 101,
          referenceNumber: "DV23-101",
          result: "fail",
          processedAt: "2026-07-01T09:00:00.000Z",
        },
      ],
      findings: [finding({ findingId: 1, jobSheetId: 101 })],
    });
    const draft = composeCoachingNarrative({
      engineerName: "Alex",
      period: { start, end },
      scoreCard: {
        engineerId: "7",
        engineerName: "Alex",
        period: { start, end },
        overallScore: 60,
        trend: "stable",
        documentsProcessed: 1,
        documentsWithIssues: 1,
        issueRate: 1,
        issuesBySeverity: { S0: 0, S1: 1, S2: 0, S3: 0 },
        issuesByType: [],
        topRecurringIssues: [],
        peerComparison: {
          percentile: 40,
          teamAvgScore: 70,
          regionAvgScore: 70,
        },
        recommendations: [],
      },
      priorScore: null,
      themes: [],
      developmentThemes: [],
      strengthHints: [],
      dossier,
    });

    const enriched = await enrichCoachingNarrativeWithLlm({
      draft,
      dossier,
      forceMock: true,
    });
    expect(enriched.enrichment.provider).toBe("mock");
    expect(enriched.enrichment.writerProvider).toBe("mock");
    expect(enriched.criticalAssessment.join(" ")).toMatch(/Mock critic/);

    if (prev === undefined) delete process.env.FEATURE_COACHING_LLM_NARRATIVE;
    else process.env.FEATURE_COACHING_LLM_NARRATIVE = prev;
  });
});

describe("buildEngineerCoachingPack", () => {
  it("composes a full pack with dossier-backed narrative and cites", () => {
    const pack = buildEngineerCoachingPack({
      engineerId: "7",
      startDate: start,
      endDate: end,
      users: [
        {
          id: 7,
          name: "Alex Engineer",
          email: "alex@example.com",
          role: "technician",
          createdAt: "2025-01-01T00:00:00.000Z",
        },
      ],
      documents: [
        {
          technicianId: 7,
          jobSheetId: 101,
          referenceNumber: "DV23-101",
          siteInfo: "North Depot",
          result: "review_queue",
          confidenceScore: 62,
          processedAt: "2026-07-01T09:00:00.000Z",
        },
        {
          technicianId: 7,
          jobSheetId: 102,
          referenceNumber: "DV23-102",
          siteInfo: "North Depot",
          result: "fail",
          confidenceScore: 55,
          processedAt: "2026-07-02T09:00:00.000Z",
        },
      ],
      findings: [
        finding({
          findingId: 1,
          jobSheetId: 101,
          ruleId: "COMMENT-C010",
          normalisedSnippet: "Pump noisy",
          suggestedFix: "State next action.",
        }),
        finding({
          findingId: 2,
          jobSheetId: 102,
          ruleId: "PHOTO-C012",
          fieldName: "Before/After",
          normalisedSnippet: "Only before photo attached",
        }),
      ],
      reportsByJobSheetId: {
        101: {
          commentQualitySignals: {
            snippet: "Pump noisy",
            hasWhat: true,
            hasNextAction: false,
            hasPartsStance: false,
            isVagueOnly: false,
            isTooThin: false,
          },
          failurePathSignals: { onFailurePath: true },
        },
        102: {
          photoPairCompare: { passed: false, summary: "Missing after" },
        },
      },
    });

    expect(pack).not.toBeNull();
    expect(pack!.summaryMetrics.cardsAssessed).toBe(2);
    expect(pack!.jobCards).toHaveLength(2);
    expect(pack!.draftNarrative.opening).toMatch(/Alex Engineer/);
    expect(pack!.draftNarrative.criticalAssessment.length).toBeGreaterThan(0);
    expect(pack!.draftNarrative.evidenceAnchors.length).toBeGreaterThan(0);
    expect(pack!.evidenceDossier.cites.length).toBe(2);
    expect(pack!.themes.length).toBeGreaterThan(0);
    expect(pack!.workedExamples.length).toBeGreaterThan(0);
    expect(pack!.workedExamples[0].jobSheetId).toBeGreaterThan(0);
    expect(pack!.workedExamples.some(ex => ex.evidenceQuote)).toBe(true);
    expect(pack!.evidenceRoi.commentFailCount).toBe(1);
    expect(pack!.evidenceRoi.photoFailCount).toBe(1);
  });
});
