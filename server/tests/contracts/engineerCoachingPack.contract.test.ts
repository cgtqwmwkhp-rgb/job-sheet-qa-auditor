/**
 * Engineer coaching pack — analytical narrative + theme aggregation.
 */

import { describe, expect, it } from "vitest";
import { buildEngineerCoachingPack } from "../../services/engineerAnalytics/coachingPack";
import { composeCoachingNarrative } from "../../services/engineerAnalytics/coachingNarrative";
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
    expect(draft.strengths[0]).toMatch(/Photo pairs/);
    expect(draft.development[0]).toMatch(/JS-101/);
    expect(draft.coachingAsks.length).toBeGreaterThan(0);
  });
});

describe("buildEngineerCoachingPack", () => {
  it("composes a full pack with job cards and cites", () => {
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
        finding({ findingId: 1, jobSheetId: 101, ruleId: "COMMENT-C010" }),
        finding({
          findingId: 2,
          jobSheetId: 102,
          ruleId: "PHOTO-C012",
          fieldName: "Before/After",
        }),
      ],
    });

    expect(pack).not.toBeNull();
    expect(pack!.summaryMetrics.cardsAssessed).toBe(2);
    expect(pack!.jobCards).toHaveLength(2);
    expect(pack!.draftNarrative.opening).toMatch(/Alex Engineer/);
    expect(pack!.themes.length).toBeGreaterThan(0);
    expect(pack!.workedExamples.length).toBeGreaterThan(0);
    expect(pack!.workedExamples[0].jobSheetId).toBeGreaterThan(0);
    expect(pack!.evidenceRoi.commentFailCount).toBe(1);
    expect(pack!.evidenceRoi.photoFailCount).toBe(1);
  });
});
