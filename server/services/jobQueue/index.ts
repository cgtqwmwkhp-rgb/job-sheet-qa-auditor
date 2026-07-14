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
  if (!result.deduped) {
    startJobSheetProcessingWorker();
    if (durable) {
      startJobSheetProcessingPoller();
    }
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
 * Boot helper for durable mode: reclaim stale work and start the scale-out poller.
 * Safe to call when durable flag is off (no-op).
 */
export async function initJobSheetProcessingQueue(): Promise<void> {
  if (!isDurableJobQueueEnabled()) return;
  await recoverJobSheetProcessingQueue();
  startJobSheetProcessingPoller();
}

// Wired from jobSheets.process when FEATURE_ASYNC_PROCESSING=true.
// Set FEATURE_DURABLE_JOB_QUEUE=true (+ DATABASE_URL) for restart-safe scale-out.
