/**
 * Wave-7 Template Memory — closed-loop correction → memory → apply.
 */

export {
  FEATURE_TEMPLATE_MEMORY_CAPTURE,
  FEATURE_TEMPLATE_MEMORY_APPLY,
  TEMPLATE_MEMORY_AGREE_THRESHOLD,
  isTemplateMemoryCaptureEnabled,
  isTemplateMemoryApplyEnabled,
  memoryKindForReason,
  canAutoShadow,
  type MemoryAppliedEntry,
  type RecordCorrectionInput,
  type MemoryKind,
  type PromotionStatus,
} from "./types";

export {
  insertReviewCorrection,
  ingestCorrectionIntoMemory,
  softUndoCorrection,
  listMemoryForTemplate,
  loadApplicableMemory,
} from "./store";

export {
  applyValueMemoryToFields,
  filterFindingsWithRuleMemory,
  loadMemoryForPipeline,
} from "./apply";

import {
  isTemplateMemoryCaptureEnabled,
  memoryKindForReason,
  canAutoShadow,
  type RecordCorrectionInput,
} from "./types";
import { ingestCorrectionIntoMemory, insertReviewCorrection } from "./store";

/**
 * Always append review_corrections (P0 immutable events).
 * Memory candidate ingest is gated by FEATURE_TEMPLATE_MEMORY_CAPTURE.
 */
export async function recordCorrectionEvent(
  input: RecordCorrectionInput
): Promise<{
  correctionId: number | null;
  candidateId: number | null;
  promotionStatus: string | null;
  agreeCount: number | null;
  studioConfirmRequired: boolean;
  captured: boolean;
}> {
  const kind = memoryKindForReason(
    input.trainingReasonCode,
    input.correctionType
  );
  const studioConfirmRequired = kind != null && !canAutoShadow(kind);

  try {
    const inserted = await insertReviewCorrection(input);
    if (!inserted) {
      return {
        correctionId: null,
        candidateId: null,
        promotionStatus: null,
        agreeCount: null,
        studioConfirmRequired,
        captured: false,
      };
    }

    if (!isTemplateMemoryCaptureEnabled()) {
      return {
        correctionId: inserted.correctionId,
        candidateId: null,
        promotionStatus: null,
        agreeCount: null,
        studioConfirmRequired,
        captured: inserted.created,
      };
    }

    const mem = await ingestCorrectionIntoMemory(input, inserted.correctionId);
    return {
      correctionId: inserted.correctionId,
      candidateId: mem?.candidateId ?? null,
      promotionStatus: mem?.promotionStatus ?? null,
      agreeCount: mem?.agreeCount ?? null,
      studioConfirmRequired:
        mem?.studioConfirmRequired ?? studioConfirmRequired,
      captured: inserted.created,
    };
  } catch (err) {
    console.warn(
      "[templateMemory] recordCorrectionEvent failed:",
      err instanceof Error ? err.message : err
    );
    return {
      correctionId: null,
      candidateId: null,
      promotionStatus: null,
      agreeCount: null,
      studioConfirmRequired,
      captured: false,
    };
  }
}
