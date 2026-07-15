/** Labels for auditActions.supportedActions.trainingReasonCodes (TrainLoop). */
export const TRAINING_REASON_OPTIONS = [
  { value: "ocr_misread", label: "OCR misread the value" },
  { value: "roi_misaligned", label: "ROI region misaligned" },
  { value: "rule_wrong", label: "Rule / threshold wrong" },
  { value: "template_mismatch", label: "Wrong template matched" },
  { value: "true_defect", label: "True defect (case only — no auto-suppress)" },
] as const;

export type TrainingReasonCode =
  (typeof TRAINING_REASON_OPTIONS)[number]["value"];

/** Reasons that may auto-shadow into template memory after N agreeing fixes. */
export const AUTO_LEARN_REASONS = new Set<TrainingReasonCode>([
  "ocr_misread",
  "rule_wrong",
]);

/** Reasons that require Template Studio confirm (never silent). */
export const STUDIO_CONFIRM_REASONS = new Set<TrainingReasonCode>([
  "roi_misaligned",
  "template_mismatch",
]);

/** Soft-apply threshold (must match server TEMPLATE_MEMORY_AGREE_THRESHOLD). */
export const TEMPLATE_MEMORY_AGREE_THRESHOLD = 3;
