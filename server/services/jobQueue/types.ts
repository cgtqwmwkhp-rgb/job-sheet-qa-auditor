export type JobSheetProcessingSource =
  | "primary"
  | "reprocess"
  | "template-reprocess"
  | "dlq-retry"
  | "async-queue";

export interface JobSheetProcessingPayload {
  source?: JobSheetProcessingSource;
  jobSheetId: number;
  documentUrl: string;
  goldSpecId?: number;
  userId?: number;
  templateVersionId?: number;
}

export type JobSheetQueueStatus = "queued" | "running" | "completed" | "failed";

export interface JobSheetQueueJob {
  id: string;
  payload: JobSheetProcessingPayload;
  status: JobSheetQueueStatus;
  enqueuedAt: Date;
  startedAt?: Date;
  finishedAt?: Date;
  attempts: number;
  error?: string;
}

export interface EnqueueJobSheetProcessingResult {
  job: JobSheetQueueJob;
  deduped: boolean;
}

export interface JobQueueBackend {
  enqueue(
    payload: JobSheetProcessingPayload
  ): EnqueueJobSheetProcessingResult | Promise<EnqueueJobSheetProcessingResult>;
  dequeue():
    | JobSheetQueueJob
    | undefined
    | Promise<JobSheetQueueJob | undefined>;
  complete(jobId: string): void | Promise<void>;
  fail(jobId: string, error: unknown): void | Promise<void>;
  hasQueued(): boolean | Promise<boolean>;
  get(
    jobId: string
  ): JobSheetQueueJob | undefined | Promise<JobSheetQueueJob | undefined>;
  clear(): void | Promise<void>;
  /** Reclaim stale running jobs after crash / restart. */
  recover?(): number | Promise<number>;
}
