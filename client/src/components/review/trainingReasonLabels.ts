/** Labels for auditActions.supportedActions.trainingReasonCodes (TrainLoop). */
export const TRAINING_REASON_OPTIONS = [
  { value: "ocr_misread", label: "OCR misread the value" },
  { value: "roi_misaligned", label: "ROI region misaligned" },
  { value: "rule_wrong", label: "Rule / threshold wrong" },
  { value: "template_mismatch", label: "Wrong template matched" },
  { value: "true_defect", label: "True defect (teach the model)" },
] as const;

export type TrainingReasonCode = (typeof TRAINING_REASON_OPTIONS)[number]["value"];
