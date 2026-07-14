/**
 * Durable DLQ retry worker (PR-17 + Phase 1.10 + PR-PLAT-DLQ)
 *
 * Prefers recoverable rows from `failed_jobs` (SSOT) via
 * listRecoverableFailedJobs; falls back to the in-memory cache when DB
 * is unavailable. Default retries go through retryDeadLetterJob which
 * claims with a multi-instance-safe conditional UPDATE.
 */

import {
  getFailedJob,
  incrementAttempts,
  listRecoverableFailedJobs,
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
 * Default handler: reprocess via retryDeadLetterJob (DB-claim + orchestrate).
 * Returns "recovered" on success, "retry" when reprocess fails (attempts
 * already incremented inside the claim — pass must not double-count).
 */
export const defaultDlqRetryHandler: DlqRetryHandler = async job => {
  const ok = await retryDeadLetterJob(job.id);
  return ok ? "recovered" : "retry";
};

/**
 * Process recoverable DLQ jobs with an optional custom handler.
 *
 * Job list defaults to DB SSOT (listRecoverableFailedJobs). Side-effects
 * resolve/attempt updates go through deadLetterQueue helpers so the Map
 * stays a cache and DB wins after every write.
 *
 * When using the default handler, failed reprocess attempts are already
 * incremented by the claim inside retryDeadLetterJob.
 */
export async function runDlqRetryPass(options?: {
  limit?: number;
  handler?: DlqRetryHandler;
  jobs?: FailedJob[];
}): Promise<DlqRetryRunResult> {
  const limit = options?.limit ?? 25;
  const handler = options?.handler ?? defaultDlqRetryHandler;
  const usingDefaultHandler = options?.handler == null;
  const jobs = (
    options?.jobs ?? (await listRecoverableFailedJobs(limit))
  ).slice(0, limit);

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

    // retry — default handler already claimed/incremented inside retryDeadLetterJob
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
