/**
 * Dead Letter Queue (DLQ) for Failed Processing Jobs
 *
 * `failed_jobs` is the source of truth when getDb() is available.
 * The in-memory Map is a cache only — after every durable write we re-read
 * from DB (or evict) so the cache never wins over MySQL.
 *
 * Retries are multi-instance safe: claim via conditional UPDATE
 * (`attempts = attempts + 1` WHERE unresolved + recoverable + under max).
 * Only one instance gets affectedRows=1.
 *
 * When DATABASE_URL / getDb() is unavailable (tests, demo), the Map acts as
 * a local fallback store with the same claim semantics.
 */

import { v4 as uuidv4 } from "uuid";
import { and, eq, isNull, sql } from "drizzle-orm";
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

/** In-memory cache of unresolved failed jobs (DB is SSOT when available). */
const deadLetterQueue: Map<string, FailedJob> = new Map();

/** Same-process in-flight claim set (pairs with DB CAS for multi-instance). */
const inFlightClaims: Set<string> = new Set();

const MAX_DLQ_SIZE = 1000;

function cacheUpsert(job: FailedJob): void {
  if (deadLetterQueue.size >= MAX_DLQ_SIZE && !deadLetterQueue.has(job.id)) {
    const oldestKey = deadLetterQueue.keys().next().value;
    if (oldestKey) {
      deadLetterQueue.delete(oldestKey);
    }
  }
  deadLetterQueue.set(job.id, job);
}

function cacheEvict(id: string): void {
  deadLetterQueue.delete(id);
  inFlightClaims.delete(id);
}

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

function updateAffectedRows(result: unknown): number {
  const header = Array.isArray(result) ? result[0] : result;
  const rows = (header as { affectedRows?: number } | undefined)?.affectedRows;
  return typeof rows === "number" ? rows : 0;
}

/**
 * Re-read one row from DB into the cache. Evicts if missing/resolved.
 * Returns the cached job when still unresolved.
 */
async function refreshCacheEntryFromDb(id: string): Promise<FailedJob | undefined> {
  try {
    const db = await getDb();
    if (!db) return deadLetterQueue.get(id);

    const rows = await db
      .select()
      .from(failedJobs)
      .where(eq(failedJobs.id, id))
      .limit(1);

    const row = rows[0];
    if (!row || row.resolvedAt != null) {
      cacheEvict(id);
      return undefined;
    }

    const job = rowToFailedJob(row);
    cacheUpsert(job);
    return job;
  } catch (error) {
    console.warn(`[DLQ] Failed to refresh cache from DB for ${id}:`, error);
    return deadLetterQueue.get(id);
  }
}

