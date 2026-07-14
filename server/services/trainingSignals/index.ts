/**
 * Training signal helpers — structured payloads for TrainLoop hardening.
 */

import {
  isTrainingReasonCode,
  type TrainingReasonCode,
  type TrainingSignal,
  type TrainingSignalType,
} from "./types";

export {
  TRAINING_REASON_CODES,
  TRAINING_SIGNAL_TYPES,
  isTrainingReasonCode,
  type TrainingReasonCode,
  type TrainingSignal,
  type TrainingSignalType,
} from "./types";

export { resolveJobSheetsForFindings } from "./resolveSamples";

const DEFAULT_TRAINING_REASON: TrainingReasonCode = "true_defect";

export function normalizeTrainingReasonCode(
  value: string | undefined | null
): TrainingReasonCode {
  return isTrainingReasonCode(value) ? value : DEFAULT_TRAINING_REASON;
}

export function buildTrainingSignal(input: {
  signalType: TrainingSignalType;
  findingId: number;
  trainingReasonCode?: string | null;
  auditResultId?: number;
  jobSheetId?: number;
  ruleId?: string | null;
  findingReasonCode?: string;
  fieldName?: string;
  originalValue?: string;
  correctedValue?: string;
  reviewerReason?: string;
  capturedAt?: Date;
}): TrainingSignal {
  return {
    signalType: input.signalType,
    reasonCode: normalizeTrainingReasonCode(input.trainingReasonCode),
    findingId: input.findingId,
    auditResultId: input.auditResultId,
    jobSheetId: input.jobSheetId,
    ruleId: input.ruleId ?? null,
    findingReasonCode: input.findingReasonCode,
    fieldName: input.fieldName,
    originalValue: input.originalValue,
    correctedValue: input.correctedValue,
    reviewerReason: input.reviewerReason,
    capturedAt: (input.capturedAt ?? new Date()).toISOString(),
  };
}

/** Merge trainingSignal into audit log details JSON. */
export function withTrainingSignalDetails(
  details: Record<string, unknown>,
  signal: TrainingSignal
): Record<string, unknown> {
  return {
    ...details,
    trainingSignal: signal,
  };
}

export function extractTrainingSignal(details: unknown): TrainingSignal | null {
  if (!details || typeof details !== "object") return null;
  const raw = (details as { trainingSignal?: unknown }).trainingSignal;
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Partial<TrainingSignal>;
  if (
    typeof s.findingId !== "number" ||
    typeof s.signalType !== "string" ||
    typeof s.reasonCode !== "string" ||
    !isTrainingReasonCode(s.reasonCode)
  ) {
    return null;
  }
  return s as TrainingSignal;
}
