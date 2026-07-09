import {
  completeJobSheetProcessingJob,
  dequeueJobSheetProcessingJob,
  failJobSheetProcessingJob,
  hasQueuedJobSheetProcessingJobs,
  type JobSheetProcessingPayload,
} from "./inMemoryQueue";

type JobSheetProcessor = (
  jobSheetId: number,
  documentUrl: string,
  goldSpecId?: number,
  userId?: number
) => Promise<unknown>;

interface JobSheetProcessorModule {
  orchestrateJobSheetProcessing?: JobSheetProcessor;
  processJobSheet?: JobSheetProcessor;
}

let activeDrain: Promise<void> | null = null;

export function selectJobSheetProcessor(
  processorModule: JobSheetProcessorModule
): JobSheetProcessor {
  const orchestrator =
    "orchestrateJobSheetProcessing" in processorModule
      ? processorModule.orchestrateJobSheetProcessing
      : undefined;
  const processor =
    orchestrator ??
    ("processJobSheet" in processorModule
      ? processorModule.processJobSheet
      : undefined);

  if (!processor) {
    throw new Error("No job sheet processor export is available");
  }

  return processor;
}

async function loadJobSheetProcessor(): Promise<JobSheetProcessor> {
  const processorModule = (await import(
    "../documentProcessor"
  )) as JobSheetProcessorModule;
  return selectJobSheetProcessor(processorModule);
}

async function runJob(payload: JobSheetProcessingPayload): Promise<void> {
  const processor = await loadJobSheetProcessor();
  await processor(
    payload.jobSheetId,
    payload.documentUrl,
    payload.goldSpecId,
    payload.userId
  );
}

async function runDrain(): Promise<void> {
  let job = dequeueJobSheetProcessingJob();

  while (job) {
    try {
      await runJob(job.payload);
      completeJobSheetProcessingJob(job.id);
    } catch (error) {
      failJobSheetProcessingJob(job.id, error);
      console.error("[JobQueue] Job sheet processing failed", {
        jobId: job.id,
        jobSheetId: job.payload.jobSheetId,
        error,
      });
    }

    job = dequeueJobSheetProcessingJob();
  }
}

export function startJobSheetProcessingWorker(): void {
  if (activeDrain) return;

  activeDrain = runDrain().finally(() => {
    activeDrain = null;

    if (hasQueuedJobSheetProcessingJobs()) {
      startJobSheetProcessingWorker();
    }
  });
}

export async function drainJobSheetProcessingQueue(): Promise<void> {
  startJobSheetProcessingWorker();
  await activeDrain;
}
