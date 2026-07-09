/**
 * In-memory live processing progress (PR-11).
 * Lets clients poll per-stage status while processJobSheet runs.
 * Process is still request-scoped; this is a best-effort live view (no websockets).
 */

import {
  PIPELINE_STAGE_LABELS,
  derivePercentComplete,
  normalizeReportStages,
  type JobSheetProcessStatus,
  type ProcessStatusView,
  type ProcessingStageSnapshot,
  type StageRunStatus,
} from "@shared/processingProgress";

interface LiveEntry {
  jobSheetId: number;
  status: JobSheetProcessStatus;
  stages: ProcessingStageSnapshot[];
  currentStage: string | null;
  startedAt: string;
  updatedAt: string;
}

const liveByJobSheet = new Map<number, LiveEntry>();

function nowIso(): string {
  return new Date().toISOString();
}

function ensureEntry(jobSheetId: number): LiveEntry {
  const existing = liveByJobSheet.get(jobSheetId);
  if (existing) return existing;

  const stages: ProcessingStageSnapshot[] = PIPELINE_STAGE_LABELS.map(
    (stage, index) => ({
      stage,
      status: index === 0 ? ("success" as const) : ("pending" as const),
      durationMs: index === 0 ? 0 : undefined,
    })
  );

  const entry: LiveEntry = {
    jobSheetId,
    status: "processing",
    stages,
    currentStage: "OCR Text Extraction",
    startedAt: nowIso(),
    updatedAt: nowIso(),
  };
  liveByJobSheet.set(jobSheetId, entry);
  return entry;
}

function toView(entry: LiveEntry): ProcessStatusView {
  return {
    jobSheetId: entry.jobSheetId,
    status: entry.status,
    currentStage: entry.currentStage,
    stages: entry.stages.map(s => ({ ...s })),
    percentComplete: derivePercentComplete(entry.stages, entry.status),
    startedAt: entry.startedAt,
    updatedAt: entry.updatedAt,
    source: "live",
  };
}

/** Begin tracking a job sheet pipeline run. */
export function beginProcessingProgress(jobSheetId: number): void {
  const entry = ensureEntry(jobSheetId);
  entry.status = "processing";
  entry.updatedAt = nowIso();
  // Mark Upload done; next stage running
  const upload = entry.stages.find(s => s.stage === "Upload");
  if (upload) {
    upload.status = "success";
    upload.durationMs = upload.durationMs ?? 0;
  }
  const ocr = entry.stages.find(s => s.stage === "OCR Text Extraction");
  if (ocr && ocr.status === "pending") {
    ocr.status = "running";
    entry.currentStage = "OCR Text Extraction";
  }
  liveByJobSheet.set(jobSheetId, entry);
}

/** Mark a named stage as currently running (creates row if unknown). */
export function markStageRunning(jobSheetId: number, stage: string): void {
  const entry = ensureEntry(jobSheetId);
  entry.status = "processing";
  entry.currentStage = stage;
  entry.updatedAt = nowIso();

  let row = entry.stages.find(s => s.stage === stage);
  if (!row) {
    row = { stage, status: "running" };
    entry.stages.push(row);
  } else {
    row.status = "running";
    row.error = undefined;
  }
  liveByJobSheet.set(jobSheetId, entry);
}

/** Record a finished stage (success / failed / skipped). */
export function markStageComplete(
  jobSheetId: number,
  stage: string,
  status: Extract<StageRunStatus, "success" | "failed" | "skipped">,
  durationMs?: number,
  error?: string
): void {
  const entry = ensureEntry(jobSheetId);
  entry.updatedAt = nowIso();

  let row = entry.stages.find(s => s.stage === stage);
  if (!row) {
    row = { stage, status, durationMs, error };
    entry.stages.push(row);
  } else {
    row.status = status;
    row.durationMs = durationMs;
    row.error = error;
  }

  // Advance currentStage to next pending canonical stage when possible
  const next = entry.stages.find(s => s.status === "pending");
  entry.currentStage = next?.stage ?? stage;
  liveByJobSheet.set(jobSheetId, entry);
}

/** Sync live view from the processor's stages array (after each push). */
export function syncStagesFromProcessor(
  jobSheetId: number,
  stages: Array<{
    stage: string;
    status: "success" | "failed" | "skipped";
    durationMs: number;
    error?: string;
  }>,
  nextRunning?: string
): void {
  const entry = ensureEntry(jobSheetId);
  entry.updatedAt = nowIso();

  const normalized = normalizeReportStages(stages).map(s => {
    if (s.status === "pending" && nextRunning && s.stage === nextRunning) {
      return { ...s, status: "running" as const };
    }
    return s;
  });

  // Preserve Upload success
  const upload = normalized.find(s => s.stage === "Upload");
  if (upload && upload.status === "pending") {
    upload.status = "success";
    upload.durationMs = 0;
  }

  entry.stages = normalized;
  entry.currentStage =
    nextRunning ??
    normalized.find(s => s.status === "running")?.stage ??
    normalized.find(s => s.status === "pending")?.stage ??
    null;
  entry.status = "processing";
  liveByJobSheet.set(jobSheetId, entry);
}

/** Mark the run finished and keep a short-lived snapshot for late pollers. */
export function finishProcessingProgress(
  jobSheetId: number,
  finalStatus: JobSheetProcessStatus,
  stages?: Array<{
    stage: string;
    status: "success" | "failed" | "skipped";
    durationMs: number;
    error?: string;
  }>
): void {
  const entry = ensureEntry(jobSheetId);
  entry.status = finalStatus;
  entry.currentStage = null;
  entry.updatedAt = nowIso();
  if (stages) {
    entry.stages = normalizeReportStages(stages);
  }
  liveByJobSheet.set(jobSheetId, entry);

  // Drop after a short window so memory does not grow unbounded
  setTimeout(
    () => {
      const current = liveByJobSheet.get(jobSheetId);
      if (current && current.updatedAt === entry.updatedAt) {
        liveByJobSheet.delete(jobSheetId);
      }
    },
    5 * 60 * 1000
  );
}

export function getLiveProcessingProgress(
  jobSheetId: number
): ProcessStatusView | null {
  const entry = liveByJobSheet.get(jobSheetId);
  return entry ? toView(entry) : null;
}

/** Test helper — clear all live entries. */
export function clearProcessingProgressStore(): void {
  liveByJobSheet.clear();
}