/**
 * Persist a failed job to `failed_jobs`, then refresh cache from DB (DB wins).
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

    // Challenge bar: DB wins after every write
    await refreshCacheEntryFromDb(job.id);
  } catch (error) {
    console.warn(
      "[DLQ] Failed to persist to database (cache retained until DB available):",
      error
    );
  }
}

async function persistAttemptState(job: FailedJob): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;

    await db
      .update(failedJobs)
      .set({
        attempts: job.attempts,
        lastAttemptAt: job.lastAttemptAt,
        recoverable: job.recoverable,
      })
      .where(and(eq(failedJobs.id, job.id), isNull(failedJobs.resolvedAt)));

    await refreshCacheEntryFromDb(job.id);
  } catch (error) {
    console.warn("[DLQ] Failed to persist attempt state:", error);
  }
}

async function markResolvedInDb(id: string): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    await db
      .update(failedJobs)
      .set({ resolvedAt: new Date() })
      .where(eq(failedJobs.id, id));
    // DB wins — resolved rows leave the active cache
    cacheEvict(id);
  } catch (error) {
    console.warn("[DLQ] Failed to mark resolved in database:", error);
  }
}

/**
 * Add a failed job to the dead letter queue.
 * Cache is updated immediately; durable insert refreshes cache from DB.
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
  const failedJob: FailedJob = {
    id: uuidv4(),
    jobSheetId,
    correlationId: options.correlationId,
    stage,
    error: {
      message: error.message,
      code: (error as Error & { code?: string }).code,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    },
    attempts: options.attempts || 1,
    maxAttempts: options.maxAttempts || 3,
    lastAttemptAt: new Date(),
    createdAt: new Date(),
    metadata: options.metadata || {},
    recoverable: options.recoverable ?? isRecoverableError(error),
  };

  cacheUpsert(failedJob);
  void persistFailedJob(failedJob);

  console.error(`[DLQ] Job added: ${failedJob.id}`, {
    jobSheetId,
    stage,
    error: error.message,
    recoverable: failedJob.recoverable,
  });

  return failedJob;
}

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

  const errorString = (
    error.message + ((error as Error & { code?: string }).code ?? "")
  ).toLowerCase();
  return recoverablePatterns.some(pattern =>
    errorString.includes(pattern.toLowerCase())
  );
}

export function getFailedJob(id: string): FailedJob | undefined {
  return deadLetterQueue.get(id);
}

export function getAllFailedJobs(): FailedJob[] {
  return Array.from(deadLetterQueue.values());
}

export function getFailedJobsByStage(stage: FailedJob["stage"]): FailedJob[] {
  return getAllFailedJobs().filter(job => job.stage === stage);
}

export function getFailedJobsByJobSheetId(jobSheetId: number): FailedJob[] {
  return getAllFailedJobs().filter(job => job.jobSheetId === jobSheetId);
}

export function getRecoverableJobs(): FailedJob[] {
  return getAllFailedJobs().filter(job => job.recoverable);
}

/**
 * List recoverable unresolved jobs from DB (SSOT), syncing each into the cache.
 * Falls back to the in-memory cache when DB is unavailable.
 */
export async function listRecoverableFailedJobs(
  limit: number = 25
): Promise<FailedJob[]> {
  try {
    const db = await getDb();
    if (!db) {
      return getRecoverableJobs().slice(0, limit);
    }

    const rows = await db
      .select()
      .from(failedJobs)
      .where(
        and(isNull(failedJobs.resolvedAt), eq(failedJobs.recoverable, true))
      )
      .limit(limit);

    const jobs = rows.map(rowToFailedJob);
    for (const job of jobs) {
      cacheUpsert(job);
    }
    return jobs;
  } catch (error) {
    console.warn(
      "[DLQ] Failed to list recoverable jobs from DB; using cache:",
      error
    );
    return getRecoverableJobs().slice(0, limit);
  }
}

/**
 * Remove a job from the active DLQ (cache + resolve in DB).
 */
export function removeFromDeadLetterQueue(id: string): boolean {
  const removed = deadLetterQueue.delete(id);
  inFlightClaims.delete(id);
  void markResolvedInDb(id);
  return removed;
}

export function markAsRecovered(id: string): boolean {
  const job = deadLetterQueue.get(id);
  if (job) {
    console.log(`[DLQ] Job recovered: ${id}`, { jobSheetId: job.jobSheetId });
    return removeFromDeadLetterQueue(id);
  }
  // May exist only in DB (cache miss) — still resolve durably
  void markResolvedInDb(id);
  return false;
}

/**
 * Update attempt count (cache + durable write; DB wins after write).
 */
export function incrementAttempts(id: string): FailedJob | undefined {
  const job = deadLetterQueue.get(id);
  if (!job) {
    return undefined;
  }

  job.attempts++;
  job.lastAttemptAt = new Date();
  if (job.attempts >= job.maxAttempts) {
    job.recoverable = false;
  }

  cacheUpsert(job);
  void persistAttemptState(job);
  return job;
}

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

export function getDeadLetterQueueStatus(): DLQStats {
  return getDLQStats();
}

export function clearDeadLetterQueue(): number {
  const count = deadLetterQueue.size;
  deadLetterQueue.clear();
  inFlightClaims.clear();
  console.log(`[DLQ] Cleared ${count} jobs`);
  return count;
}

