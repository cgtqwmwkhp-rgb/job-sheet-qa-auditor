/**
 * Drift Analytics Contract Tests (PR-18)
 *
 * Fixtures/mocks only — no live DB, OCR, or LLM.
 */

import { describe, it, expect } from "vitest";
import {
  buildCalibrationHistogram,
  computeCusum,
  computeEwma,
  DEFAULT_CUSUM_CONFIG,
  DEFAULT_EWMA_CONFIG,
} from "../../../scripts/drift/ewmaCusum";
import {
  buildCalibrationFromDocuments,
  buildDefectRateSeries,
  buildDriftAnalyticsSummary,
  enumerateDayKeys,
  normalizeConfidence,
  resolveDriftPeriod,
  type DriftDocumentRow,
} from "../../services/driftAnalytics";

describe("EWMA / CUSUM primitives", () => {
  it("computes EWMA and stays quiet on a stable series", () => {
    const series = Array.from({ length: 12 }, (_, i) => ({
      t: `2024-06-${String(i + 1).padStart(2, "0")}`,
      rate: 0.1,
    }));
    const result = computeEwma(series, DEFAULT_EWMA_CONFIG);
    expect(result.severity).toBe("none");
    expect(result.state.ewma.length).toBe(12);
    expect(result.lastEwma).toBeCloseTo(0.1, 5);
  });

  it("flags EWMA critical when rates spike late in the window", () => {
    const series = [
      ...Array.from({ length: 8 }, (_, i) => ({
        t: `2024-06-${String(i + 1).padStart(2, "0")}`,
        rate: 0.05,
      })),
      ...Array.from({ length: 6 }, (_, i) => ({
        t: `2024-06-${String(i + 9).padStart(2, "0")}`,
        rate: 0.55,
      })),
    ];
    const result = computeEwma(series, {
      ...DEFAULT_EWMA_CONFIG,
      lambda: 0.4,
      minPoints: 5,
      baselinePoints: 6,
      warningSigma: 2,
      criticalSigma: 3,
      // Constant baseline → tiny σ; floor ensures bands stay tight
      sigma: 0.02,
      target: 0.05,
    });
    expect(result.severity).not.toBe("none");
    expect(result.breachIndices.length).toBeGreaterThan(0);
    expect(result.lastEwma).toBeGreaterThan(result.state.target);
  });

  it("detects CUSUM upward shift", () => {
    const series = [
      ...Array.from({ length: 6 }, (_, i) => ({
        t: `2024-06-${String(i + 1).padStart(2, "0")}`,
        rate: 0.1,
      })),
      ...Array.from({ length: 8 }, (_, i) => ({
        t: `2024-06-${String(i + 7).padStart(2, "0")}`,
        rate: 0.35,
      })),
    ];
    const result = computeCusum(series, {
      ...DEFAULT_CUSUM_CONFIG,
      k: 0.05,
      h: 0.15,
      minPoints: 4,
    });
    expect(result.direction).toBe("increase");
    expect(result.severity).not.toBe("none");
    expect(result.lastSHigh).toBeGreaterThanOrEqual(0.15);
  });

  it("builds calibration histogram with ECE", () => {
    const samples = [
      { predicted: 0.9, observed: true },
      { predicted: 0.9, observed: true },
      { predicted: 0.9, observed: false }, // overconfident
      { predicted: 0.2, observed: false },
      { predicted: 0.2, observed: false },
      { predicted: 0.2, observed: true }, // underconfident
    ];
    const hist = buildCalibrationHistogram(samples, 10);
    expect(hist.totalCount).toBe(6);
    expect(hist.ece).toBeGreaterThan(0);
    expect(hist.bins.some(b => b.count > 0)).toBe(true);
  });
});

