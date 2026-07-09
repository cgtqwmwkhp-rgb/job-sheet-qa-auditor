/**
 * Real-time processing progress helpers (PR-11).
 * Shared by server progress store + client polling UI. Mocks-only safe.
 */

export type JobSheetProcessStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "review_queue";

export type StageRunStatus =
  | "pending"
  | "running"
  | "success"
  | "failed"
  | "skipped";

export interface ProcessingStageSnapshot {
  stage: string;
  status: StageRunStatus;
  durationMs?: number;
  error?: string;
}

/** Canonical pipeline stages shown in the UI (upload → OCR → analysis). */
export const PIPELINE_STAGE_LABELS = [
  "Upload",
  "OCR Text Extraction",
  "Template Selection",
  "Ensemble Extraction",
  "AI Analysis",
  "Store Results",
] as const;

export type PipelineStageLabel = (typeof PIPELINE_STAGE_LABELS)[number];

export interface ProcessStatusView {
  jobSheetId: number;
  status: JobSheetProcessStatus;
  currentStage: string | null;
  stages: ProcessingStageSnapshot[];
  percentComplete: number;
  startedAt: string | null;
  updatedAt: string | null;
  source: "live" | "report" | "status_only";
}

export function isTerminalJobSheetStatus(
  status: string
): status is "completed" | "failed" | "review_queue" {
  return (
    status === "completed" || status === "failed" || status === "review_queue"
  );
}

export function isActiveJobSheetStatus(
  status: string
): status is "pending" | "processing" {
  return status === "pending" || status === "processing";
}

/** Map completed pipeline stage records into UI snapshots. */
export function normalizeReportStages(
  stages:
    | Array<{
        stage: string;
        status: "success" | "failed" | "skipped";
        durationMs?: number;
        error?: string;
      }>
    | null
    | undefined
): ProcessingStageSnapshot[] {
  if (!stages || stages.length === 0) {
    return PIPELINE_STAGE_LABELS.map(stage => ({
      stage,
      status: "pending" as const,
    }));
  }

  const byName = new Map(stages.map(s => [s.stage, s]));
  const known = PIPELINE_STAGE_LABELS.map(label => {
    const hit = byName.get(label);
    if (!hit) {
      // Upload is implicit once a job sheet exists
      if (label === "Upload") {
        return { stage: label, status: "success" as const, durationMs: 0 };
      }
      return { stage: label, status: "pending" as const };
    }
    return {
      stage: hit.stage,
      status: hit.status as StageRunStatus,
      durationMs: hit.durationMs,
      error: hit.error,
    };
  });

  // Append any extra stages not in the canonical list (e.g. Hybrid Assessment)
  for (const s of stages) {
    if (!(PIPELINE_STAGE_LABELS as readonly string[]).includes(s.stage)) {
      known.push({
        stage: s.stage,
        status: s.status as StageRunStatus,
        durationMs: s.durationMs,
        error: s.error,
      });
    }
  }

  return known;
}

export function derivePercentComplete(
  stages: ProcessingStageSnapshot[],
  jobStatus: string
): number {
  if (jobStatus === "completed" || jobStatus === "review_queue") return 100;
  if (jobStatus === "failed") {
    const done = stages.filter(
      s =>
        s.status === "success" ||
        s.status === "failed" ||
        s.status === "skipped"
    ).length;
    return stages.length === 0
      ? 100
      : Math.min(99, Math.round((done / stages.length) * 100));
  }

  if (stages.length === 0) {
    return jobStatus === "processing" ? 5 : 0;
  }

  let weight = 0;
  for (const s of stages) {
    if (s.status === "success" || s.status === "skipped") weight += 1;
    else if (s.status === "failed") weight += 1;
    else if (s.status === "running") weight += 0.5;
  }
  return Math.min(99, Math.round((weight / stages.length) * 100));
}

export function completionToastCopy(
  status: JobSheetProcessStatus,
  fileName?: string | null
): {
  title: string;
  description: string;
  type: "success" | "warning" | "error";
} {
  const label = fileName?.trim() || "Job sheet";
  switch (status) {
    case "completed":
      return {
        title: "Processing complete",
        description: `${label} finished analysis and is ready to review.`,
        type: "success",
      };
    case "review_queue":
      return {
        title: "Sent to review queue",
        description: `${label} needs manual review.`,
        type: "warning",
      };
    case "failed":
      return {
        title: "Processing failed",
        description: `${label} could not be processed. You can retry from Upload.`,
        type: "error",
      };
    default:
      return {
        title: "Processing update",
        description: `${label} status: ${status}`,
        type: "success",
      };
  }
}

export function buildStatusOnlyView(
  jobSheetId: number,
  status: JobSheetProcessStatus
): ProcessStatusView {
  const stages: ProcessingStageSnapshot[] = PIPELINE_STAGE_LABELS.map(
    (stage, index) => {
      if (status === "pending") {
        return { stage, status: "pending" };
      }
      if (status === "processing") {
        if (index === 0) return { stage, status: "success", durationMs: 0 };
        if (index === 1) return { stage, status: "running" };
        return { stage, status: "pending" };
      }
      // Terminal without report stages — mark all done/failed
      if (status === "failed") {
        return {
          stage,
          status: index === 0 ? "success" : index === 1 ? "failed" : "pending",
        };
      }
      return { stage, status: "success", durationMs: 0 };
    }
  );

  return {
    jobSheetId,
    status,
    currentStage:
      status === "processing"
        ? "OCR Text Extraction"
        : status === "pending"
          ? "Upload"
          : null,
    stages,
    percentComplete: derivePercentComplete(stages, status),
    startedAt: null,
    updatedAt: null,
    source: "status_only",
  };
}
