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
const queue: string[] = [];
let sequence = 0;

function createJobId(jobSheetId: number): string {
  sequence += 1;
  return `job-sheet-${jobSheetId}-${Date.now()}-${sequence}`;
}

export function enqueueInMemoryJobSheetProcessing(
  payload: JobSheetProcessingPayload
): EnqueueJobSheetProcessingResult {
  const existingJobId = activeJobByJobSheetId.get(payload.jobSheetId);
  const existingJob = existingJobId ? jobsById.get(existingJobId) : undefined;

  if (
    existingJob &&
    (existingJob.status === "queued" || existingJob.status === "running")
  ) {
    return { job: existingJob, deduped: true };
  }

  const job: JobSheetQueueJob = {
    id: createJobId(payload.jobSheetId),
    payload,
    status: "queued",
    enqueuedAt: new Date(),
    attempts: 0,
  };

  jobsById.set(job.id, job);
  activeJobByJobSheetId.set(payload.jobSheetId, job.id);
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

export function completeJobSheetProcessingJob(jobId: string): void {
  const job = jobsById.get(jobId);
  if (!job) return;
  job.status = "completed";
  job.finishedAt = new Date();
  if (activeJobByJobSheetId.get(job.payload.jobSheetId) === jobId) {
    activeJobByJobSheetId.delete(job.payload.jobSheetId);
  }
}

export function failJobSheetProcessingJob(jobId: string, error: unknown): void {
  const job = jobsById.get(jobId);
  if (!job) return;
  job.status = "failed";
  job.finishedAt = new Date();
  job.error = error instanceof Error ? error.message : String(error);
  if (activeJobByJobSheetId.get(job.payload.jobSheetId) === jobId) {
    activeJobByJobSheetId.delete(job.payload.jobSheetId);
  }
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
