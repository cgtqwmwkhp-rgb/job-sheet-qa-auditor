/**
 * Feedback live cadence contract tests.
 *
 * Fixtures only: verifies the feature flag switches from CI-safe fixture
 * reports to DB-shaped engineer aggregate rows.
 */

import { afterEach, describe, expect, it } from "vitest";
import {
  generateFeedbackReportForCadence,
  isFeedbackLiveEnabled,
  type FeedbackLiveRows,
} from "../../services/feedback/generator";
import { DEFAULT_EXPORT_CONFIG } from "../../services/feedback/types";

const previousFlag = process.env.FEATURE_FEEDBACK_LIVE;

const liveRows: FeedbackLiveRows = {
  users: [
    {
      id: 1,
      name: "Alex Rivera",
      email: "alex@example.com",
      role: "technician",
      createdAt: "2024-01-01T00:00:00Z",
      isActive: true,
    },
    {
      id: 2,
      name: "Blake Chen",
      email: "blake@example.com",
      role: "technician",
      createdAt: "2024-01-01T00:00:00Z",
      isActive: true,
    },
  ],
  documents: [
    { technicianId: 1, jobSheetId: 101, processedAt: "2024-06-05T10:00:00Z" },
    { technicianId: 1, jobSheetId: 102, processedAt: "2024-06-12T10:00:00Z" },
    { technicianId: 2, jobSheetId: 201, processedAt: "2024-06-08T10:00:00Z" },
    { technicianId: 1, jobSheetId: 91, processedAt: "2024-05-10T10:00:00Z" },
  ],
  findings: [
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
      technicianId: 2,
      jobSheetId: 201,
      severity: "S3",
      reasonCode: "LOW_CONFIDENCE",
      fieldName: "notes",
      resolutionStatus: "waived",
      occurredAt: "2024-06-08T11:00:00Z",
    },
    {
      findingId: 3,
      technicianId: 1,
      jobSheetId: 91,
      severity: "S2",
      reasonCode: "OUT_OF_POLICY",
      fieldName: "partsUsed",
      resolutionStatus: "open",
      occurredAt: "2024-05-10T11:00:00Z",
    },
  ],
};

afterEach(() => {
  if (previousFlag == null) {
    delete process.env.FEATURE_FEEDBACK_LIVE;
  } else {
    process.env.FEATURE_FEEDBACK_LIVE = previousFlag;
  }
});

describe("Feedback live cadence switch", () => {
  it("defaults to the fixture path for CI", async () => {
    delete process.env.FEATURE_FEEDBACK_LIVE;

    const report = await generateFeedbackReportForCadence("monthly", {
      ...DEFAULT_EXPORT_CONFIG,
      period: "monthly",
    });

    expect(isFeedbackLiveEnabled()).toBe(false);
    expect(report.summary.totalEngineers).toBe(3);
    expect(report.customerScorecards.length).toBeGreaterThan(0);
  });

  it("uses DB-shaped engineer aggregate rows when FEATURE_FEEDBACK_LIVE=true", async () => {
    process.env.FEATURE_FEEDBACK_LIVE = "true";

    const report = await generateFeedbackReportForCadence(
      "monthly",
      {
        ...DEFAULT_EXPORT_CONFIG,
        period: "monthly",
      },
      {
        referenceDate: new Date("2024-06-15T12:00:00Z"),
        liveRows,
      }
    );

    expect(isFeedbackLiveEnabled()).toBe(true);
    expect(report.reportId).toContain("report-live-monthly-");
    expect(report.summary.totalEngineers).toBe(2);
    expect(report.summary.totalCustomers).toBe(0);
    expect(report.overall.totalDocuments).toBe(3);
    expect(report.summary.totalFixPackIssues).toBe(2);
    expect(report.engineerScorecards.map(s => s.engineer.id).sort()).toEqual([
      "1",
      "2",
    ]);
    expect(report.engineerScorecards[0].scorecardId).toContain(
      "eng-score-live-"
    );
  });
});
