import { createHash } from "crypto";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  reviewCorrections,
  templateMemoryCandidates,
  templateMemoryEvidence,
  templateMemoryPromotions,
  type InsertReviewCorrection,
} from "../../../drizzle/schema";
import { getDb } from "../../db";
import {
  TEMPLATE_MEMORY_AGREE_THRESHOLD,
  canAutoShadow,
  memoryKindForReason,
  type MemoryKind,
  type PromotionStatus,
  type RecordCorrectionInput,
} from "./types";

function payloadHash(kind: MemoryKind, payload: Record<string, unknown>): string {
  return createHash("sha256")
    .update(JSON.stringify({ kind, ...payload }))
    .digest("hex");
}

function buildPayload(input: RecordCorrectionInput, kind: MemoryKind) {
  if (kind === "suppress_rule") {
    return {
      ruleId: input.ruleId ?? null,
      fieldKey: input.fieldKey,
      action: "soft_suppress",
    };
  }
  if (kind === "value_alias" || kind === "ocr_hint") {
    return {
      fieldKey: input.fieldKey,
      from: input.originalValue ?? null,
      to: input.correctedValue ?? null,
    };
  }
  return {
    fieldKey: input.fieldKey,
    ruleId: input.ruleId ?? null,
    reason: input.trainingReasonCode,
    note: "studio_confirm_required",
  };
}

/**
 * Append-only correction row. Idempotent on idempotencyKey.
 * Returns correction id (existing or new).
 */
export async function insertReviewCorrection(
  input: RecordCorrectionInput
): Promise<{ correctionId: number; created: boolean } | null> {
  const db = await getDb();
  if (!db) return null;

  const row: InsertReviewCorrection = {
    correctionType: input.correctionType,
    trainingReasonCode: input.trainingReasonCode,
    findingId: input.findingId,
    auditResultId: input.auditResultId,
    jobSheetId: input.jobSheetId,
    templateId: input.templateId,
    templateVersionId: input.templateVersionId,
    fieldKey: input.fieldKey,
    ruleId: input.ruleId ?? null,
    originalValue: input.originalValue ?? null,
    correctedValue: input.correctedValue ?? null,
    reviewerId: input.reviewerId,
    reviewerReason: input.reviewerReason ?? null,
    idempotencyKey: input.idempotencyKey,
  };

  try {
    const result = await db.insert(reviewCorrections).values(row);
    return { correctionId: Number(result[0].insertId), created: true };
  } catch (err) {
    const code = (err as { code?: string; cause?: { code?: string } })?.code
      ?? (err as { cause?: { code?: string } })?.cause?.code;
    if (code === "ER_DUP_ENTRY") {
      const existing = await db
        .select({ id: reviewCorrections.id })
        .from(reviewCorrections)
        .where(eq(reviewCorrections.idempotencyKey, input.idempotencyKey))
        .limit(1);
      if (existing[0]) {
        return { correctionId: existing[0].id, created: false };
      }
    }
    throw err;
  }
}

export async function softUndoCorrection(
  idempotencyKey: string,
  undoneBy: number
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const result = await db
    .update(reviewCorrections)
    .set({ undoneAt: new Date(), undoneBy })
    .where(
      and(
        eq(reviewCorrections.idempotencyKey, idempotencyKey),
        isNull(reviewCorrections.undoneAt)
      )
    );
  return Number(result[0].affectedRows ?? 0) > 0;
}

/**
 * Upsert memory candidate + evidence; promote collecting→candidate→shadow when
 * agreeCount hits threshold for auto-shadow kinds.
 */
