/**
 * Engineer Analytics DB Aggregation Contract Tests (PR-15)
 *
 * Fixtures/mocks only — no live DB, OCR, or LLM.
 * Verifies reason-code mapping, scorecards, peer trends, and drill-through.
 */

import { describe, it, expect } from "vitest";
import {
  mapReasonCodeToIssueType,
  mapResolutionStatus,
  toIssueOccurrence,
  type RawFindingRow,
} from "../../services/engineerAnalytics/mapFindings";
import {
  buildEngineerAnalyticsSummary,
  buildEngineerScoreCardDetail,
  buildEngineerScoreCards,
  toEngineerProfile,
  type EngineerDocumentRow,
  type EngineerUserRow,
} from "../../services/engineerAnalytics/aggregateFromDb";
import fs from "fs";
import path from "path";

const users: EngineerUserRow[] = [
  {
    id: 1,
    name: "Alex Rivera",
    email: "alex@example.com",
    role: "technician",
    createdAt: "2024-01-01T00:00:00Z",
  },
  {
    id: 2,
    name: "Blake Chen",
    email: "blake@example.com",
    role: "technician",
    createdAt: "2024-01-01T00:00:00Z",
  },
];

const documents: EngineerDocumentRow[] = [
  { technicianId: 1, jobSheetId: 101, processedAt: "2024-06-05T10:00:00Z" },
  { technicianId: 1, jobSheetId: 102, processedAt: "2024-06-12T10:00:00Z" },
  { technicianId: 1, jobSheetId: 103, processedAt: "2024-06-18T10:00:00Z" },
  { technicianId: 2, jobSheetId: 201, processedAt: "2024-06-08T10:00:00Z" },
  { technicianId: 2, jobSheetId: 202, processedAt: "2024-06-20T10:00:00Z" },
  // prior period for trend
  { technicianId: 1, jobSheetId: 91, processedAt: "2024-05-10T10:00:00Z" },
  { technicianId: 2, jobSheetId: 92, processedAt: "2024-05-12T10:00:00Z" },
];

const findings: RawFindingRow[] = [
  {
    findingId: 1,
    technicianId: 1,
    jobSheetId: 101,
    severity: "S0",
    reasonCode: "MISSING_FIELD",
    fieldName: "customerSignature",
    resolutionStatus: "open",
    occurredAt: "2024-06-05T11:00:00Z",
  },
  {
    findingId: 2,
    technicianId: 1,
    jobSheetId: 102,
    severity: "S1",
    reasonCode: "MISSING_FIELD",
    fieldName: "customerSignature",
    resolutionStatus: "open",
    occurredAt: "2024-06-12T11:00:00Z",
  },
  {
    findingId: 3,
    technicianId: 1,
    jobSheetId: 103,
    severity: "S2",
    reasonCode: "INVALID_FORMAT",
    fieldName: "serviceDate",
    resolutionStatus: "approved",
    occurredAt: "2024-06-18T11:00:00Z",
  },
  {
    findingId: 4,
    technicianId: 2,
    jobSheetId: 201,
    severity: "S3",
    reasonCode: "LOW_CONFIDENCE",
    fieldName: "notes",
    resolutionStatus: "waived",
    occurredAt: "2024-06-08T11:00:00Z",
  },
  {
    findingId: 5,
    technicianId: 1,
    jobSheetId: 91,
    severity: "S2",
    reasonCode: "OUT_OF_POLICY",
    fieldName: "partsUsed",
    resolutionStatus: "open",
    occurredAt: "2024-05-10T11:00:00Z",
  },
];

