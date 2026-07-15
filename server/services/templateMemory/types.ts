import type { TrainingReasonCode } from "../trainingSignals";

export const FEATURE_TEMPLATE_MEMORY_CAPTURE = "FEATURE_TEMPLATE_MEMORY_CAPTURE";
export const FEATURE_TEMPLATE_MEMORY_APPLY = "FEATURE_TEMPLATE_MEMORY_APPLY";

/** Evidence threshold before soft-apply (shadow). */
export const TEMPLATE_MEMORY_AGREE_THRESHOLD = 3;

export type MemoryKind =
  | "suppress_rule"
  | "value_alias"
  | "ocr_hint"
  | "roi_adjust"
  | "spec_gap";

export type PromotionStatus =
  | "collecting"
  | "candidate"
  | "shadow"
  | "approved"
  | "rejected"
  | "retired";

export type CorrectionType =
  | "field_correction"
  | "override"
  | "waive"
  | "flag"
  | "approve";

export interface MemoryAppliedEntry {
  candidateId: number;
  memoryKind: MemoryKind;
  fieldKey: string;
  ruleId: string | null;
  effect: string;
  promotionStatus: PromotionStatus;
}

export interface RecordCorrectionInput {
  correctionType: CorrectionType;
  trainingReasonCode: TrainingReasonCode;
  findingId: number;
  auditResultId: number;
  jobSheetId: number;
  templateId: number | null;
  templateVersionId: number | null;
  fieldKey: string;
  ruleId?: string | null;
  originalValue?: string | null;
  correctedValue?: string | null;
  reviewerId: number;
  reviewerReason?: string | null;
  idempotencyKey: string;
}

export function isTemplateMemoryCaptureEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return env[FEATURE_TEMPLATE_MEMORY_CAPTURE] === "true";
}

export function isTemplateMemoryApplyEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return env[FEATURE_TEMPLATE_MEMORY_APPLY] === "true";
}

/** Map training taxonomy → memory kind for auto-learn path. */
export function memoryKindForReason(
  reason: TrainingReasonCode,
  correctionType: CorrectionType
): MemoryKind | null {
  if (reason === "true_defect") return null;
  if (reason === "roi_misaligned" || reason === "template_mismatch") {
    return reason === "roi_misaligned" ? "roi_adjust" : "spec_gap";
  }
  if (reason === "rule_wrong") return "suppress_rule";
  if (reason === "ocr_misread") {
    return correctionType === "field_correction" ? "value_alias" : "ocr_hint";
  }
  return null;
}

/** Auto-shadow eligible kinds (hybrid-by-type product rule). */
export function canAutoShadow(kind: MemoryKind): boolean {
  return kind === "suppress_rule" || kind === "value_alias" || kind === "ocr_hint";
}
