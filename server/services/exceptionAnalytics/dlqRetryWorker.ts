/**
 * Light durable DLQ retry worker (PR-17)
 *
 * PR-3 already persists failed_jobs. This worker walks recoverable in-memory
 * DLQ entries (and optionally DB rows when provided), increments attempts, and
 * marks recovered / exhausted without calling live OCR/LLM.
 */

import {
  getRecoverableJobs,
  incrementAttempts,
  markAsRecovered,
  type FailedJob,
} from "../../utils/deadLetterQueue";

export interface DlqRetryAttemptResult {
  id: string;
  jobSheetId: number;
  stage: FailedJob["stage"];
  attempts: number;
  maxAttempts: number;
  status: "recovered" | "retry_scheduled" | "exhausted" | "skipped";
  reason?: string;
}

export interface DlqRetryRunResult {
  scanned: number;
  recovered: number;
  scheduled: number;
  exhausted: number;
  skipped: number;
  results: DlqRetryAttemptResult[];
}

export type DlqRetryHandler = (
  job: FailedJob
) => Promise<"recovered" | "retry" | "skip"> | "recovered" | "retry" | "skip";

/**
 * Default handler: no live reprocessing overnight — treat as retry-scheduled
 * until max attempts, then exhaust. Callers can inject a real handler later.
 */
export const defaultDlqRetryHandler: DlqRetryHandler = () => "retry";

/**
 * Process recoverable DLQ jobs with an optional custom handler.
 * Pure side-effects against the in-memory DLQ (+ write-through via markAsRecovered).
 */
export async function runDlqRetryPass(options?: {
  limit?: number;
  handler?: DlqRetryHandler;
  jobs?: FailedJob[];
}): Promise<DlqRetryRunResult> {
  const limit = options?.limit ?? 25;
  const handler = options?.handler ?? defaultDlqRetryHandler;
  const jobs = (options?.jobs ?? getRecoverableJobs()).slice(0, limit);

  const results: DlqRetryAttemptResult[] = [];
  let recovered = 0;
  let scheduled = 0;
  let exhausted = 0;
  let skipped = 0;

  for (const job of jobs) {
    if (!job.recoverable) {
      skipped++;
      results.push({
        id: job.id,
        jobSheetId: job.jobSheetId,
        stage: job.stage,
        attempts: job.attempts,
        maxAttempts: job.maxAttempts,
        status: "skipped",
        reason: "not_recoverable",
      });
      continue;
    }

    const decision = await handler(job);

    if (decision === "skip") {
      skipped++;
      results.push({
        id: job.id,
        jobSheetId: job.jobSheetId,
        stage: job.stage,
        attempts: job.attempts,
        maxAttempts: job.maxAttempts,
        status: "skipped",
        reason: "handler_skip",
      });
      continue;
    }

    if (decision === "recovered") {
      markAsRecovered(job.id);
      recovered++;
      results.push({
        id: job.id,
        jobSheetId: job.jobSheetId,
        stage: job.stage,
        attempts: job.attempts,
        maxAttempts: job.maxAttempts,
        status: "recovered",
      });
      continue;
    }

    // retry
    const updated = incrementAttempts(job.id);
    if (!updated || !updated.recoverable) {
      exhausted++;
      results.push({
        id: job.id,
        jobSheetId: job.jobSheetId,
        stage: job.stage,
        attempts: updated?.attempts ?? job.attempts + 1,
        maxAttempts: job.maxAttempts,
        status: "exhausted",
        reason: "max_attempts",
      });
    } else {
      scheduled++;
      results.push({
        id: job.id,
        jobSheetId: job.jobSheetId,
        stage: job.stage,
        attempts: updated.attempts,
        maxAttempts: updated.maxAttempts,
        status: "retry_scheduled",
      });
    }
  }

  return {
    scanned: jobs.length,
    recovered,
    scheduled,
    exhausted,
    skipped,
    results,
  };
}
