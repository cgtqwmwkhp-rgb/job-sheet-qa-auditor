/**
 * Signed machine ingest gateway (PR-IO-INGEST / IngestGateway).
 *
 * Mount: app.use("/api/ingest", ingestRouter)
 *
 * Auth: X-Api-Key + X-Ingest-Signature (HMAC-SHA256) — no Entra browser.
 * Idempotency: externalJobId + content hash dedupe.
 */

export { loadIngestConfig, type IngestConfig } from "./config";
export {
  verifyIngestAuth,
  createIngestAuthHeaders,
  buildCanonicalString,
  signCanonical,
  sha256Hex,
  formatSignatureHeader,
} from "./hmac";
export { acceptIngestUpload, type IngestServiceDeps } from "./ingestService";
export {
  MemoryIngestReceiptStore,
  getDefaultReceiptStore,
  resetDefaultReceiptStore,
  type IngestReceiptStore,
} from "./receiptStore";
export { createDefaultPersister } from "./persist";
export {
  createIngestRouter,
  ingestRouter,
  type CreateIngestRouterOptions,
} from "./router";
export {
  IngestError,
  type IngestReceipt,
  type IngestResult,
  type IngestUploadRequest,
  type IngestPersister,
} from "./types";
