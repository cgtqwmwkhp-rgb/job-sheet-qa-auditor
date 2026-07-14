/**
 * Resolve process status for polling (PR-11).
 * Prefer live progress (memory or Redis shared) → reportJson.processingStages → status-only.
 */

import * as db from "../db";
import { getLiveProcessingProgressShared } from "./processingProgressStore";
import {
  buildStatusOnlyView,
  derivePercentComplete,
  isTerminalJobSheetStatus,
  normalizeReportStages,
  type JobSheetProcessStatus,
  type ProcessStatusView,
} from "@shared/processingProgress";

/**
 * Map analyzer documentation outcome onto job_sheets.status.
 * FAIL must be "failed" — never "completed" (completed = docs PASS only).
 */
export function mapAnalyzerOverallToJobSheetStatus(
  overallResult: string
): JobSheetProcessStatus {
  if (overallResult === "PASS") return "completed";
  if (overallResult === "REVIEW_QUEUE") return "review_queue";
  return "failed";
}

function asJobSheetStatus(status: string): JobSheetProcessStatus {
  if (
    status === "pending" ||
    status === "processing" ||
    status === "completed" ||
    status === "failed" ||
    status === "review_queue"
  ) {
    return status;
  }
  return "pending";
}

function stagesFromReportJson(reportJson: unknown): Array<{
  stage: string;
  status: "success" | "failed" | "skipped";
  durationMs?: number;
  error?: string;
}> | null {
  if (!reportJson || typeof reportJson !== "object") return null;
  const stages = (reportJson as { processingStages?: unknown })
    .processingStages;
  if (!Array.isArray(stages)) return null;
  return stages.filter(
    (
      s
    ): s is {
      stage: string;
      status: "success" | "failed" | "skipped";
      durationMs?: number;
      error?: string;
    } =>
      !!s &&
      typeof s === "object" &&
      typeof (s as { stage?: unknown }).stage === "string" &&
      ["success", "failed", "skipped"].includes(
        String((s as { status?: unknown }).status)
      )
  );
}

export async function resolveProcessStatus(
  jobSheetId: number
): Promise<ProcessStatusView | null> {
  const jobSheet = await db.getJobSheetById(jobSheetId);
  if (!jobSheet) return null;

  const status = asJobSheetStatus(jobSheet.status);

  // Live progress wins while the request is in-flight (Redis-backed when configured)
  const live = await getLiveProcessingProgressShared(jobSheetId);
  if (live && (status === "processing" || live.status === "processing")) {
    return {
      ...live,
      // Prefer DB status if it already flipped terminal (race)
      status: isTerminalJobSheetStatus(status) ? status : live.status,
      percentComplete: isTerminalJobSheetStatus(status)
        ? 100
        : live.percentComplete,
    };
  }

  // Completed runs: prefer reportJson.processingStages
  const audit = await db.getAuditResultByJobSheetId(jobSheetId);
  const reportStages = stagesFromReportJson(audit?.reportJson);
  if (reportStages && reportStages.length > 0) {
    const stages = normalizeReportStages(reportStages);
    return {
      jobSheetId,
      status,
      currentStage: null,
      stages,
      percentComplete: derivePercentComplete(stages, status),
      startedAt: null,
      updatedAt: audit?.createdAt
        ? new Date(audit.createdAt).toISOString()
        : null,
      source: "report",
    };
  }

  // Late live snapshot after finish (before TTL clear)
  if (live) {
    return { ...live, status };
  }

  return buildStatusOnlyView(jobSheetId, status);
}