export function clearOldJobs(maxAgeHours: number = 72): number {
  const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
  let cleared = 0;

  const entries = Array.from(deadLetterQueue.entries());
  for (const [id, job] of entries) {
    if (job.createdAt < cutoff) {
      cacheEvict(id);
      void markResolvedInDb(id);
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

export function exportDLQ(): FailedJob[] {
  return getAllFailedJobs();
}

export function importDLQ(jobs: FailedJob[]): number {
  let imported = 0;
  for (const job of jobs) {
    if (!deadLetterQueue.has(job.id)) {
      cacheUpsert(job);
      imported++;
    }
  }
  console.log(`[DLQ] Imported ${imported} jobs`);
  return imported;
}

/**
 * Hydrate the in-memory cache from unresolved `failed_jobs` rows.
 * Fail-safe: returns 0 and never throws when DB is unavailable.
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
      "[DLQ] Failed to hydrate from database (continuing with empty cache):",
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

function claimInMemory(id: string): FailedJob | null {
  if (inFlightClaims.has(id)) {
    return null;
  }
  const job = deadLetterQueue.get(id);
  if (!job || !job.recoverable || job.attempts >= job.maxAttempts) {
    return null;
  }

  inFlightClaims.add(id);
  job.attempts++;
  job.lastAttemptAt = new Date();
  if (job.attempts >= job.maxAttempts) {
    job.recoverable = false;
  }
  cacheUpsert(job);
  return job;
}

/**
 * Multi-instance-safe claim: conditional UPDATE bumps attempts so only one
 * writer wins. Cache is refreshed from DB after the write (DB wins).
 */
export async function claimFailedJobForRetry(
  id: string
): Promise<FailedJob | null> {
  try {
    const db = await getDb();
    if (!db) {
      return claimInMemory(id);
    }

    if (inFlightClaims.has(id)) {
      return null;
    }
    inFlightClaims.add(id);

    const now = new Date();
    const result = await db
      .update(failedJobs)
      .set({
        attempts: sql`${failedJobs.attempts} + 1`,
        lastAttemptAt: now,
        recoverable: sql`CASE WHEN ${failedJobs.attempts} + 1 >= ${failedJobs.maxAttempts} THEN 0 ELSE ${failedJobs.recoverable} END`,
      })
      .where(
        and(
          eq(failedJobs.id, id),
          isNull(failedJobs.resolvedAt),
          eq(failedJobs.recoverable, true),
          sql`${failedJobs.attempts} < ${failedJobs.maxAttempts}`
        )
      );

    if (updateAffectedRows(result) === 0) {
      inFlightClaims.delete(id);
      await refreshCacheEntryFromDb(id);
      return null;
    }

    const claimed = await refreshCacheEntryFromDb(id);
    if (!claimed) {
      inFlightClaims.delete(id);
      return null;
    }
    return claimed;
  } catch (error) {
    inFlightClaims.delete(id);
    console.warn(`[DLQ] Claim failed for ${id}:`, error);
    // Fall back to in-memory claim when DB errors mid-flight
    return claimInMemory(id);
  }
}

/**
 * Retry a single DLQ job through documentProcessor orchestration.
 * Claims first (multi-instance safe); on success marks recovered; on failure
 * attempts are already bumped by the claim (no double-count).
 */
export async function retryDeadLetterJob(id: string): Promise<boolean> {
  const job = await claimFailedJobForRetry(id);
  if (!job) {
    console.warn(
      `[DLQ] Retry skipped — claim failed (missing, unrecoverable, or contended): ${id}`
    );
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
    const recovered = markAsRecovered(id);
    inFlightClaims.delete(id);
    return recovered;
  } catch (error) {
    inFlightClaims.delete(id);
    // Claim already incremented attempts — sync cache from DB (DB wins)
    await refreshCacheEntryFromDb(id);
    console.warn(`[DLQ] Retry failed for job ${id}:`, error);
    return false;
  }
}
