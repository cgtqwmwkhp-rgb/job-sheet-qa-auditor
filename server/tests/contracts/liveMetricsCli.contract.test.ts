import { describe, expect, it } from "vitest";
import {
  collectLiveDriftMetricsFromRows,
  collectLiveEvalResultsFromRows,
} from "../../../scripts/lib/liveMetrics";
import { runEvaluation } from "../../../scripts/eval/run-eval";
import { DEFAULT_EVAL_CONFIG } from "../../../scripts/eval/types";
import { runDriftDetection } from "../../../scripts/drift/run-drift-check";
import { DEFAULT_DRIFT_CONFIG } from "../../../scripts/drift/types";
import type {
  DriftDocumentRow,
  DriftFindingRow,
} from "../../services/driftAnalytics";

describe("live eval/drift CLI adapters", () => {
  const documents: DriftDocumentRow[] = [
    {
      jobSheetId: 101,
      technicianId: 7,
      templateSlug: "pump-inspection",
      assetType: "pump",
      result: "pass",
      confidenceScore: 94,
      processedAt: "2026-07-01T10:00:00Z",
    },
    {
      jobSheetId: 102,
      technicianId: 7,
      templateSlug: "pump-inspection",
      assetType: "pump",
      result: "review_queue",
      confidenceScore: 62,
      processedAt: "2026-07-02T10:00:00Z",
    },
    {
      jobSheetId: 103,
      technicianId: 8,
      templateSlug: "generator-maintenance",
      assetType: "generator",
      result: "waived",
      confidenceScore: 81,
      processedAt: "2026-07-03T10:00:00Z",
    },
  ];

  const findings: DriftFindingRow[] = [
    {
      findingId: 9001,
      jobSheetId: 102,
      severity: "S1",
      occurredAt: "2026-07-02T10:15:00Z",
    },
  ];

  it("builds live eval results from injected rows without a DB", async () => {
    const liveResults = collectLiveEvalResultsFromRows({ documents, findings });

    expect(liveResults).toHaveLength(3);
    expect(liveResults.map(result => result.source)).toEqual([
      "sampled_production",
      "sampled_production",
      "sampled_production",
    ]);
    expect(liveResults[1].selection.isAmbiguous).toBe(true);
    expect(liveResults[1].fields[0].severity).toBe("S1");

    const report = await runEvaluation(DEFAULT_EVAL_CONFIG, {
      live: true,
      environment: "staging",
      collectLiveResults: async () => liveResults,
    });

    expect(report.environment).toBe("staging");
    expect(report.documentSummary).toEqual({
      total: 3,
      fixtures: 0,
      sampledProduction: 3,
      synthetic: 0,
    });
    expect(report.selectionMetrics.accuracy).toBeCloseTo(2 / 3);
    expect(report.pass2Metrics.pass2Rate).toBeCloseTo(1 / 3);
  });

  it("builds live drift metrics from injected rows without a DB", async () => {
    const metrics = collectLiveDriftMetricsFromRows({ documents, findings });

    expect(metrics.ambiguityData.ambiguousSelections).toBe(1);
    expect(metrics.overrideData.overrides).toBe(1);
    expect(metrics.scanQualityData.lowQualityScans).toBe(1);
    expect(metrics.selectionAccuracy).toBeCloseTo(2 / 3);
    expect(metrics.fieldAccuracy).toBeCloseTo(2 / 3);

    const report = await runDriftDetection(DEFAULT_DRIFT_CONFIG, {
      live: true,
      environment: "staging",
      collectLiveMetrics: async () => metrics,
    });

    expect(report.environment).toBe("staging");
    expect(report.currentMetrics.ambiguityRate).toBeCloseTo(1 / 3);
    expect(report.currentMetrics.overrideRate).toBeCloseTo(1 / 3);
    expect(report.currentMetrics.pass2Rate).toBeCloseTo(1 / 3);
  });
});
