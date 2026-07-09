/**
 * Drift Analytics — pure aggregation (PR-18)
 *
 * Builds daily defect-rate series per engineer / asset / template,
 * runs EWMA + CUSUM, builds confidence calibration histograms, emits alerts.
 * Fixtures/mocks only in contract tests — no live OCR/LLM.
 */

import {
  buildCalibrationHistogram,
  computeCusum,
  computeEwma,
  type CalibrationHistogram,
} from "../../../scripts/drift/ewmaCusum";
import {
  DEFAULT_DRIFT_CALIBRATION,
  DEFAULT_DRIFT_CUSUM,
  DEFAULT_DRIFT_EWMA,
  type DriftAlert,
  type DriftAnalyticsSummary,
  type DriftCalibrationThresholds,
  type DriftCusumThresholds,
  type DriftDocumentRow,
  type DriftEwmaThresholds,
  type DriftFindingRow,
  type DriftSeriesAnalysis,
  type DriftSeriesDimension,
  type DriftSeriesPoint,
} from "./types";

const UNKNOWN = "Unknown";

function toIso(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toISOString();
}

function dayKey(value: Date | string): string {
  return toIso(value).slice(0, 10);
}

function defaultPeriod(): { start: string; end: string } {
  const end = new Date();
  const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function resolveDriftPeriod(
  startDate?: string,
  endDate?: string
): { start: string; end: string } {
  const fallback = defaultPeriod();
  return {
    start: startDate ? new Date(startDate).toISOString() : fallback.start,
    end: endDate ? new Date(endDate).toISOString() : fallback.end,
  };
}

function inPeriod(value: Date | string, start: string, end: string): boolean {
  const t = new Date(value).getTime();
  return t >= new Date(start).getTime() && t <= new Date(end).getTime();
}

function normalizeKey(
  value: string | number | null | undefined,
  fallback: string = UNKNOWN
): string {
  if (value == null) return fallback;
  const s = String(value).trim();
  return s.length > 0 ? s : fallback;
}

/** Normalize confidence to [0, 1]. Accepts 0–1 or 0–100. */
export function normalizeConfidence(
  score: number | null | undefined
): number | null {
  if (score == null || !Number.isFinite(score)) return null;
  if (score < 0) return 0;
  if (score > 1 && score <= 100) return score / 100;
  if (score > 100) return 1;
  return score;
}

function isDefectResult(result: DriftDocumentRow["result"]): boolean {
  return result === "fail" || result === "review_queue";
}

function dimensionKey(
  doc: DriftDocumentRow,
  dimension: DriftSeriesDimension
): string {
  if (dimension === "engineer") return normalizeKey(doc.technicianId);
  if (dimension === "asset") return normalizeKey(doc.assetType);
  return normalizeKey(doc.templateSlug);
}

function dimensionLabel(
  doc: DriftDocumentRow,
  dimension: DriftSeriesDimension,
  key: string
): string {
  if (dimension === "engineer") {
    return key === UNKNOWN ? "Unknown engineer" : `Engineer ${key}`;
  }
  if (dimension === "asset") {
    return key === UNKNOWN ? "Unknown asset" : key;
  }
  return key === UNKNOWN ? "Unknown template" : key;
}

/**
 * Enumerate inclusive UTC day keys from start..end.
 */
export function enumerateDayKeys(startIso: string, endIso: string): string[] {
  const days: string[] = [];
  const start = new Date(startIso.slice(0, 10) + "T00:00:00.000Z");
  const end = new Date(endIso.slice(0, 10) + "T00:00:00.000Z");
  for (let t = start.getTime(); t <= end.getTime(); t += 24 * 60 * 60 * 1000) {
    days.push(new Date(t).toISOString().slice(0, 10));
  }
  return days;
}

/**
 * Build a daily defect-rate series for one dimension key.
 * Days with zero documents keep rate 0 and n=0 (EWMA still advances).
 */
export function buildDefectRateSeries(input: {
  documents: DriftDocumentRow[];
  findings?: DriftFindingRow[];
  dimension: DriftSeriesDimension;
  key: string;
  startDate: string;
  endDate: string;
}): DriftSeriesPoint[] {
  const days = enumerateDayKeys(input.startDate, input.endDate);
  const byDay = new Map<string, { docs: number; defects: number }>();
  for (const d of days) byDay.set(d, { docs: 0, defects: 0 });

  for (const doc of input.documents) {
    if (!inPeriod(doc.processedAt, input.startDate, input.endDate)) continue;
    if (dimensionKey(doc, input.dimension) !== input.key) continue;
    const day = dayKey(doc.processedAt);
    const bucket = byDay.get(day);
    if (!bucket) continue;
    bucket.docs++;
    if (isDefectResult(doc.result)) bucket.defects++;
  }

  // Optional: count findings as defects when document result is pass but findings exist
  if (input.findings && input.findings.length > 0) {
    const docsById = new Map(
      input.documents
        .filter(d => dimensionKey(d, input.dimension) === input.key)
        .map(d => [d.jobSheetId, d])
    );
    const counted = new Set<string>();
    for (const f of input.findings) {
      const doc = docsById.get(f.jobSheetId);
      if (!doc) continue;
      if (!inPeriod(f.occurredAt, input.startDate, input.endDate)) continue;
      if (isDefectResult(doc.result)) continue; // already counted
      const day = dayKey(f.occurredAt);
      const mark = `${day}:${f.jobSheetId}`;
      if (counted.has(mark)) continue;
      counted.add(mark);
      const bucket = byDay.get(day);
      if (bucket && bucket.docs > 0) {
        // Finding on a pass doc still elevates defect rate via finding-day bump
        bucket.defects = Math.min(bucket.docs, bucket.defects + 1);
      }
    }
  }

  return days.map(t => {
    const b = byDay.get(t)!;
    const rate = b.docs > 0 ? b.defects / b.docs : 0;
    return {
      t,
      rate,
      n: b.docs,
      documentCount: b.docs,
      defectCount: b.defects,
    };
  });
}

function alertId(
  dimension: DriftSeriesDimension,
  key: string,
  detector: string
): string {
  return `drift-${dimension}-${key}-${detector}`;
}

function analyzeSeries(input: {
  dimension: DriftSeriesDimension;
  key: string;
  label: string;
  series: DriftSeriesPoint[];
  ewmaCfg: DriftEwmaThresholds;
  cusumCfg: DriftCusumThresholds;
  asOf: string;
}): { analysis: DriftSeriesAnalysis; alerts: DriftAlert[] } {
  const ewma = computeEwma(input.series, input.ewmaCfg);
  const cusum = computeCusum(input.series, input.cusumCfg);
  const documentCount = input.series.reduce((s, p) => s + p.documentCount, 0);
  const latest =
    [...input.series].reverse().find(p => p.documentCount > 0) ??
    input.series[input.series.length - 1];

  const analysis: DriftSeriesAnalysis = {
    dimension: input.dimension,
    key: input.key,
    label: input.label,
    series: input.series,
    ewma,
    cusum,
    latestDefectRate: latest?.rate ?? 0,
    documentCount,
  };

  const alerts: DriftAlert[] = [];

  if (ewma.severity !== "none") {
    alerts.push({
      id: alertId(input.dimension, input.key, "ewma"),
      dimension: input.dimension,
      key: input.key,
      label: input.label,
      detector: "ewma",
      severity: ewma.severity,
      message: `EWMA defect-rate drift on ${input.label}: last EWMA ${(ewma.lastEwma * 100).toFixed(1)}% (target ${(ewma.state.target * 100).toFixed(1)}%)`,
      metric: "ewma_defect_rate",
      currentValue: ewma.lastEwma,
      threshold:
        ewma.severity === "critical"
          ? ewma.state.upperCritical
          : ewma.state.upperWarning,
      suggestedAction:
        "Review recent audits for this cohort and check for process or template changes",
      detectedAt: input.asOf,
    });
  }

  if (cusum.severity !== "none" && cusum.direction === "increase") {
    alerts.push({
      id: alertId(input.dimension, input.key, "cusum"),
      dimension: input.dimension,
      key: input.key,
      label: input.label,
      detector: "cusum",
      severity: cusum.severity,
      message: `CUSUM upward shift on ${input.label}: S+=${cusum.lastSHigh.toFixed(3)} (h=${input.cusumCfg.h})`,
      metric: "cusum_s_high",
      currentValue: cusum.lastSHigh,
      threshold: input.cusumCfg.h,
      suggestedAction:
        "Investigate sustained defect-rate increase; consider coaching or template fix pack",
      detectedAt: input.asOf,
    });
  }

  return { analysis, alerts };
}

export function buildCalibrationFromDocuments(
  documents: DriftDocumentRow[],
  startDate: string,
  endDate: string
): CalibrationHistogram {
  const samples: Array<{ predicted: number; observed: boolean }> = [];
  for (const doc of documents) {
    if (!inPeriod(doc.processedAt, startDate, endDate)) continue;
    const predicted = normalizeConfidence(doc.confidenceScore);
    if (predicted == null) continue;
    // Observed "positive" = audit passed (well-calibrated confidence predicts pass)
    samples.push({
      predicted,
      observed: doc.result === "pass" || doc.result === "waived",
    });
  }
  return buildCalibrationHistogram(samples);
}

function calibrationAlerts(
  calibration: CalibrationHistogram,
  thresholds: DriftCalibrationThresholds,
  asOf: string
): DriftAlert[] {
  const alerts: DriftAlert[] = [];
  if (calibration.totalCount === 0) return alerts;

  if (calibration.ece >= thresholds.eceCritical) {
    alerts.push({
      id: "drift-calibration-ece",
      dimension: "template",
      key: "_global",
      label: "Global calibration",
      detector: "calibration",
      severity: "critical",
      message: `Confidence calibration ECE critically high: ${(calibration.ece * 100).toFixed(1)}%`,
      metric: "calibration_ece",
      currentValue: calibration.ece,
      threshold: thresholds.eceCritical,
      suggestedAction:
        "Recalibrate confidence scores; review OCR/judgment model thresholds",
      detectedAt: asOf,
    });
  } else if (calibration.ece >= thresholds.eceWarning) {
    alerts.push({
      id: "drift-calibration-ece",
      dimension: "template",
      key: "_global",
      label: "Global calibration",
      detector: "calibration",
      severity: "warning",
      message: `Confidence calibration ECE elevated: ${(calibration.ece * 100).toFixed(1)}%`,
      metric: "calibration_ece",
      currentValue: calibration.ece,
      threshold: thresholds.eceWarning,
      suggestedAction: "Monitor calibration histograms; sample high-error bins",
      detectedAt: asOf,
    });
  }

  if (calibration.maxAbsError >= thresholds.maxAbsErrorWarning) {
    alerts.push({
      id: "drift-calibration-max-bin",
      dimension: "template",
      key: "_global",
      label: "Global calibration",
      detector: "calibration",
      severity: "warning",
      message: `Max calibration bin error ${(calibration.maxAbsError * 100).toFixed(1)}%`,
      metric: "calibration_max_abs_error",
      currentValue: calibration.maxAbsError,
      threshold: thresholds.maxAbsErrorWarning,
      suggestedAction: "Inspect over/under-confident confidence bands",
      detectedAt: asOf,
    });
  }

  return alerts;
}

/**
 * Full drift analytics summary across engineer / asset / template series.
 */
export function buildDriftAnalyticsSummary(input: {
  documents: DriftDocumentRow[];
  findings?: DriftFindingRow[];
  startDate?: string;
  endDate?: string;
  asOf?: Date | string;
  ewma?: Partial<DriftEwmaThresholds>;
  cusum?: Partial<DriftCusumThresholds>;
  calibration?: Partial<DriftCalibrationThresholds>;
  /** Minimum documents in a series to include */
  minDocuments?: number;
}): DriftAnalyticsSummary {
  const period = resolveDriftPeriod(input.startDate, input.endDate);
  const asOf = input.asOf ? toIso(input.asOf) : new Date().toISOString();
  const ewmaCfg = { ...DEFAULT_DRIFT_EWMA, ...input.ewma };
  const cusumCfg = { ...DEFAULT_DRIFT_CUSUM, ...input.cusum };
  const calibCfg = { ...DEFAULT_DRIFT_CALIBRATION, ...input.calibration };
  const minDocuments = input.minDocuments ?? 3;

  const docsInPeriod = input.documents.filter(d =>
    inPeriod(d.processedAt, period.start, period.end)
  );

  const dimensions: DriftSeriesDimension[] = ["engineer", "asset", "template"];
  const series: DriftSeriesAnalysis[] = [];
  const alerts: DriftAlert[] = [];

  for (const dimension of dimensions) {
    const keys = new Set<string>();
    const labelByKey = new Map<string, string>();
    for (const doc of docsInPeriod) {
      const key = dimensionKey(doc, dimension);
      keys.add(key);
      if (!labelByKey.has(key)) {
        labelByKey.set(key, dimensionLabel(doc, dimension, key));
      }
    }

    for (const key of Array.from(keys)) {
      const points = buildDefectRateSeries({
        documents: input.documents,
        findings: input.findings,
        dimension,
        key,
        startDate: period.start,
        endDate: period.end,
      });
      const documentCount = points.reduce((s, p) => s + p.documentCount, 0);
      if (documentCount < minDocuments) continue;

      const { analysis, alerts: seriesAlerts } = analyzeSeries({
        dimension,
        key,
        label: labelByKey.get(key) ?? key,
        series: points,
        ewmaCfg,
        cusumCfg,
        asOf,
      });
      series.push(analysis);
      alerts.push(...seriesAlerts);
    }
  }

  // Prefer series with alerts / higher latest rate first
  series.sort((a, b) => {
    const aAlert =
      a.ewma.severity !== "none" || a.cusum.direction === "increase";
    const bAlert =
      b.ewma.severity !== "none" || b.cusum.direction === "increase";
    if (aAlert !== bAlert) return aAlert ? -1 : 1;
    return b.latestDefectRate - a.latestDefectRate;
  });

  const calibration = buildCalibrationFromDocuments(
    input.documents,
    period.start,
    period.end
  );
  alerts.push(...calibrationAlerts(calibration, calibCfg, asOf));

  const severityOrder = { critical: 0, warning: 1, info: 2 };
  alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  const criticalAlerts = alerts.filter(a => a.severity === "critical").length;
  const warningAlerts = alerts.filter(a => a.severity === "warning").length;

  return {
    period,
    asOf,
    series,
    calibration,
    alerts,
    summary: {
      seriesCount: series.length,
      alertCount: alerts.length,
      criticalAlerts,
      warningAlerts,
      ece: calibration.ece,
      requiresImmediateAction: criticalAlerts > 0,
    },
  };
}
