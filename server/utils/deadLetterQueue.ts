/**
 * Dead Letter Queue (DLQ) for Failed Processing Jobs
 * Captures failed jobs for manual review and recovery.
 *
 * PR-3: Write-through to `failed_jobs` when getDb() is available.
 * In-memory Map remains the primary store for tests / no-DB environments.
 * Phase 1.10: hydrate from `failed_jobs` on boot; retry via reprocessJobSheet.
 */

import { v4 as uuidv4 } from "uuid";
import { eq, isNull } from "drizzle-orm";
import { getDb } from "../db";
import { failedJobs, type FailedJobRow } from "../../drizzle/schema";

export interface FailedJob {
  id: string;
  jobSheetId: number;
  correlationId?: string;
  stage: "upload" | "ocr" | "analysis" | "storage";
  error: {
    message: string;
    code?: string;
    stack?: string;
  };
  attempts: number;
  maxAttempts: number;
  lastAttemptAt: Date;
  createdAt: Date;
  metadata: Record<string, unknown>;
  recoverable: boolean;
}

export interface DLQStats {
  totalFailed: number;
  byStage: Record<string, number>;
  recoverable: number;
  unrecoverable: number;
  oldestJob?: Date;
}

// In-memory DLQ (always used; DB is write-through when available)
const deadLetterQueue: Map<string, FailedJob> = new Map();

// Maximum jobs to keep in DLQ
const MAX_DLQ_SIZE = 1000;

/**
 * Persist a failed job to the durable `failed_jobs` table (best-effort).
 */
async function persistFailedJob(job: FailedJob): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;

    await db.insert(failedJobs).values({
      id: job.id,
      jobSheetId: job.jobSheetId,
      correlationId: job.correlationId,
      stage: job.stage,
      errorMessage: job.error.message,
      errorCode: job.error.code,
      errorStack: job.error.stack,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      lastAttemptAt: job.lastAttemptAt,
      metadata: job.metadata,
      recoverable: job.recoverable,
      createdAt: job.createdAt,
    });
  } catch (error) {
    console.warn(
      "[DLQ] Failed to persist to database (in-memory retained):",
      error
    );
  }
}

/**
 * Add a failed job to the dead letter queue
 */
export function addToDeadLetterQueue(
  jobSheetId: number,
  stage: FailedJob["stage"],
  error: Error,
  options: {
    correlationId?: string;
    attempts?: number;
    maxAttempts?: number;
    metadata?: Record<string, unknown>;
    recoverable?: boolean;
  } = {}
): FailedJob {
  // Enforce size limit by removing oldest jobs
  if (deadLetterQueue.size >= MAX_DLQ_SIZE) {
    const oldestKey = deadLetterQueue.keys().next().value;
    if (oldestKey) {
      deadLetterQueue.delete(oldestKey);
    }
  }

  const failedJob: FailedJob = {
    id: uuidv4(),
    jobSheetId,
    correlationId: options.correlationId,
    stage,
    error: {
      message: error.message,
      code: (error as any).code,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    },
    attempts: options.attempts || 1,
    maxAttempts: options.maxAttempts || 3,
    lastAttemptAt: new Date(),
    createdAt: new Date(),
    metadata: options.metadata || {},
    recoverable: options.recoverable ?? isRecoverableError(error),
  };

  deadLetterQueue.set(failedJob.id, failedJob);

  // Fire-and-forget durable write-through
  void persistFailedJob(failedJob);

  console.error(`[DLQ] Job added: ${failedJob.id}`, {
    jobSheetId,
    stage,
    error: error.message,
    recoverable: failedJob.recoverable,
  });

  return failedJob;
}

/**
 * Determine if an error is potentially recoverable
 */
