export { isAsyncProcessingEnabled, isDurableJobQueueEnabled } from "./config";
export {
  createTestDurableBackend,
  setJobQueueBackendForTests,
} from "./backend";
export {
  clearInMemoryJobSheetProcessingQueue,
  getJobSheetProcessingJob,
  type JobSheetProcessingPayload,
  type JobSheetQueueJob,
  type JobSheetQueueStatus,
} from "./inMemoryQueue";
export {
  drainJobSheetProcessingQueue,
  selectJobSheetProcessor,
  startJobSheetProcessingPoller,
  startJobSheetProcessingWorker,
  stopJobSheetProcessingPoller,
} from "./worker";

import { getJobQueueBackend, isDurableBackendActive } from "./backend";
import { isDurableJobQueueEnabled } from "./config";
import type {
  EnqueueJobSheetProcessingResult,
  JobSheetProcessingPayload,
} from "./types";
import {
  startJobSheetProcessingPoller,
  startJobSheetProcessingWorker,
} from "./worker";
import { resumePendingProcessOutbox } from "../idempotency";

let queueInitialization: Promise<void> | null = null;

export interface EnqueueJobSheetProcessingResponse {
  accepted: true;
  async: true;
  jobId: string;
  jobSheetId: number;
  status: "queued" | "running" | "completed" | "failed";
  deduped: boolean;
  durable?: boolean;
  contentHash?: string;
  idempotencyKey?: string;
}

function isThenable<T>(value: T | PromiseLike<T>): value is PromiseLike<T> {
  return (
    value != null &&
    typeof value === "object" &&
    typeof (value as PromiseLike<T>).then === "function"
  );
}

function toResponse(
  result: EnqueueJobSheetProcessingResult,
  durable: boolean,
  payload: JobSheetProcessingPayload
): EnqueueJobSheetProcessingResponse {
  // Always wake the worker — including deduped enqueues — so bulk reprocess
  // cannot leave work stranded in `queued` when another instance held the key.
  startJobSheetProcessingWorker();
  if (durable) {
    startJobSheetProcessingPoller();
  }

  return {
    accepted: true,
    async: true,
    jobId: result.job.id,
    jobSheetId: payload.jobSheetId,
    status: result.job.status,
    deduped: result.deduped,
    durable,
    contentHash: result.job.payload.contentHash ?? payload.contentHash,
    idempotencyKey: result.job.payload.idempotencyKey ?? payload.idempotencyKey,
  };
}

/**
 * Enqueue job-sheet processing.
 * - In-memory backend: synchronous return (existing contract tests).
 * - Durable MySQL backend: returns Promise (await in callers).
 * tRPC `return enqueueJobSheetProcessing(...)` accepts both.
 */
export function enqueueJobSheetProcessing(
  payload: JobSheetProcessingPayload
):
  | EnqueueJobSheetProcessingResponse
  | Promise<EnqueueJobSheetProcessingResponse> {
  const durable = isDurableBackendActive();
  const enqueued = getJobQueueBackend().enqueue(payload);

  if (isThenable(enqueued)) {
    return Promise.resolve(enqueued).then(result =>
      toResponse(result, durable, payload)
    );
  }

  return toResponse(enqueued, durable, payload);
}

export async function getJobSheetProcessingJobAsync(
  jobId: string
): Promise<import("./types").JobSheetQueueJob | undefined> {
  return getJobQueueBackend().get(jobId);
}

export async function clearJobSheetProcessingQueue(): Promise<void> {
  await getJobQueueBackend().clear();
}

/** Reclaim stale locks after process restart (durable backend only). */
export async function recoverJobSheetProcessingQueue(): Promise<number> {
  const backend = getJobQueueBackend();
  if (!backend.recover) return 0;
  const reclaimed = await backend.recover();
  if (reclaimed > 0) {
    startJobSheetProcessingWorker();
    startJobSheetProcessingPoller();
  }
  return reclaimed;
}

/**
 * Close pending process Idempotency-Key outbox rows after a crash without
 * starting a second billable OCR when work is already queued/terminal.
 */
export async function resumeProcessOutboxAfterRestart(): Promise<number> {
  const backend = getJobQueueBackend();
  return resumePendingProcessOutbox({
    findActiveJob: async jobSheetId => {
      if (!backend.findActiveByJobSheetId) return null;
      const job = await backend.findActiveByJobSheetId(jobSheetId);
      if (!job) return null;
      return { id: job.id, status: job.status };
    },
    getJobSheetStatus: async jobSheetId => {
      try {
        const { getJobSheetById } = await import("../../db");
        const sheet = await getJobSheetById(jobSheetId);
        return sheet?.status ?? null;
      } catch {
        return null;
      }
    },
    reenqueue: async record => {
      if (record.jobSheetId == null) {
        return {
          accepted: true,
          async: true,
          deduped: true,
          reason: "no_sheet",
        };
      }
      try {
        const { getJobSheetById } = await import("../../db");
        const sheet = await getJobSheetById(record.jobSheetId);
        if (!sheet) {
          return {
            accepted: true,
            async: true,
            deduped: true,
            jobSheetId: record.jobSheetId,
            reason: "sheet_missing",
          };
        }
        return await Promise.resolve(
          enqueueJobSheetProcessing({
            source: "primary",
            jobSheetId: record.jobSheetId,
            documentUrl: sheet.fileUrl,
            userId: undefined,
            contentHash: sheet.fileHash ?? undefined,
            idempotencyKey: record.idempotencyKey,
          })
        );
      } catch (error) {
        return {
          accepted: false,
          async: true,
          deduped: false,
          jobSheetId: record.jobSheetId,
          reason: "reenqueue_failed",
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });
}

/**
 * Boot helper for durable mode: reclaim stale work and start the scale-out poller.
 * Safe to call when durable flag is off (no-op), and concurrent boot callers
 * share one recovery attempt. A failed attempt is left retryable.
 *
 * Also resumes pending process Idempotency-Key outbox rows (Wave-4 C2).
 */
export function initJobSheetProcessingQueue(): Promise<void> {
  if (queueInitialization) return queueInitialization;

  queueInitialization = (async () => {
    if (isDurableJobQueueEnabled()) {
      await recoverJobSheetProcessingQueue();
      startJobSheetProcessingPoller();
    }
    // Outbox resume is safe with in-memory or durable backends — pending rows
    // either complete against an active/terminal sheet or re-enqueue once.
    const resumed = await resumeProcessOutboxAfterRestart();
    if (resumed > 0) {
      startJobSheetProcessingWorker();
      if (isDurableJobQueueEnabled()) {
        startJobSheetProcessingPoller();
      }
    }
    // Drain any pre-existing queued work after boot (crash / deploy residue).
    const backend = getJobQueueBackend();
    const hasQueued = await Promise.resolve(backend.hasQueued());
    if (hasQueued) {
      startJobSheetProcessingWorker();
      if (isDurableJobQueueEnabled()) {
        startJobSheetProcessingPoller();
      }
    }
  })().catch(error => {
    queueInitialization = null;
    throw error;
  });

  return queueInitialization;
}

// Wired from jobSheets.process when FEATURE_ASYNC_PROCESSING=true.
// Set FEATURE_DURABLE_JOB_QUEUE=true (+ DATABASE_URL) for restart-safe scale-out.
