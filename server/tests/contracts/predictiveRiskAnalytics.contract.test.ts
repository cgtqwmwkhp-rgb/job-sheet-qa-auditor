/**
 * Predictive Risk Analytics Contract Tests (PR-19)
 *
 * Fixtures/mocks only — no live DB, OCR, or LLM.
 */

import { describe, it, expect } from "vitest";
import {
  buildPredictiveRiskSummary,
  computeEntityIndicators,
  resolvePredictivePeriod,
  riskBandFromScore,
  scoreLeadingIndicators,
  type PredictiveDisputeRow,
  type PredictiveDocumentRow,
  type PredictiveFindingRow,
} from "../../services/predictiveRiskAnalytics";

const docs: PredictiveDocumentRow[] = [
  // Engineer 10 — rising ambiguity + issues (needs attention)
  {
    jobSheetId: 1,
    technicianId: 10,
    templateSlug: "tmpl-a",
    assetType: "generator",
    result: "pass",
    confidenceScore: 90,
    processedAt: "2024-06-01T10:00:00Z",
  },
  {
    jobSheetId: 2,
    technicianId: 10,
    templateSlug: "tmpl-a",
    assetType: "generator",
    result: "pass",
    confidenceScore: 88,
    processedAt: "2024-06-05T10:00:00Z",
  },
  {
    jobSheetId: 3,
    technicianId: 10,
    templateSlug: "tmpl-a",
    assetType: "generator",
    result: "review_queue",
    confidenceScore: 40,
    processedAt: "2024-06-18T10:00:00Z",
  },
  {
    jobSheetId: 4,
    technicianId: 10,
    templateSlug: "tmpl-a",
    assetType: "generator",
    result: "fail",
    confidenceScore: 30,
    processedAt: "2024-06-22T10:00:00Z",
  },
  {
    jobSheetId: 5,
    technicianId: 10,
    templateSlug: "tmpl-a",
    assetType: "generator",
    result: "review_queue",
    confidenceScore: 35,
    processedAt: "2024-06-26T10:00:00Z",
  },
  // Engineer 20 — clean / low risk
  {
    jobSheetId: 6,
    technicianId: 20,
    templateSlug: "tmpl-b",
    assetType: "pump",
    result: "pass",
    confidenceScore: 95,
    processedAt: "2024-06-02T10:00:00Z",
  },
  {
    jobSheetId: 7,
    technicianId: 20,
    templateSlug: "tmpl-b",
    assetType: "pump",
    result: "pass",
    confidenceScore: 92,
    processedAt: "2024-06-12T10:00:00Z",
  },
  {
    jobSheetId: 8,
    technicianId: 20,
    templateSlug: "tmpl-b",
    assetType: "pump",
    result: "pass",
    confidenceScore: 94,
    processedAt: "2024-06-20T10:00:00Z",
  },
];

const findings: PredictiveFindingRow[] = [
  {
    findingId: 1,
    jobSheetId: 3,
    technicianId: 10,
    severity: "S2",
    reasonCode: "LOW_CONFIDENCE",
    fieldName: "serial",
    resolutionStatus: "open",
    occurredAt: "2024-06-18T11:00:00Z",
  },
  {
    findingId: 2,
    jobSheetId: 4,
    technicianId: 10,
    severity: "S1",
    reasonCode: "MISSING_FIELD",
    fieldName: "signature",
    resolutionStatus: "open",
    occurredAt: "2024-06-22T11:00:00Z",
  },
  {
    findingId: 3,
    jobSheetId: 5,
    technicianId: 10,
    severity: "S3",
    reasonCode: "INVALID_FORMAT",
    fieldName: "date",
    resolutionStatus: "open",
    occurredAt: "2024-06-26T11:00:00Z",
  },
  {
    findingId: 4,
    jobSheetId: 5,
    technicianId: 10,
    severity: "S2",
    reasonCode: "MISSING_FIELD",
    fieldName: "notes",
    resolutionStatus: "flagged",
    occurredAt: "2024-06-26T12:00:00Z",
  },
];

const disputes: PredictiveDisputeRow[] = [
  {
    id: 1,
    auditFindingId: 2,
    raisedBy: 10,
    status: "open",
    createdAt: "2024-06-23T09:00:00Z",
  },
];

describe("Predictive risk scoring primitives", () => {
  it("resolves a default 30-day period", () => {
    const period = resolvePredictivePeriod();
    expect(period.start).toBeTruthy();
    expect(period.end).toBeTruthy();
    expect(new Date(period.end).getTime()).toBeGreaterThan(
      new Date(period.start).getTime()
    );
  });

  it("maps risk scores to bands", () => {
    expect(riskBandFromScore(90)).toBe("critical");
    expect(riskBandFromScore(65)).toBe("high");
    expect(riskBandFromScore(45)).toBe("medium");
    expect(riskBandFromScore(10)).toBe("low");
  });

  it("scores leading indicators into a composite 0–100", () => {
    const scored = scoreLeadingIndicators({
      minorIssueMix: 80,
      disputeRate: 60,
      ambiguityTrend: 90,
      issueRate: 70,
      criticalDensity: 50,
    });
    expect(scored.riskScore).toBeGreaterThanOrEqual(0);
    expect(scored.riskScore).toBeLessThanOrEqual(100);
    expect(scored.band).toMatch(/critical|high|medium|low/);
    expect(scored.weights.ambiguityTrend).toBeGreaterThan(0);
  });
});

