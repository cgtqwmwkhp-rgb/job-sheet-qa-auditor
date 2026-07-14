/**
 * Core signed ingest accept logic — idempotent on externalJobId + content hash.
 */

import { randomUUID } from "crypto";
import { calculateHash } from "../../utils/fileValidation";
import type { IngestConfig } from "./config";
import type { IngestReceiptStore } from "./receiptStore";
import {
  IngestError,
  type IngestPersister,
  type IngestResult,
  type IngestUploadRequest,
} from "./types";

const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
]);

const MAX_BYTES = 10 * 1024 * 1024;

export interface IngestServiceDeps {
  config: IngestConfig;
  store: IngestReceiptStore;
  persist: IngestPersister;
}

function assertUploadShape(input: IngestUploadRequest): void {
  if (!input.externalJobId?.trim()) {
    throw new IngestError("BAD_REQUEST", "externalJobId is required");
  }
  if (!input.deviceId?.trim()) {
    throw new IngestError("BAD_REQUEST", "deviceId is required");
  }
  if (!input.fileName?.trim()) {
    throw new IngestError("BAD_REQUEST", "fileName is required");
  }
  if (!input.fileType?.trim()) {
    throw new IngestError("BAD_REQUEST", "fileType is required");
  }
  if (!Buffer.isBuffer(input.fileBuffer) || input.fileBuffer.length === 0) {
    throw new IngestError("BAD_REQUEST", "file content is required");
  }
  if (input.fileBuffer.length > MAX_BYTES) {
    throw new IngestError("BAD_REQUEST", "File exceeds 10MB limit");
  }
  if (!ALLOWED_TYPES.has(input.fileType)) {
    throw new IngestError(
      "BAD_REQUEST",
      `Unsupported fileType: ${input.fileType}`
    );
  }
}

/**
 * Accept a machine upload with externalJobId + content-hash idempotency.
 *
 * Rules:
 * 1. Same externalJobId + same contentHash → duplicate (idempotent replay)
 * 2. Same externalJobId + different contentHash → CONFLICT
 * 3. New externalJobId but contentHash already seen → duplicate (hash dedupe)
 * 4. Otherwise persist + store receipt
 */
export async function acceptIngestUpload(
  deps: IngestServiceDeps,
  input: IngestUploadRequest
): Promise<IngestResult> {
  if (!deps.config.enabled) {
    throw new IngestError(
      "NOT_CONFIGURED",
      "Machine ingest is not configured. Set INGEST_API_KEY and INGEST_HMAC_SECRET."
    );
  }

  assertUploadShape(input);

  const contentHash = calculateHash(input.fileBuffer);
  if (input.contentHash && input.contentHash.toLowerCase() !== contentHash) {
    throw new IngestError(
      "BAD_REQUEST",
      "contentHash does not match uploaded bytes",
      { expected: contentHash }
    );
  }

  const existingByExternal = await deps.store.getByExternalJobId(
    input.externalJobId
  );
  if (existingByExternal) {
    if (existingByExternal.contentHash === contentHash) {
      return {
        status: "duplicate",
        idempotent: true,
        dedupeReason: "external_job_id_and_hash",
        receipt: existingByExternal,
      };
    }
    throw new IngestError(
      "CONFLICT",
      "externalJobId already ingested with a different content hash",
      {
        externalJobId: input.externalJobId,
        existingContentHash: existingByExternal.contentHash,
        incomingContentHash: contentHash,
      }
    );
  }

  const existingByHash = await deps.store.getByContentHash(contentHash);
  if (existingByHash) {
    return {
      status: "duplicate",
      idempotent: true,
      dedupeReason: "content_hash",
      receipt: existingByHash,
    };
  }

  const persisted = await deps.persist({
    externalJobId: input.externalJobId,
    deviceId: input.deviceId,
    fileName: input.fileName,
    fileType: input.fileType,
    fileBuffer: input.fileBuffer,
    contentHash,
    referenceNumber: input.referenceNumber,
    siteInfo: input.siteInfo,
  });

  const receipt = {
    ingestId: randomUUID(),
    externalJobId: input.externalJobId,
    deviceId: input.deviceId,
    contentHash,
    fileName: input.fileName,
    fileType: input.fileType,
    fileSizeBytes: input.fileBuffer.length,
    fileKey: persisted.fileKey,
    fileUrl: persisted.fileUrl,
    jobSheetId: persisted.jobSheetId,
    createdAt: new Date().toISOString(),
  };

  await deps.store.put(receipt);

  return {
    status: "accepted",
    idempotent: false,
    receipt,
  };
}
