export { isAsyncProcessingEnabled } from "./config";
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
  startJobSheetProcessingWorker,
} from "./worker";

import {
  enqueueInMemoryJobSheetProcessing,
  type JobSheetProcessingPayload,
} from "./inMemoryQueue";
import { startJobSheetProcessingWorker } from "./worker";

export interface EnqueueJobSheetProcessingResponse {
  accepted: true;
  async: true;
  jobId: string;
  jobSheetId: number;
  status: "queued" | "running" | "completed" | "failed";
  deduped: boolean;
}

export function enqueueJobSheetProcessing(
  payload: JobSheetProcessingPayload
): EnqueueJobSheetProcessingResponse {
  const { job, deduped } = enqueueInMemoryJobSheetProcessing(payload);

  if (!deduped) {
    startJobSheetProcessingWorker();
  }

  return {
    accepted: true,
    async: true,
    jobId: job.id,
    jobSheetId: job.payload.jobSheetId,
    status: job.status,
    deduped,
  };
}

// Wired from jobSheets.process when FEATURE_ASYNC_PROCESSING=true.
