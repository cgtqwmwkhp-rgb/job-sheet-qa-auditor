/**
 * Idempotency key module (Phase 3.x) + process/enqueue OCR guard.
 *
 * Feature flag (default OFF for key emission wiring):
 * - FEATURE_IDEMPOTENCY=true → attach idempotencyKey on enqueue responses
 *
 * Content-hash OCR double-bill protection on `jobSheets.process` is always on
 * when a fileHash is present (PR-OPS-IDEMPOTENT challenge bar).
 */

export const FEATURE_FLAG = "FEATURE_IDEMPOTENCY";

export function isIdempotencyEnabled(): boolean {
  return process.env[FEATURE_FLAG] === "true";
}

export * from "./types";
export { buildIdempotencyKey } from "./key";
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