export async function ingestCorrectionIntoMemory(
  input: RecordCorrectionInput,
  correctionId: number
): Promise<{
  candidateId: number | null;
  promotionStatus: PromotionStatus | null;
  agreeCount: number;
  studioConfirmRequired: boolean;
} | null> {
  const db = await getDb();
  if (!db) return null;
  if (input.templateId == null) {
    return {
      candidateId: null,
      promotionStatus: null,
      agreeCount: 0,
      studioConfirmRequired: false,
    };
  }

  const kind = memoryKindForReason(
    input.trainingReasonCode,
    input.correctionType
  );
  if (!kind) {
    return {
      candidateId: null,
      promotionStatus: null,
      agreeCount: 0,
      studioConfirmRequired: false,
    };
  }

  const studioConfirmRequired = !canAutoShadow(kind);
  const payload = buildPayload(input, kind);
  const hash = payloadHash(kind, payload);
  const ruleKey = input.ruleId ?? "";

  const existing = await db
    .select()
    .from(templateMemoryCandidates)
    .where(
      and(
        eq(templateMemoryCandidates.templateId, input.templateId),
        eq(templateMemoryCandidates.memoryKind, kind),
        eq(templateMemoryCandidates.fieldKey, input.fieldKey),
        eq(templateMemoryCandidates.payloadHash, hash),
        ruleKey
          ? eq(templateMemoryCandidates.ruleId, ruleKey)
          : sql`(${templateMemoryCandidates.ruleId} IS NULL OR ${templateMemoryCandidates.ruleId} = '')`
      )
    )
    .limit(1);

  let candidateId: number;
  let status: PromotionStatus;

  if (existing[0]) {
    candidateId = existing[0].id;
    status = existing[0].promotionStatus;
    await db
      .update(templateMemoryCandidates)
      .set({
        evidenceCount: sql`${templateMemoryCandidates.evidenceCount} + 1`,
        agreeCount: sql`${templateMemoryCandidates.agreeCount} + 1`,
        lastEvidenceAt: new Date(),
        templateVersionId:
          input.templateVersionId ?? existing[0].templateVersionId,
      })
      .where(eq(templateMemoryCandidates.id, candidateId));
  } else {
    const inserted = await db.insert(templateMemoryCandidates).values({
      templateId: input.templateId,
      templateVersionId: input.templateVersionId,
      memoryKind: kind,
      fieldKey: input.fieldKey,
      // Empty string sentinel — MySQL UNIQUE treats NULLs as distinct
      ruleId: ruleKey,
      payloadJson: payload,
      payloadHash: hash,
      evidenceCount: 1,
      agreeCount: 1,
      disagreeCount: 0,
      promotionStatus: "collecting",
      createdFromCorrectionId: correctionId,
      lastEvidenceAt: new Date(),
      createdBy: input.reviewerId,
    });
    candidateId = Number(inserted[0].insertId);
    status = "collecting";
  }

  try {
    await db.insert(templateMemoryEvidence).values({
      candidateId,
      correctionId,
      weight: "1.00",
    });
  } catch {
    // duplicate evidence — ignore
  }

  const refreshed = await db
    .select()
    .from(templateMemoryCandidates)
    .where(eq(templateMemoryCandidates.id, candidateId))
    .limit(1);
  const agree = refreshed[0]?.agreeCount ?? 0;
  status = refreshed[0]?.promotionStatus ?? status;

  if (
    canAutoShadow(kind) &&
    agree >= TEMPLATE_MEMORY_AGREE_THRESHOLD &&
    (status === "collecting" || status === "candidate")
  ) {
    const fromStatus = status;
    const toStatus: PromotionStatus =
      agree >= TEMPLATE_MEMORY_AGREE_THRESHOLD + 2 ? "approved" : "shadow";
    await db
      .update(templateMemoryCandidates)
      .set({ promotionStatus: toStatus })
      .where(eq(templateMemoryCandidates.id, candidateId));
    await db.insert(templateMemoryPromotions).values({
      candidateId,
      fromStatus,
      toStatus,
      fromVersionId: input.templateVersionId,
      toVersionId: null,
      diffJson: { agreeCount: agree, memoryKind: kind },
      promotedBy: null,
    });
    status = toStatus;
  } else if (status === "collecting" && agree >= 2) {
    await db
      .update(templateMemoryCandidates)
      .set({ promotionStatus: "candidate" })
      .where(eq(templateMemoryCandidates.id, candidateId));
    status = "candidate";
  }

  return {
    candidateId,
    promotionStatus: status,
    agreeCount: agree,
    studioConfirmRequired,
  };
}

export async function listMemoryForTemplate(templateId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(templateMemoryCandidates)
    .where(eq(templateMemoryCandidates.templateId, templateId));
}

export async function loadApplicableMemory(templateId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(templateMemoryCandidates)
    .where(
      and(
        eq(templateMemoryCandidates.templateId, templateId),
        inArray(templateMemoryCandidates.promotionStatus, [
          "shadow",
          "approved",
        ])
      )
    );
}
