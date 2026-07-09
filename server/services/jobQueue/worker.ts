import {
  completeJobSheetProcessingJob,
  dequeueJobSheetProcessingJob,
  failJobSheetProcessingJob,
  hasQueuedJobSheetProcessingJobs,
  type JobSheetProcessingPayload,
} from "./inMemoryQueue";

interface OrchestrateRequest {
  source: string;
  jobSheetId: number;
  documentUrl?: string;
  goldSpecId?: number;
  userId?: number;
  templateVersionId?: number;
}

type OrchestrateFn = (request: OrchestrateRequest) => Promise<unknown>;
type LegacyProcessFn = (
  jobSheetId: number,
  documentUrl: string,
  goldSpecId?: number,
  userId?: number
) => Promise<unknown>;

interface JobSheetProcessorModule {
  orchestrateJobSheetProcessing?: OrchestrateFn;
  processJobSheet?: LegacyProcessFn;
}

let activeDrain: Promise<void> | null = null;

export function selectJobSheetProcessor(
  processorModule: JobSheetProcessorModule
): {
  mode: "orchestrate" | "legacy";
  orchestrate?: OrchestrateFn;
  legacy?: LegacyProcessFn;
} {
  if (typeof processorModule.orchestrateJobSheetProcessing === "function") {
    return {
      mode: "orchestrate",
      orchestrate: processorModule.orchestrateJobSheetProcessing,
    };
  }
  if (typeof processorModule.processJobSheet === "function") {
    return { mode: "legacy", legacy: processorModule.processJobSheet };
  }
  throw new Error("No job sheet processor export is available");
}

async function loadProcessorModule(): Promise<JobSheetProcessorModule> {
  const processorModule = (await import("../documentProcessor")) as unknown;
  return processorModule as JobSheetProcessorModule;
}

async function runJob(payload: JobSheetProcessingPayload): Promise<void> {
  const processorModule = await loadProcessorModule();
  const selected = selectJobSheetProcessor(processorModule);

  if (selected.mode === "orchestrate" && selected.orchestrate) {
    await selected.orchestrate({
      source: payload.source ?? "async-queue",
      jobSheetId: payload.jobSheetId,
      documentUrl: payload.documentUrl,
      goldSpecId: payload.goldSpecId,
      userId: payload.userId,
      templateVersionId: payload.templateVersionId,
    });
    return;
  }

  if (!selected.legacy) {
    throw new Error("No job sheet processor export is available");
  }

  await selected.legacy(
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
