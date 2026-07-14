/**
 * Process/enqueue idempotency guard (PR-OPS-IDEMPOTENT).
 *
 * Prevents the same content hash from double-billing OCR across:
 * - double-click process
 * - re-upload of identical bytes
 * - dual replica races (DB sibling status check)
 *
 * Ownership boundary: jobSheets.process + enqueue contract only.
 * Does not own the durable jobQueue backend (QueuePlatform).
 */

import { buildIdempotencyKey } from "./key";

export const PROCESS_OCR_SCOPE = "process-ocr";

export type ProcessIdempotencyReason =
  | "in_flight"
  | "already_processed"
  | "same_sheet_processing";

export interface ContentHashSibling {
  id: number;
  status: string;
  fileHash: string | null;
}

export type ProcessIdempotencyDecision =
  | {
      action: "proceed";
      contentHash: string;
      idempotencyKey: string;
    }
  | {
      action: "dedupe";
      contentHash: string;
      idempotencyKey: string;
      reason: ProcessIdempotencyReason;
      reusedFromJobSheetId: number;
    }
  | {
      /** No content hash available — cannot content-dedupe. */
      action: "proceed_without_hash";
    };

export interface ProcessIdempotencyLookup {
  findInFlightByContentHash: (
    contentHash: string,
    excludeJobSheetId: number
  ) => Promise<ContentHashSibling | null>;
  findProcessedByContentHash: (
    contentHash: string,
    excludeJobSheetId: number
  ) => Promise<ContentHashSibling | null>;
}

/** Terminal statuses that imply OCR already ran successfully enough to bill. */
const PROCESSED_STATUSES = new Set(["completed", "review_queue"]);

export function buildProcessOcrIdempotencyKey(contentHash: string): string {
  const normalized = contentHash.trim().toLowerCase();
  if (!normalized) {
    throw new Error("contentHash must not be empty");
  }
  return buildIdempotencyKey(PROCESS_OCR_SCOPE, [normalized]);
}

export function isProcessedJobSheetStatus(status: string): boolean {
  return PROCESSED_STATUSES.has(status);
}

/**
 * Decide whether primary `jobSheets.process` may start OCR for this sheet.
 * Reprocess intentionally bypasses `already_processed` (caller responsibility).
 */
export async function resolveProcessIdempotency(input: {
  jobSheetId: number;
  status: string;
  contentHash: string | null | undefined;
  lookup: ProcessIdempotencyLookup;
}): Promise<ProcessIdempotencyDecision> {
  if (input.status === "processing") {
    return {
      action: "dedupe",
      contentHash: (input.contentHash ?? "").trim().toLowerCase(),
      idempotencyKey: input.contentHash
        ? buildProcessOcrIdempotencyKey(input.contentHash)
        : buildIdempotencyKey(PROCESS_OCR_SCOPE, [
            `job-sheet:${input.jobSheetId}`,
          ]),
      reason: "same_sheet_processing",
      reusedFromJobSheetId: input.jobSheetId,
    };
  }

  const contentHash = (input.contentHash ?? "").trim().toLowerCase();
  if (!contentHash) {
    return { action: "proceed_without_hash" };
  }

  const idempotencyKey = buildProcessOcrIdempotencyKey(contentHash);

  const inFlight = await input.lookup.findInFlightByContentHash(
    contentHash,
    input.jobSheetId
  );
  if (inFlight) {
    return {
      action: "dedupe",
      contentHash,
      idempotencyKey,
      reason: "in_flight",
      reusedFromJobSheetId: inFlight.id,
    };
  }

  const processed = await input.lookup.findProcessedByContentHash(
    contentHash,
    input.jobSheetId
  );
  if (processed) {
    return {
      action: "dedupe",
      contentHash,
      idempotencyKey,
      reason: "already_processed",
      reusedFromJobSheetId: processed.id,
    };
  }

  return { action: "proceed", contentHash, idempotencyKey };
}

export interface ProcessDedupeResponse {
  accepted: true;
  async: boolean;
  deduped: true;
  jobSheetId: number;
  contentHash: string;
  idempotencyKey: string;
  reason: ProcessIdempotencyReason;
  reusedFromJobSheetId: number;
  /** Present when an in-flight queue job was reused. */
  jobId?: string;
  status?: "queued" | "running" | "completed" | "failed" | "processing";
}

export function toProcessDedupeResponse(input: {
  jobSheetId: number;
  contentHash: string;
  idempotencyKey: string;
  reason: ProcessIdempotencyReason;
  reusedFromJobSheetId: number;
  async: boolean;
  jobId?: string;
  status?: ProcessDedupeResponse["status"];
}): ProcessDedupeResponse {
  return {
    accepted: true,
    async: input.async,
    deduped: true,
    jobSheetId: input.jobSheetId,
    contentHash: input.contentHash,
    idempotencyKey: input.idempotencyKey,
    reason: input.reason,
    reusedFromJobSheetId: input.reusedFromJobSheetId,
    jobId: input.jobId,
    status: input.status ?? "processing",
  };
}
