import type {
  EnqueueJobSheetProcessingResult,
  JobQueueBackend,
  JobSheetProcessingPayload,
  JobSheetQueueJob,
} from "./types";

export type {
  EnqueueJobSheetProcessingResult,
  JobSheetProcessingPayload,
  JobSheetProcessingSource,
  JobSheetQueueJob,
  JobSheetQueueStatus,
} from "./types";

const jobsById = new Map<string, JobSheetQueueJob>();
const activeJobByJobSheetId = new Map<number, string>();
/** Primary-process content-hash dedupe (same bytes → one OCR bill). */
const activeJobByContentHash = new Map<string, string>();
const queue: string[] = [];
let sequence = 0;

function createJobId(jobSheetId: number): string {
  sequence += 1;
  return `job-sheet-${jobSheetId}-${Date.now()}-${sequence}`;
}

function normalizeContentHash(
  contentHash: string | undefined
): string | undefined {
  const normalized = contentHash?.trim().toLowerCase();
  return normalized ? normalized : undefined;
}

function findActiveJob(
  jobId: string | undefined
): JobSheetQueueJob | undefined {
  if (!jobId) return undefined;
  const job = jobsById.get(jobId);
  if (job && (job.status === "queued" || job.status === "running")) {
    return job;
  }
  return undefined;
}

export function enqueueInMemoryJobSheetProcessing(
  payload: JobSheetProcessingPayload
): EnqueueJobSheetProcessingResult {
  const existingBySheet = findActiveJob(
    activeJobByJobSheetId.get(payload.jobSheetId)
  );
  if (existingBySheet) {
    return { job: existingBySheet, deduped: true };
  }

  const contentHash = normalizeContentHash(payload.contentHash);
  const isPrimary = (payload.source ?? "primary") === "primary";
  if (isPrimary && contentHash) {
    const existingByHash = findActiveJob(
      activeJobByContentHash.get(contentHash)
    );
    if (existingByHash) {
      // Alias this sheet to the in-flight OCR job so double-upload cannot bill twice.
      activeJobByJobSheetId.set(payload.jobSheetId, existingByHash.id);
      return { job: existingByHash, deduped: true };
    }
  }

  const job: JobSheetQueueJob = {
    id: createJobId(payload.jobSheetId),
    payload: contentHash ? { ...payload, contentHash } : payload,
    status: "queued",
    enqueuedAt: new Date(),
    attempts: 0,
  };

  jobsById.set(job.id, job);
  activeJobByJobSheetId.set(payload.jobSheetId, job.id);
  if (isPrimary && contentHash) {
    activeJobByContentHash.set(contentHash, job.id);
  }
  queue.push(job.id);

  return { job, deduped: false };
}

export function dequeueJobSheetProcessingJob(): JobSheetQueueJob | undefined {
  while (queue.length > 0) {
    const jobId = queue.shift();
    const job = jobId ? jobsById.get(jobId) : undefined;

    if (job?.status === "queued") {
      job.status = "running";
      job.startedAt = new Date();
      job.attempts += 1;
      return job;
    }
  }

  return undefined;
}

function clearActiveIndexesForJob(job: JobSheetQueueJob, jobId: string): void {
  if (activeJobByJobSheetId.get(job.payload.jobSheetId) === jobId) {
    activeJobByJobSheetId.delete(job.payload.jobSheetId);
  }
  const contentHash = normalizeContentHash(job.payload.contentHash);
  if (contentHash && activeJobByContentHash.get(contentHash) === jobId) {
    activeJobByContentHash.delete(contentHash);
  }
  // Sheets aliased to this job via content-hash dedupe
  for (const [sheetId, activeId] of Array.from(
    activeJobByJobSheetId.entries()
  )) {
    if (activeId === jobId) {
      activeJobByJobSheetId.delete(sheetId);
    }
  }
}

export function completeJobSheetProcessingJob(jobId: string): void {
  const job = jobsById.get(jobId);
  if (!job) return;
  job.status = "completed";
  job.finishedAt = new Date();
  clearActiveIndexesForJob(job, jobId);
}

export function failJobSheetProcessingJob(jobId: string, error: unknown): void {
  const job = jobsById.get(jobId);
  if (!job) return;
  job.status = "failed";
  job.finishedAt = new Date();
  job.error = error instanceof Error ? error.message : String(error);
  clearActiveIndexesForJob(job, jobId);
}

export function hasQueuedJobSheetProcessingJobs(): boolean {
  return queue.some(jobId => jobsById.get(jobId)?.status === "queued");
}

export function getJobSheetProcessingJob(
  jobId: string
): JobSheetQueueJob | undefined {
  return jobsById.get(jobId);
}

export function clearInMemoryJobSheetProcessingQueue(): void {
  jobsById.clear();
  activeJobByJobSheetId.clear();
  activeJobByContentHash.clear();
  queue.length = 0;
  sequence = 0;
}

export const inMemoryJobQueueBackend: JobQueueBackend = {
  enqueue: enqueueInMemoryJobSheetProcessing,
  dequeue: dequeueJobSheetProcessingJob,
  complete: completeJobSheetProcessingJob,
  fail: failJobSheetProcessingJob,
  hasQueued: hasQueuedJobSheetProcessingJobs,
  get: getJobSheetProcessingJob,
  clear: clearInMemoryJobSheetProcessingQueue,
};