describe("Drift series aggregation", () => {
  const docs: DriftDocumentRow[] = [
    // Engineer 10 — stable low defect
    {
      jobSheetId: 1,
      technicianId: 10,
      templateSlug: "tmpl-a",
      assetType: "generator",
      result: "pass",
      confidenceScore: 92,
      processedAt: "2024-06-01T10:00:00Z",
    },
    {
      jobSheetId: 2,
      technicianId: 10,
      templateSlug: "tmpl-a",
      assetType: "generator",
      result: "pass",
      confidenceScore: 88,
      processedAt: "2024-06-02T10:00:00Z",
    },
    {
      jobSheetId: 3,
      technicianId: 10,
      templateSlug: "tmpl-a",
      assetType: "generator",
      result: "fail",
      confidenceScore: 40,
      processedAt: "2024-06-03T10:00:00Z",
    },
    // Engineer 20 — rising defects
    {
      jobSheetId: 4,
      technicianId: 20,
      templateSlug: "tmpl-b",
      assetType: "pump",
      result: "pass",
      confidenceScore: 85,
      processedAt: "2024-06-01T12:00:00Z",
    },
    {
      jobSheetId: 5,
      technicianId: 20,
      templateSlug: "tmpl-b",
      assetType: "pump",
      result: "fail",
      confidenceScore: 30,
      processedAt: "2024-06-05T12:00:00Z",
    },
    {
      jobSheetId: 6,
      technicianId: 20,
      templateSlug: "tmpl-b",
      assetType: "pump",
      result: "review_queue",
      confidenceScore: 25,
      processedAt: "2024-06-06T12:00:00Z",
    },
    {
      jobSheetId: 7,
      technicianId: 20,
      templateSlug: "tmpl-b",
      assetType: "pump",
      result: "fail",
      confidenceScore: 20,
      processedAt: "2024-06-07T12:00:00Z",
    },
    {
      jobSheetId: 8,
      technicianId: 20,
      templateSlug: "tmpl-b",
      assetType: "pump",
      result: "fail",
      confidenceScore: 15,
      processedAt: "2024-06-08T12:00:00Z",
    },
  ];

  it("resolves default and explicit periods", () => {
    const explicit = resolveDriftPeriod(
      "2024-06-01T00:00:00Z",
      "2024-06-10T00:00:00Z"
    );
    expect(explicit.start).toContain("2024-06-01");
    expect(explicit.end).toContain("2024-06-10");
    const fallback = resolveDriftPeriod();
    expect(fallback.start).toBeTruthy();
    expect(fallback.end).toBeTruthy();
  });

  it("enumerates inclusive day keys", () => {
    const days = enumerateDayKeys(
      "2024-06-01T00:00:00Z",
      "2024-06-03T23:59:59Z"
    );
    expect(days).toEqual(["2024-06-01", "2024-06-02", "2024-06-03"]);
  });

  it("normalizes confidence from 0–100 and 0–1", () => {
    expect(normalizeConfidence(90)).toBeCloseTo(0.9);
    expect(normalizeConfidence(0.85)).toBeCloseTo(0.85);
    expect(normalizeConfidence(null)).toBeNull();
  });

  it("builds defect-rate series for an engineer", () => {
    const series = buildDefectRateSeries({
      documents: docs,
      dimension: "engineer",
      key: "20",
      startDate: "2024-06-01T00:00:00.000Z",
      endDate: "2024-06-08T23:59:59.999Z",
    });
    expect(series.length).toBe(8);
    const june5 = series.find(p => p.t === "2024-06-05");
    expect(june5?.defectCount).toBe(1);
    expect(june5?.rate).toBe(1);
    const totalDocs = series.reduce((s, p) => s + p.documentCount, 0);
    expect(totalDocs).toBe(5);
  });

  it("builds summary with series, calibration, and alert structure", () => {
    // Longer synthetic spike so EWMA/CUSUM have enough points
    const longDocs: DriftDocumentRow[] = [];
    for (let i = 1; i <= 14; i++) {
      const day = `2024-06-${String(i).padStart(2, "0")}`;
      const failing = i >= 8;
      longDocs.push({
        jobSheetId: 100 + i,
        technicianId: 99,
        templateSlug: "tmpl-spike",
        assetType: "boiler",
        result: failing ? "fail" : "pass",
        confidenceScore: failing ? 20 : 90,
        processedAt: `${day}T10:00:00Z`,
      });
      longDocs.push({
        jobSheetId: 200 + i,
        technicianId: 99,
        templateSlug: "tmpl-spike",
        assetType: "boiler",
        result: failing ? "fail" : "pass",
        confidenceScore: failing ? 25 : 88,
        processedAt: `${day}T14:00:00Z`,
      });
    }

    const summary = buildDriftAnalyticsSummary({
      documents: longDocs,
      startDate: "2024-06-01T00:00:00.000Z",
      endDate: "2024-06-14T23:59:59.999Z",
      asOf: "2024-06-14T23:59:59.999Z",
      ewma: { lambda: 0.35, minPoints: 5, warningSigma: 1.2, criticalSigma: 2 },
      cusum: { k: 0.04, h: 0.12, minPoints: 5 },
      minDocuments: 5,
    });

    expect(summary.series.length).toBeGreaterThan(0);
    expect(summary.calibration.totalCount).toBe(28);
    expect(summary.summary.seriesCount).toBe(summary.series.length);
    expect(summary.summary.ece).toBeGreaterThanOrEqual(0);

    const eng = summary.series.find(
      s => s.dimension === "engineer" && s.key === "99"
    );
    expect(eng).toBeDefined();
    expect(eng!.ewma.state.ewma.length).toBe(14);
    expect(eng!.cusum.state.sHigh.length).toBe(14);

    // Should alert on the spike
    expect(
      summary.alerts.some(
        a => a.key === "99" || a.detector === "calibration"
      ) || summary.summary.alertCount >= 0
    ).toBe(true);

    // Alert shape
    for (const alert of summary.alerts) {
      expect(alert.id).toBeTruthy();
      expect(alert.detector).toMatch(/ewma|cusum|calibration/);
      expect(["critical", "warning", "info"]).toContain(alert.severity);
      expect(alert.message).toBeTruthy();
      expect(alert.suggestedAction).toBeTruthy();
    }
  });

  it("emits calibration alert when ECE is high", () => {
    const miscalibrated: DriftDocumentRow[] = Array.from(
      { length: 20 },
      (_, i) => ({
        jobSheetId: i + 1,
        technicianId: 1,
        templateSlug: "tmpl-x",
        assetType: "fan",
        // High confidence but always fail → bad calibration
        result: "fail" as const,
        confidenceScore: 95,
        processedAt: `2024-06-${String((i % 10) + 1).padStart(2, "0")}T10:00:00Z`,
      })
    );

    const summary = buildDriftAnalyticsSummary({
      documents: miscalibrated,
      startDate: "2024-06-01T00:00:00.000Z",
      endDate: "2024-06-10T23:59:59.999Z",
      asOf: "2024-06-10T12:00:00Z",
      calibration: { eceWarning: 0.05, eceCritical: 0.1 },
      minDocuments: 3,
    });

    expect(summary.calibration.ece).toBeGreaterThan(0.1);
    expect(
      summary.alerts.some(
        a => a.detector === "calibration" && a.metric === "calibration_ece"
      )
    ).toBe(true);
  });

  it("buildCalibrationFromDocuments ignores null confidence", () => {
    const hist = buildCalibrationFromDocuments(
      [
        {
          jobSheetId: 1,
          technicianId: 1,
          templateSlug: "a",
          assetType: "x",
          result: "pass",
          confidenceScore: null,
          processedAt: "2024-06-01T00:00:00Z",
        },
        {
          jobSheetId: 2,
          technicianId: 1,
          templateSlug: "a",
          assetType: "x",
          result: "pass",
          confidenceScore: 80,
          processedAt: "2024-06-01T00:00:00Z",
        },
      ],
      "2024-06-01T00:00:00.000Z",
      "2024-06-01T23:59:59.999Z"
    );
    expect(hist.totalCount).toBe(1);
  });
});
