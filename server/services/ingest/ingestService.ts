/**
 * Core signed ingest accept logic — idempotent on externalJobId + content hash.
 *
 * Wave-4 B3: optional Image QA intake gate (fail-closed in prod/staging) so
 * garbage raster drops are rejected before storage / OCR spend.
 *
 * PR6: on accepted (non-duplicate) with jobSheetId, optionally enqueue
 * processing behind FEATURE_INGEST_AUTO_PROCESS === "true".
 */

import { randomUUID } from "crypto";
import { calculateHash } from "../../utils/fileValidation";
import { isImageQaIntakeEnabled, runIntakeGate } from "../imageQa/intakeGate";
import { enqueueJobSheetProcessing } from "../jobQueue";
import type { IngestConfig } from "./config";
import type { IngestReceiptStore } from "./receiptStore";
import {
  IngestError,
  type IngestPersister,
  type IngestReceipt,
  type IngestResult,
  type IngestUploadRequest,
} from "./types";

const ALLOWED_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);

const MAX_BYTES = 10 * 1024 * 1024;

const FEATURE_INGEST_AUTO_PROCESS = "FEATURE_INGEST_AUTO_PROCESS";

export type IngestEnqueueProcessing = (payload: {
  source: "ingest";
  jobSheetId: number;
  documentUrl: string;
  contentHash: string;
}) => unknown | Promise<unknown>;

export interface IngestServiceDeps {
  config: IngestConfig;
  store: IngestReceiptStore;
  persist: IngestPersister;
  /** Injected for tests — defaults to runIntakeGate when intake is enabled. */
  runIntake?: typeof runIntakeGate;
  /** Injected for tests — defaults to enqueueJobSheetProcessing. */
  enqueueProcessing?: IngestEnqueueProcessing;
}

export function isIngestAutoProcessEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return env[FEATURE_INGEST_AUTO_PROCESS] === "true";
}

async function maybeEnqueueAutoProcess(
  deps: IngestServiceDeps,
  receipt: IngestReceipt
): Promise<void> {
  if (!isIngestAutoProcessEnabled()) return;
  if (receipt.jobSheetId == null) return;

  const enqueue =
    deps.enqueueProcessing ??
    ((payload: {
      source: "ingest";
      jobSheetId: number;
      documentUrl: string;
      contentHash: string;
    }) =>
      enqueueJobSheetProcessing(
        // jobQueue source union does not yet list "ingest"; worker treats source as string.
        payload as Parameters<typeof enqueueJobSheetProcessing>[0]
      ));

  try {
    await Promise.resolve(
      enqueue({
        source: "ingest",
        jobSheetId: receipt.jobSheetId,
        documentUrl: receipt.fileUrl,
        contentHash: receipt.contentHash,
      })
    );
  } catch (err) {
    console.error("[ingest] auto-process enqueue failed", {
      jobSheetId: receipt.jobSheetId,
      externalJobId: receipt.externalJobId,
      err,
    });
  }
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
 * 4. Intake gate reject (when enabled) → BAD_REQUEST (honest reject)
 * 5. Otherwise persist + store receipt
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

  if (isImageQaIntakeEnabled()) {
    const runIntake = deps.runIntake ?? runIntakeGate;
    const intake = await runIntake({
      buffer: input.fileBuffer,
      fileName: input.fileName,
      mimeType: input.fileType,
    });
    if (!intake.passed && !intake.skipped) {
      throw new IngestError(
        "BAD_REQUEST",
        `Intake quality gate rejected upload: ${
          intake.reviewReasons[0] ?? intake.error ?? "low quality"
        }`,
        {
          intake: {
            passed: intake.passed,
            skipped: intake.skipped,
            qualityScore: intake.qualityScore,
            grade: intake.grade,
            retakeFeedback: intake.retakeFeedback,
            reviewReasons: intake.reviewReasons,
          },
        }
      );
    }
  }

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

  const receipt: IngestReceipt = {
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
  await maybeEnqueueAutoProcess(deps, receipt);

  return {
    status: "accepted",
    idempotent: false,
    receipt,
  };
}