function isRecoverableError(error: Error): boolean {
  const recoverablePatterns = [
    "ECONNRESET",
    "ETIMEDOUT",
    "ENOTFOUND",
    "rate limit",
    "timeout",
    "429",
    "500",
    "502",
    "503",
    "504",
    "circuit breaker",
  ];

  const errorString = (error.message + (error as any).code).toLowerCase();
  return recoverablePatterns.some(pattern =>
    errorString.includes(pattern.toLowerCase())
  );
}

/**
 * Get a failed job by ID
 */
export function getFailedJob(id: string): FailedJob | undefined {
  return deadLetterQueue.get(id);
}

/**
 * Get all failed jobs
 */
export function getAllFailedJobs(): FailedJob[] {
  return Array.from(deadLetterQueue.values());
}

/**
 * Get failed jobs by stage
 */
export function getFailedJobsByStage(stage: FailedJob["stage"]): FailedJob[] {
  return getAllFailedJobs().filter(job => job.stage === stage);
}

/**
 * Get failed jobs for a specific job sheet
 */
export function getFailedJobsByJobSheetId(jobSheetId: number): FailedJob[] {
  return getAllFailedJobs().filter(job => job.jobSheetId === jobSheetId);
}

/**
 * Get recoverable failed jobs
 */
export function getRecoverableJobs(): FailedJob[] {
  return getAllFailedJobs().filter(job => job.recoverable);
}

/**
 * Remove a job from the DLQ (after successful recovery or manual resolution)
 */
export function removeFromDeadLetterQueue(id: string): boolean {
  const removed = deadLetterQueue.delete(id);
  if (removed) {
    void markResolvedInDb(id);
  }
  return removed;
}

async function markResolvedInDb(id: string): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    await db
      .update(failedJobs)
      .set({ resolvedAt: new Date() })
      .where(eq(failedJobs.id, id));
  } catch (error) {
    console.warn("[DLQ] Failed to mark resolved in database:", error);
  }
}

/**
 * Mark a job as recovered (remove from DLQ)
 */
export function markAsRecovered(id: string): boolean {
  const job = deadLetterQueue.get(id);
  if (job) {
    console.log(`[DLQ] Job recovered: ${id}`, { jobSheetId: job.jobSheetId });
    return removeFromDeadLetterQueue(id);
  }
  return false;
}

/**
 * Update attempt count for a job
 */
export function incrementAttempts(id: string): FailedJob | undefined {
  const job = deadLetterQueue.get(id);
  if (job) {
    job.attempts++;
    job.lastAttemptAt = new Date();

    // Mark as unrecoverable if max attempts exceeded
    if (job.attempts >= job.maxAttempts) {
      job.recoverable = false;
    }

    return job;
  }
  return undefined;
}

/**
 * Get DLQ statistics
 */
export function getDLQStats(): DLQStats {
  const jobs = getAllFailedJobs();

  const byStage: Record<string, number> = {};
  let recoverable = 0;
  let unrecoverable = 0;
  let oldestJob: Date | undefined;

  for (const job of jobs) {
    byStage[job.stage] = (byStage[job.stage] || 0) + 1;

    if (job.recoverable) {
      recoverable++;
    } else {
      unrecoverable++;
    }

    if (!oldestJob || job.createdAt < oldestJob) {
      oldestJob = job.createdAt;
    }
  }

  return {
    totalFailed: jobs.length,
    byStage,
    recoverable,
    unrecoverable,
    oldestJob,
  };
}

/**
 * Thin alias used by ops/troubleshooting docs.
 */
export function getDeadLetterQueueStatus(): DLQStats {
  return getDLQStats();
}

/**
 * Clear all jobs from the DLQ
 */
export function clearDeadLetterQueue(): number {
  const count = deadLetterQueue.size;
  deadLetterQueue.clear();
  console.log(`[DLQ] Cleared ${count} jobs`);
  return count;
}

/**
 * Clear old jobs from the DLQ (older than specified hours)
 */