describe("Engineer Analytics DB Aggregation (PR-15)", () => {
  describe("reason code mapping", () => {
    it("maps signature missing fields to SIGNATURE_MISSING", () => {
      expect(
        mapReasonCodeToIssueType("MISSING_FIELD", "customerSignature")
      ).toBe("SIGNATURE_MISSING");
    });

    it("maps standard reason codes", () => {
      expect(mapReasonCodeToIssueType("MISSING_FIELD", "siteName")).toBe(
        "MISSING_FIELD"
      );
      expect(mapReasonCodeToIssueType("INVALID_FORMAT")).toBe("INVALID_FORMAT");
      expect(mapReasonCodeToIssueType("OUT_OF_POLICY")).toBe("OUT_OF_POLICY");
      expect(mapReasonCodeToIssueType("INCOMPLETE_EVIDENCE")).toBe(
        "INCOMPLETE_CHECKLIST"
      );
      expect(mapReasonCodeToIssueType("OCR_FAILURE")).toBe("OTHER");
    });

    it("maps resolution statuses", () => {
      expect(mapResolutionStatus("waived")).toBe("waived");
      expect(mapResolutionStatus("approved")).toBe("resolved");
      expect(mapResolutionStatus("overridden")).toBe("resolved");
      expect(mapResolutionStatus("open")).toBe("open");
      expect(mapResolutionStatus("flagged")).toBe("open");
    });

    it("builds IssueOccurrence from raw rows", () => {
      const occ = toIssueOccurrence(findings[0]);
      expect(occ.engineerId).toBe("1");
      expect(occ.documentId).toBe("101");
      expect(occ.issueType).toBe("SIGNATURE_MISSING");
      expect(occ.severity).toBe("S0");
      expect(occ.wasWaived).toBe(false);
    });
  });

  describe("scorecards and summary", () => {
    it("builds deterministic leaderboard ordered by score", () => {
      const cards = buildEngineerScoreCards({
        users,
        documents,
        findings,
        periodStart: "2024-06-01T00:00:00.000Z",
        periodEnd: "2024-06-30T23:59:59.999Z",
      });

      expect(cards.length).toBe(2);
      expect(cards[0].overallScore).toBeGreaterThanOrEqual(
        cards[1].overallScore
      );
      expect(cards.map(c => c.engineerId).sort()).toEqual(["1", "2"]);
    });

    it("computes real peer averages (not hardcoded 80/78)", () => {
      const cards = buildEngineerScoreCards({
        users,
        documents,
        findings,
        periodStart: "2024-06-01T00:00:00.000Z",
        periodEnd: "2024-06-30T23:59:59.999Z",
      });

      const avg = Math.round(
        cards.reduce((s, c) => s + c.overallScore, 0) / cards.length
      );
      for (const card of cards) {
        expect(card.peerComparison.teamAvgScore).toBe(avg);
        expect(card.peerComparison.regionAvgScore).toBe(avg);
      }
    });

    it("builds summary with trends and leaderboard", () => {
      const summary = buildEngineerAnalyticsSummary({
        users,
        documents,
        findings,
        startDate: "2024-06-01T00:00:00.000Z",
        endDate: "2024-06-30T23:59:59.999Z",
      });

      expect(summary.engineerCount).toBe(2);
      expect(summary.totalDocuments).toBe(5);
      expect(summary.totalIssues).toBe(4);
      expect(summary.leaderboard.length).toBe(2);
      expect(summary.trends.timeSeries.length).toBeGreaterThan(0);
      expect(summary.leaderboard[0]).toMatchObject({
        engineerId: expect.any(String),
        overallScore: expect.any(Number),
        documentsProcessed: expect.any(Number),
      });
    });

    it("is deterministic for identical fixtures", () => {
      const a = buildEngineerAnalyticsSummary({
        users,
        documents,
        findings,
        startDate: "2024-06-01T00:00:00.000Z",
        endDate: "2024-06-30T23:59:59.999Z",
      });
      const b = buildEngineerAnalyticsSummary({
        users,
        documents,
        findings,
        startDate: "2024-06-01T00:00:00.000Z",
        endDate: "2024-06-30T23:59:59.999Z",
      });

      expect(a.teamAvgScore).toBe(b.teamAvgScore);
      expect(a.leaderboard.map(r => r.overallScore)).toEqual(
        b.leaderboard.map(r => r.overallScore)
      );
      expect(a.trends.overallTrend).toEqual(b.trends.overallTrend);
    });
  });

  describe("drill-through detail", () => {
    it("returns scorecard, fix pack, and finding rows linked to job sheets", () => {
      const detail = buildEngineerScoreCardDetail({
        users,
        documents,
        findings,
        engineerId: "1",
        startDate: "2024-06-01T00:00:00.000Z",
        endDate: "2024-06-30T23:59:59.999Z",
      });

      expect(detail.scoreCard?.engineerId).toBe("1");
      expect(detail.fixPack?.engineerId).toBe("1");
      expect(detail.drilldown.length).toBe(3);
      expect(detail.drilldown[0].severity).toBe("S0");
      expect(
        detail.drilldown.every(d => typeof d.jobSheetId === "number")
      ).toBe(true);
      expect(detail.drilldown[0].issueType).toBe("SIGNATURE_MISSING");
    });

    it("returns null scorecard for unknown engineer", () => {
      const detail = buildEngineerScoreCardDetail({
        users,
        documents,
        findings,
        engineerId: "999",
        startDate: "2024-06-01T00:00:00.000Z",
        endDate: "2024-06-30T23:59:59.999Z",
      });
      expect(detail.scoreCard).toBeNull();
      expect(detail.drilldown).toEqual([]);
    });
  });

  describe("profile helper", () => {
    it("falls back to email or technician label", () => {
      expect(toEngineerProfile(users[0]).name).toBe("Alex Rivera");
      expect(
        toEngineerProfile({
          id: 9,
          name: null,
          email: "x@y.com",
          role: "technician",
          createdAt: "2024-01-01",
        }).name
      ).toBe("x@y.com");
    });
  });
});

describe("Technician Performance UI Contract (PR-15)", () => {
  const pagePath = path.resolve(
    __dirname,
    "../../../client/src/pages/analytics/TechnicianPerformance.tsx"
  );
  const analyticsPath = path.resolve(
    __dirname,
    "../../../client/src/pages/Analytics.tsx"
  );
  const pageContent = fs.readFileSync(pagePath, "utf-8");
  const analyticsContent = fs.readFileSync(analyticsPath, "utf-8");

  it("does not ship Coming Soon placeholder", () => {
    expect(pageContent).not.toContain("Coming Soon");
    expect(pageContent).not.toContain("will be available once sufficient");
  });

  it("uses engineer analytics tRPC endpoints", () => {
    expect(pageContent).toContain("trpc.analytics.getEngineerSummary");
    expect(pageContent).toContain("trpc.analytics.getEngineerScoreCard");
  });

  it("links drill-through to audits", () => {
    expect(pageContent).toContain("/audits?id=");
  });

  it("has loading and empty states", () => {
    expect(pageContent).toContain("Loader2");
    expect(pageContent).toContain("No Technician Attribution Yet");
  });

  it("Analytics technicians tab is wired (not Coming Soon)", () => {
    expect(analyticsContent).not.toContain(
      "Technician Leaderboard Coming Soon"
    );
    expect(analyticsContent).toContain("trpc.analytics.getEngineerSummary");
    expect(analyticsContent).toContain("/analytics/technicians");
  });
});
