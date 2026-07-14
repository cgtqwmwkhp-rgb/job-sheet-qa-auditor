/**
 * Live processing progress store (PR-11 + PR-OPS-LIMITS).
 *
 * Default: in-memory Map (single-replica only — see assertSharedLimitsReplicaSafety).
 * With SHARED_LIMITS_REDIS_URL / REDIS_URL: write-through to Redis so processStatus
 * polls work across replicas.
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
import {
  getSharedLimitsBackend,
  getSharedLimitsRedis,
} from "../utils/rateLimiter";

interface LiveEntry {
  jobSheetId: number;
  status: JobSheetProcessStatus;
  stages: ProcessingStageSnapshot[];
  currentStage: string | null;
  startedAt: string;
  updatedAt: string;
}

const PROGRESS_KEY_PREFIX = "jsqa:progress:";
const PROGRESS_TTL_MS = 30 * 60 * 1000; // 30 minutes while running
const FINISHED_TTL_MS = 5 * 60 * 1000; // match previous in-memory drop window

const liveByJobSheet = new Map<number, LiveEntry>();

function nowIso(): string {
  return new Date().toISOString();
}

function progressKey(jobSheetId: number): string {
  return `${PROGRESS_KEY_PREFIX}${jobSheetId}`;
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
    currentStage: PIPELINE_STAGE_LABELS[1],
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

function mirrorToRedis(entry: LiveEntry, ttlMs: number): void {
  if (getSharedLimitsBackend() !== "redis") return;
  const view = toView(entry);
  void getSharedLimitsRedis()
    .then(client =>
      client.set(progressKey(entry.jobSheetId), JSON.stringify(view), ttlMs)
    )
    .catch(err => {
      console.warn(
        `[SharedLimits] progress Redis mirror failed for jobSheet ${entry.jobSheetId}:`,
        err instanceof Error ? err.message : err
      );
    });
}

function deleteFromRedis(jobSheetId: number): void {
  if (getSharedLimitsBackend() !== "redis") return;
  void getSharedLimitsRedis()
    .then(client => client.del(progressKey(jobSheetId)))
    .catch(() => {
      /* best-effort */
    });
}

/** Begin tracking a job sheet pipeline run. */
export function beginProcessingProgress(jobSheetId: number): void {
  const entry = ensureEntry(jobSheetId);
  entry.status = "processing";
  entry.updatedAt = nowIso();
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
  mirrorToRedis(entry, PROGRESS_TTL_MS);
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
  mirrorToRedis(entry, PROGRESS_TTL_MS);
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

  const next = entry.stages.find(s => s.status === "pending");
  entry.currentStage = next?.stage ?? stage;
  liveByJobSheet.set(jobSheetId, entry);
  mirrorToRedis(entry, PROGRESS_TTL_MS);
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
  mirrorToRedis(entry, PROGRESS_TTL_MS);
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
  mirrorToRedis(entry, FINISHED_TTL_MS);

  setTimeout(() => {
    const current = liveByJobSheet.get(jobSheetId);
    if (current && current.updatedAt === entry.updatedAt) {
      liveByJobSheet.delete(jobSheetId);
      deleteFromRedis(jobSheetId);
    }
  }, FINISHED_TTL_MS);
}

/** Local in-memory snapshot (same replica that is processing). */
export function getLiveProcessingProgress(
  jobSheetId: number
): ProcessStatusView | null {
  const entry = liveByJobSheet.get(jobSheetId);
  return entry ? toView(entry) : null;
}

/**
 * Cross-replica live progress: Redis first when configured, else memory.
 * Used by processStatus polling so sticky-session-less replicas still see progress.
 */
export async function getLiveProcessingProgressShared(
  jobSheetId: number
): Promise<ProcessStatusView | null> {
  if (getSharedLimitsBackend() === "redis") {
    try {
      const client = await getSharedLimitsRedis();
      const raw = await client.get(progressKey(jobSheetId));
      if (raw) {
        const parsed = JSON.parse(raw) as ProcessStatusView;
        if (parsed && parsed.jobSheetId === jobSheetId) {
          return { ...parsed, source: "live" };
        }
      }
    } catch (err) {
      console.warn(
        `[SharedLimits] progress Redis read failed for jobSheet ${jobSheetId}:`,
        err instanceof Error ? err.message : err
      );
    }
  }
  return getLiveProcessingProgress(jobSheetId);
}

/** Test helper — clear all live entries. */
export function clearProcessingProgressStore(): void {
  liveByJobSheet.clear();
}
