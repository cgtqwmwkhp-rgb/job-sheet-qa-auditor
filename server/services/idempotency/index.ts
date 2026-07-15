/**
 * Idempotency key module (Phase 3.x) + process/enqueue OCR guard + outbox.
 *
 * Feature flag (default OFF for key emission wiring):
 * - FEATURE_IDEMPOTENCY=true → attach idempotencyKey on enqueue responses
 *
 * Always on for `jobSheets.process`:
 * - Content-hash OCR double-bill protection when fileHash is present
 * - Durable Idempotency-Key outbox (Wave-4 C2) when the header is supplied
 */

export const FEATURE_FLAG = "FEATURE_IDEMPOTENCY";

export function isIdempotencyEnabled(): boolean {
  return process.env[FEATURE_FLAG] === "true";
}

export * from "./types";
export { buildIdempotencyKey } from "./key";
export {
  ActionResponseStore,
  auditActionResponseStore,
  getIdempotencyKey,
  normalizeIdempotencyKey,
} from "./actionResponseStore";
export {
  PROCESS_OCR_SCOPE,
  buildProcessOcrIdempotencyKey,
  isProcessedJobSheetStatus,
  resolveProcessIdempotency,
  toProcessDedupeResponse,
  type ContentHashSibling,
  type ProcessDedupeResponse,
  type ProcessIdempotencyDecision,
  type ProcessIdempotencyLookup,
  type ProcessIdempotencyReason,
} from "./processGuard";
export {
  clearProcessOutboxForTests,
  executeProcessOutbox,
  extractProcessJobSheetId,
  listProcessOutboxForTests,
  resumePendingProcessOutbox,
  seedPendingProcessOutboxForTests,
  setProcessOutboxBackendForTests,
  type ProcessOutboxRecord,
  type ProcessOutboxResumeDeps,
  type ProcessOutboxStatus,
} from "./processOutbox";