export function clearOldJobs(maxAgeHours: number = 72): number {
  const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
  let cleared = 0;

  const entries = Array.from(deadLetterQueue.entries());
  for (const [id, job] of entries) {
    if (job.createdAt < cutoff) {
      deadLetterQueue.delete(id);
      cleared++;
    }
  }

  if (cleared > 0) {
    console.log(
      `[DLQ] Cleared ${cleared} old jobs (older than ${maxAgeHours}h)`
    );
  }

  return cleared;
}

/**
 * Export DLQ for persistence (e.g., before shutdown)
 */
export function exportDLQ(): FailedJob[] {
  return getAllFailedJobs();
}

/**
 * Import jobs into DLQ (e.g., after restart)
 */
export function importDLQ(jobs: FailedJob[]): number {
  let imported = 0;
  for (const job of jobs) {
    if (!deadLetterQueue.has(job.id)) {
      deadLetterQueue.set(job.id, job);
      imported++;
    }
  }
  console.log(`[DLQ] Imported ${imported} jobs`);
  return imported;
}

/**
 * Map a durable `failed_jobs` row into the in-memory FailedJob shape.
 */
function rowToFailedJob(row: FailedJobRow): FailedJob {
  return {
    id: row.id,
    jobSheetId: row.jobSheetId,
    correlationId: row.correlationId ?? undefined,
    stage: row.stage,
    error: {
      message: row.errorMessage,
      code: row.errorCode ?? undefined,
      stack: row.errorStack ?? undefined,
    },
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    lastAttemptAt: row.lastAttemptAt,
    createdAt: row.createdAt,
    metadata: (row.metadata as Record<string, unknown>) || {},
    recoverable: row.recoverable,
  };
}

/**
 * Hydrate the in-memory DLQ from unresolved `failed_jobs` rows.
 * Fail-safe: returns 0 and never throws when DB is unavailable / table missing.
 */
export async function hydrateDeadLetterQueueFromDb(): Promise<number> {
  try {
    const db = await getDb();
    if (!db) return 0;

    const rows = await db
      .select()
      .from(failedJobs)
      .where(isNull(failedJobs.resolvedAt))
      .limit(MAX_DLQ_SIZE);

    const imported = importDLQ(rows.map(rowToFailedJob));
    if (imported > 0) {
      console.log(
        `[DLQ] Hydrated ${imported} unresolved failed job(s) from database`
      );
    }
    return imported;
  } catch (error) {
    console.warn(
      "[DLQ] Failed to hydrate from database (continuing with empty in-memory DLQ):",
      error
    );
    return 0;
  }
}

function resolveGoldSpecId(job: FailedJob): number {
  const fromMeta = job.metadata?.goldSpecId;
  return typeof fromMeta === "number" && Number.isFinite(fromMeta)
    ? fromMeta
    : 1;
}

/**
 * Retry a single DLQ job through documentProcessor's orchestration entry.
 * On success the job is marked recovered; on failure attempts are incremented.
 * Uses dynamic import to avoid a circular dependency with documentProcessor.
 */
export async function retryDeadLetterJob(id: string): Promise<boolean> {
  const job = deadLetterQueue.get(id);
  if (!job) {
    console.warn(`[DLQ] Retry skipped — job not found: ${id}`);
    return false;
  }
  if (!job.recoverable) {
    console.warn(`[DLQ] Retry skipped — job not recoverable: ${id}`);
    return false;
  }

  const goldSpecId = resolveGoldSpecId(job);

  try {
    const { orchestrateJobSheetProcessing } = await import(
      "../services/documentProcessor"
    );
    await orchestrateJobSheetProcessing({
      source: "dlq-retry",
      jobSheetId: job.jobSheetId,
      goldSpecId,
    });
    console.log(`[DLQ] Retry succeeded via documentProcessor: ${id}`, {
      jobSheetId: job.jobSheetId,
      goldSpecId,
    });
    return markAsRecovered(id);
  } catch (error) {
    incrementAttempts(id);
    console.warn(`[DLQ] Retry failed for job ${id}:`, error);
    return false;
  }
}