describe("Entity leading indicators", () => {
  it("detects rising ambiguity and minor-issue mix for engineer 10", () => {
    const indicators = computeEntityIndicators({
      documents: docs,
      findings,
      disputes,
      entityType: "engineer",
      entityKey: "10",
      startDate: "2024-06-01T00:00:00.000Z",
      endDate: "2024-06-30T23:59:59.999Z",
    });

    expect(indicators.documentCount).toBe(5);
    expect(indicators.findingCount).toBe(4);
    expect(indicators.disputeCount).toBe(1);
    expect(indicators.minorIssueMix).toBeGreaterThan(50);
    expect(indicators.ambiguityTrend).toBeGreaterThan(50);
    expect(indicators.issueRate).toBeGreaterThan(40);
  });

  it("scores clean engineer 20 as low-risk indicators", () => {
    const indicators = computeEntityIndicators({
      documents: docs,
      findings,
      disputes,
      entityType: "engineer",
      entityKey: "20",
      startDate: "2024-06-01T00:00:00.000Z",
      endDate: "2024-06-30T23:59:59.999Z",
    });

    expect(indicators.documentCount).toBe(3);
    expect(indicators.findingCount).toBe(0);
    expect(indicators.issueRate).toBe(0);
    expect(indicators.disputeRate).toBe(0);
  });
});

describe("Predictive risk summary + fix packs", () => {
  it("builds attention queue with engineer 10 and wires a fix pack", () => {
    const summary = buildPredictiveRiskSummary({
      documents: docs,
      findings,
      disputes,
      users: [
        { id: 10, name: "Alex Risky", email: "alex@example.com" },
        { id: 20, name: "Sam Stable", email: "sam@example.com" },
      ],
      startDate: "2024-06-01T00:00:00.000Z",
      endDate: "2024-06-30T23:59:59.999Z",
    });

    expect(summary.summary.entitiesScored).toBeGreaterThan(0);
    expect(summary.summary.needingAttention).toBeGreaterThan(0);

    const eng10 = summary.attentionQueue.find(
      q => q.entityType === "engineer" && q.entityKey === "10"
    );
    expect(eng10).toBeDefined();
    expect(eng10!.label).toBe("Alex Risky");
    expect(eng10!.riskScore).toBeGreaterThanOrEqual(40);
    expect(eng10!.drivers.length).toBeGreaterThan(0);
    expect(eng10!.fixPack).not.toBeNull();
    expect(eng10!.fixPack!.summary.totalIssues).toBeGreaterThan(0);
    expect(eng10!.fixPack!.issues.length).toBeGreaterThan(0);

    const eng20 = summary.attentionQueue.find(
      q => q.entityType === "engineer" && q.entityKey === "20"
    );
    expect(eng20).toBeUndefined();

    expect(summary.fixPacks.length).toBeGreaterThan(0);
    expect(summary.predictions.length).toBeGreaterThan(0);
    expect(summary.predictions[0]).toHaveProperty("assetId");
    expect(summary.predictions[0]).toHaveProperty("predictedFailureDate");
    expect(summary.predictions[0].riskScore).toBeGreaterThan(0);
  });

  it("includes asset and template entities when they breach threshold", () => {
    const summary = buildPredictiveRiskSummary({
      documents: docs,
      findings,
      disputes,
      startDate: "2024-06-01T00:00:00.000Z",
      endDate: "2024-06-30T23:59:59.999Z",
    });

    const types = new Set(summary.attentionQueue.map(q => q.entityType));
    expect(types.has("engineer")).toBe(true);
    // generator / tmpl-a share the risky docs
    expect(
      summary.attentionQueue.some(
        q => q.entityType === "asset" && q.entityKey === "generator"
      ) ||
        summary.attentionQueue.some(
          q => q.entityType === "template" && q.entityKey === "tmpl-a"
        )
    ).toBe(true);
  });

  it("respects a higher attention threshold (empty queue)", () => {
    const summary = buildPredictiveRiskSummary({
      documents: docs,
      findings,
      disputes,
      startDate: "2024-06-01T00:00:00.000Z",
      endDate: "2024-06-30T23:59:59.999Z",
      thresholds: {
        minDocuments: 2,
        attentionScore: 99,
        criticalAt: 80,
        highAt: 60,
        mediumAt: 40,
      },
    });
    expect(summary.attentionQueue).toHaveLength(0);
    expect(summary.summary.needingAttention).toBe(0);
    expect(summary.summary.entitiesScored).toBeGreaterThan(0);
  });
});
