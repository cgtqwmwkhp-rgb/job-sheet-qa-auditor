/**
 * Field exact-match F1 gate types (Wave-4 A3)
 *
 * Weekly / CI measurement of labelled OCR field accuracy.
 * Honest unavailable when N is below the readiness threshold.
 */

export type FieldF1GateStatus = "pass" | "fail" | "unavailable";

export interface FieldObservation {
  documentId: string;
  fieldId: string;
  /** Ground-truth label */
  expected: string | number | boolean | null;
  /** Model / pipeline prediction */
  predicted: string | number | boolean | null;
  severity?: "S0" | "S1" | "S2" | "S3";
}

export interface FieldF1Metrics {
  sampleCount: number;
  minSamplesRequired: number;
  measurementReady: boolean;
  /** Authoritative F1 only when measurementReady; otherwise null. */
  f1: number | null;
  precision: number | null;
  recall: number | null;
  /** Provisional F1 while accumulating labels (never use as a pass gate). */
  provisionalF1?: number;
  truePositives: number;
  predictedPositive: number;
  labelledPositive: number;
  exactMatches: number;
  note?: string;
}

export interface FieldF1GateResult {
  status: FieldF1GateStatus;
  metrics: FieldF1Metrics;
  minExactMatchF1: number;
  blockers: string[];
}

export interface FieldF1GateOptions {
  minSamplesRequired?: number;
  minExactMatchF1?: number;
  /** When true, only S0/S1 observations contribute to the gate. */
  criticalOnly?: boolean;
}

/** Default minimum labelled field observations before F1 is measurement-ready. */
export const FIELD_F1_MIN_SAMPLES = 50;

/** Default exact-match F1 floor for a ready gate. */
export const FIELD_F1_MIN_SCORE = 0.9;
