/**
 * Training signal taxonomy for override / field-correction capture (TrainLoop R2/R3).
 *
 * Persisted inside system_audit_log.details.trainingSignal — no new table.
 */

export const TRAINING_REASON_CODES = [
  "ocr_misread",
  "roi_misaligned",
  "rule_wrong",
  "template_mismatch",
  "true_defect",
] as const;

export type TrainingReasonCode = (typeof TRAINING_REASON_CODES)[number];

export const TRAINING_SIGNAL_TYPES = ["field_correction", "override"] as const;

export type TrainingSignalType = (typeof TRAINING_SIGNAL_TYPES)[number];

export interface TrainingSignal {
  signalType: TrainingSignalType;
  /** Reviewer-selected training taxonomy (defaults to true_defect when omitted). */
  reasonCode: TrainingReasonCode;
  findingId: number;
  auditResultId?: number;
  jobSheetId?: number;
  ruleId?: string | null;
  /** Finding defect reason code from audit_findings.reasonCode */
  findingReasonCode?: string;
  fieldName?: string;
  originalValue?: string;
  correctedValue?: string;
  /** Free-text reviewer justification (override / waive context). */
  reviewerReason?: string;
  capturedAt: string;
}

export function isTrainingReasonCode(
  value: string | undefined | null
): value is TrainingReasonCode {
  return (
    value != null &&
    (TRAINING_REASON_CODES as readonly string[]).includes(value)
  );
}
