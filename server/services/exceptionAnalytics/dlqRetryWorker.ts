/**
 * Durable DLQ retry worker (PR-17 + Phase 1.10)
 *
 * PR-3 persists failed_jobs. This worker walks recoverable in-memory DLQ
 * entries (and optionally DB rows when provided), and by default retries via
 * documentProcessor's orchestration entry. Callers can still inject a custom
 * handler for tests / dry-runs.
 */

import {
  getFailedJob,
  getRecoverableJobs,
  incrementAttempts,
  markAsRecovered,
  retryDeadLetterJob,
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
 * Default handler: reprocess the job sheet via retryDeadLetterJob.
 * Returns "recovered" on success, "retry" when reprocess fails (attempts
 * already incremented inside retryDeadLetterJob — pass must not double-count).
 */
export const defaultDlqRetryHandler: DlqRetryHandler = async job => {
  const ok = await retryDeadLetterJob(job.id);
  return ok ? "recovered" : "retry";
};

/**
 * Process recoverable DLQ jobs with an optional custom handler.
 * Side-effects against the in-memory DLQ (+ write-through via markAsRecovered).
 *
 * When using the default handler, failed reprocess attempts are already
 * incremented inside retryDeadLetterJob — we only re-read state for status.
 */
export async function runDlqRetryPass(options?: {
  limit?: number;
  handler?: DlqRetryHandler;
  jobs?: FailedJob[];
}): Promise<DlqRetryRunResult> {
  const limit = options?.limit ?? 25;
  const handler = options?.handler ?? defaultDlqRetryHandler;
  const usingDefaultHandler = options?.handler == null;
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
      // Default handler already called markAsRecovered via retryDeadLetterJob
      if (!usingDefaultHandler) {
        markAsRecovered(job.id);
      }
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

    // retry — default handler already incremented attempts inside retryDeadLetterJob
    const updated = usingDefaultHandler
      ? getFailedJob(job.id)
      : incrementAttempts(job.id);

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
