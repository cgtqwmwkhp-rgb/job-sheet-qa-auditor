/**
 * Drift Analytics types (PR-18)
 *
 * EWMA/CUSUM on defect-rate series per engineer / asset / template,
 * calibration histograms, and alerting.
 */

import type {
  CalibrationHistogram,
  CusumResult,
  EwmaResult,
  RatePoint,
} from "../../../scripts/drift/ewmaCusum";

export type DriftSeriesDimension = "engineer" | "asset" | "template";

export type DriftAlertSeverity = "critical" | "warning" | "info";

export interface DriftDocumentRow {
  jobSheetId: number;
  technicianId: number | null;
  templateSlug: string | null;
  assetType: string | null;
  result: "pass" | "fail" | "review_queue" | "waived";
  /** 0–100 or 0–1; normalized in aggregate */
  confidenceScore: number | null;
  processedAt: Date | string;
}

export interface DriftFindingRow {
  findingId: number;
  jobSheetId: number;
  severity: "S0" | "S1" | "S2" | "S3";
  occurredAt: Date | string;
}

export interface DriftSeriesPoint extends RatePoint {
  documentCount: number;
  defectCount: number;
}

export interface DriftSeriesAnalysis {
  dimension: DriftSeriesDimension;
  key: string;
  label: string;
  series: DriftSeriesPoint[];
  ewma: EwmaResult;
  cusum: CusumResult;
  latestDefectRate: number;
  documentCount: number;
}

export interface DriftAlert {
  id: string;
  dimension: DriftSeriesDimension;
  key: string;
  label: string;
  detector: "ewma" | "cusum" | "calibration";
  severity: DriftAlertSeverity;
  message: string;
  metric: string;
  currentValue: number;
  threshold: number;
  suggestedAction: string;
  detectedAt: string;
}

export interface DriftAnalyticsSummary {
  period: { start: string; end: string };
  asOf: string;
  series: DriftSeriesAnalysis[];
  calibration: CalibrationHistogram;
  alerts: DriftAlert[];
  summary: {
    seriesCount: number;
    alertCount: number;
    criticalAlerts: number;
    warningAlerts: number;
    ece: number;
    requiresImmediateAction: boolean;
  };
}

export interface DriftEwmaThresholds {
  lambda: number;
  warningSigma: number;
  criticalSigma: number;
  minPoints: number;
}

export interface DriftCusumThresholds {
  k: number;
  h: number;
  minPoints: number;
}

export interface DriftCalibrationThresholds {
  /** ECE above this → warning */
  eceWarning: number;
  /** ECE above this → critical */
  eceCritical: number;
  /** Max bin abs-error warning */
  maxAbsErrorWarning: number;
}

export const DEFAULT_DRIFT_EWMA: DriftEwmaThresholds = {
  lambda: 0.2,
  warningSigma: 2,
  criticalSigma: 3,
  minPoints: 5,
};

export const DEFAULT_DRIFT_CUSUM: DriftCusumThresholds = {
  k: 0.02,
  h: 0.08,
  minPoints: 5,
};

export const DEFAULT_DRIFT_CALIBRATION: DriftCalibrationThresholds = {
  eceWarning: 0.08,
  eceCritical: 0.15,
  maxAbsErrorWarning: 0.2,
};
