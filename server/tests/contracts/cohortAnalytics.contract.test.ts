/**
 * Cohort Analytics Contract Tests (PR-16)
 *
 * Fixtures/mocks only — no live DB, OCR, or LLM.
 */

import { describe, it, expect } from "vitest";
import {
  buildCohortAnalyticsSummary,
  buildCohortDrilldown,
  normalizeCohortKey,
  type CohortDocumentRow,
  type CohortFindingRow,
} from "../../services/cohortAnalytics";

const documents: CohortDocumentRow[] = [
  {
    jobSheetId: 1,
    siteInfo: "London HQ",
    assetType: "generator",
    workType: "service",
    templateSlug: "gen-service",
    result: "pass",
    confidenceScore: 92,
    processedAt: "2024-06-05T10:00:00Z",
  },
  {
    jobSheetId: 2,
    siteInfo: "London HQ",
    assetType: "generator",
    workType: "repair",
    templateSlug: "gen-repair",
    result: "fail",
    confidenceScore: 70,
    processedAt: "2024-06-12T10:00:00Z",
  },
  {
    jobSheetId: 3,
    siteInfo: "Manchester",
    assetType: "lift",
    workType: "service",
    templateSlug: "lift-service",
    result: "review_queue",
    confidenceScore: 55,
    processedAt: "2024-06-18T10:00:00Z",
  },
  {
    jobSheetId: 4,
    siteInfo: null,
    assetType: null,
    workType: null,
    templateSlug: null,
    result: "pass",
    confidenceScore: 88,
    processedAt: "2024-06-20T10:00:00Z",
  },
];

const findings: CohortFindingRow[] = [
  {
    findingId: 10,
    jobSheetId: 2,
    severity: "S1",
    reasonCode: "MISSING_FIELD",
    fieldName: "signature",
    occurredAt: "2024-06-12T11:00:00Z",
  },
  {
    findingId: 11,
    jobSheetId: 2,
    severity: "S2",
    reasonCode: "INVALID_FORMAT",
    fieldName: "date",
    occurredAt: "2024-06-12T11:05:00Z",
  },
  {
    findingId: 12,
    jobSheetId: 3,
    severity: "S0",
    reasonCode: "OUT_OF_POLICY",
    fieldName: "safeToUse",
    occurredAt: "2024-06-18T11:00:00Z",
  },
];

describe("Cohort Analytics - PR-16 Contract Tests", () => {
  it("normalizes empty cohort keys to Unknown", () => {
    expect(normalizeCohortKey(null)).toBe("Unknown");
    expect(normalizeCohortKey("  ")).toBe("Unknown");
    expect(normalizeCohortKey("London")).toBe("London");
  });

  it("aggregates by site with pass rates and issues", () => {
    const summary = buildCohortAnalyticsSummary({
      documents,
      findings,
      startDate: "2024-06-01T00:00:00Z",
      endDate: "2024-06-30T23:59:59Z",
    });

    expect(summary.totals.documentCount).toBe(4);
    expect(summary.totals.issueCount).toBe(3);
    expect(summary.totals.criticalIssueCount).toBe(2);

    const london = summary.bySite.buckets.find(b => b.key === "London HQ");
    expect(london).toBeDefined();
    expect(london!.documentCount).toBe(2);
    expect(london!.passCount).toBe(1);
    expect(london!.failCount).toBe(1);
    expect(london!.issueCount).toBe(2);
    expect(london!.passRate).toBe(0.5);

    const unknown = summary.bySite.buckets.find(b => b.key === "Unknown");
    expect(unknown?.documentCount).toBe(1);
  });

  it("aggregates by assetType and workType", () => {
    const summary = buildCohortAnalyticsSummary({
      documents,
      findings,
      startDate: "2024-06-01T00:00:00Z",
      endDate: "2024-06-30T23:59:59Z",
    });

    const generators = summary.byAssetType.buckets.find(
      b => b.key === "generator"
    );
    expect(generators?.documentCount).toBe(2);
    expect(generators?.criticalIssueCount).toBe(1);

    const service = summary.byWorkType.buckets.find(b => b.key === "service");
    expect(service?.documentCount).toBe(2);
  });

  it("supports finding drill-through for a cohort key", () => {
    const rows = buildCohortDrilldown({
      documents,
      findings,
      dimension: "site",
      key: "London HQ",
      startDate: "2024-06-01T00:00:00Z",
      endDate: "2024-06-30T23:59:59Z",
    });

    expect(rows).toHaveLength(2);
    expect(rows.every(r => r.site === "London HQ")).toBe(true);
    expect(rows[0].findingId).toBeGreaterThan(0);
  });

  it("excludes out-of-period documents", () => {
    const summary = buildCohortAnalyticsSummary({
      documents,
      findings,
      startDate: "2024-07-01T00:00:00Z",
      endDate: "2024-07-31T23:59:59Z",
    });
    expect(summary.totals.documentCount).toBe(0);
    expect(summary.bySite.buckets).toHaveLength(0);
  });
});
