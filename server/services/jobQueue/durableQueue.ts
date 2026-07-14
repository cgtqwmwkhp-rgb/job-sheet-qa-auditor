import { and, asc, eq, inArray, isNotNull, lt, sql } from "drizzle-orm";
import {
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";
import { getDb } from "../../db";
import { getJobQueueWorkerId, getStaleLockMs } from "./config";
import type {
  EnqueueJobSheetProcessingResult,
  JobQueueBackend,
  JobSheetProcessingPayload,
  JobSheetQueueJob,
  JobSheetQueueStatus,
} from "./types";

/**
 * Durable queue table — owned by jobQueue (CREATE IF NOT EXISTS at runtime).
 * activeDedupeKey = jobSheetId while queued/running; NULL when terminal.
 * MySQL unique allows multiple NULLs → one active job per jobSheetId.
 */
export const jobSheetProcessingJobs = mysqlTable(
  "job_sheet_processing_jobs",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    jobSheetId: int("jobSheetId").notNull(),
    payload: json("payload").notNull(),
    status: mysqlEnum("status", [
      "queued",
      "running",
      "completed",
      "failed",
    ]).notNull(),
    enqueuedAt: timestamp("enqueuedAt").notNull(),
    startedAt: timestamp("startedAt"),
    finishedAt: timestamp("finishedAt"),
    attempts: int("attempts").notNull().default(0),
    error: text("error"),
    activeDedupeKey: int("activeDedupeKey"),
    lockedBy: varchar("lockedBy", { length: 64 }),
    lockedAt: timestamp("lockedAt"),
  },
  table => ({
    activeDedupe: uniqueIndex("uq_job_sheet_processing_active").on(
      table.activeDedupeKey
    ),
  })
);

const DDL = `
CREATE TABLE IF NOT EXISTS job_sheet_processing_jobs (
  id VARCHAR(64) NOT NULL,
  jobSheetId INT NOT NULL,
  payload JSON NOT NULL,
  status ENUM('queued','running','completed','failed') NOT NULL,
  enqueuedAt TIMESTAMP NOT NULL,
  startedAt TIMESTAMP NULL,
  finishedAt TIMESTAMP NULL,
  attempts INT NOT NULL DEFAULT 0,
  error TEXT NULL,
  activeDedupeKey INT NULL,
  lockedBy VARCHAR(64) NULL,
  lockedAt TIMESTAMP NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_job_sheet_processing_active (activeDedupeKey),
  KEY idx_job_sheet_processing_status_enqueued (status, enqueuedAt)
)
`;

let schemaReady: Promise<void> | null = null;
let sequence = 0;

function createJobId(jobSheetId: number): string {
  sequence += 1;
  return `job-sheet-${jobSheetId}-${Date.now()}-${sequence}`;
}

function isDuplicateKeyError(error: unknown): boolean {
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";
  const message = error instanceof Error ? error.message : String(error ?? "");
  return (
    code === "ER_DUP_ENTRY" ||
    message.includes("Duplicate entry") ||
    message.includes("uq_job_sheet_processing_active")
  );
}

function rowToJob(row: {
  id: string;
  payload: unknown;
  status: JobSheetQueueStatus;
  enqueuedAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  attempts: number;
  error: string | null;
}): JobSheetQueueJob {
  return {
    id: row.id,
    payload: row.payload as JobSheetProcessingPayload,
    status: row.status,
    enqueuedAt: row.enqueuedAt,
    startedAt: row.startedAt ?? undefined,
    finishedAt: row.finishedAt ?? undefined,
    attempts: row.attempts,
    error: row.error ?? undefined,
  };
}

async function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      const db = await getDb();
      if (!db) {
        throw new Error(
          "Durable job queue requires DATABASE_URL (getDb unavailable)"
        );
      }
      await db.execute(sql.raw(DDL));
    })().catch(error => {
      schemaReady = null;
      throw error;
    });
  }
  await schemaReady;
}

async function findActiveJob(
  jobSheetId: number
): Promise<JobSheetQueueJob | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const rows = await db
    .select()
    .from(jobSheetProcessingJobs)
    .where(
      and(
        eq(jobSheetProcessingJobs.jobSheetId, jobSheetId),
        inArray(jobSheetProcessingJobs.status, ["queued", "running"])
      )
    )
    .limit(1);

  const row = rows[0];
  return row ? rowToJob(row) : undefined;
}

export async function enqueueDurableJobSheetProcessing(
  payload: JobSheetProcessingPayload
): Promise<EnqueueJobSheetProcessingResult> {
  await ensureSchema();
  const db = await getDb();
  if (!db) {
    throw new Error("Durable job queue requires DATABASE_URL");
  }

  const existing = await findActiveJob(payload.jobSheetId);
  if (existing) {
    return { job: existing, deduped: true };
  }

  const job: JobSheetQueueJob = {
    id: createJobId(payload.jobSheetId),
    payload,
    status: "queued",
    enqueuedAt: new Date(),
    attempts: 0,
  };

  try {
    await db.insert(jobSheetProcessingJobs).values({
      id: job.id,
      jobSheetId: payload.jobSheetId,
      payload,
      status: "queued",
      enqueuedAt: job.enqueuedAt,
      attempts: 0,
      activeDedupeKey: payload.jobSheetId,
      lockedBy: null,
      lockedAt: null,
    });
    return { job, deduped: false };
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    const raced = await findActiveJob(payload.jobSheetId);
    if (raced) {
      return { job: raced, deduped: true };
    }
    throw error;
  }
}

export async function dequeueDurableJobSheetProcessingJob(): Promise<
  JobSheetQueueJob | undefined
> {
  await ensureSchema();
  const db = await getDb();
  if (!db) return undefined;

  const workerId = getJobQueueWorkerId();
  const now = new Date();

  // Claim oldest queued row atomically via conditional update.
  const candidates = await db
    .select({ id: jobSheetProcessingJobs.id })
    .from(jobSheetProcessingJobs)
    .where(eq(jobSheetProcessingJobs.status, "queued"))
    .orderBy(asc(jobSheetProcessingJobs.enqueuedAt))
    .limit(8);

  for (const candidate of candidates) {
    await db
      .update(jobSheetProcessingJobs)
      .set({
        status: "running",
        startedAt: now,
        lockedBy: workerId,
        lockedAt: now,
        attempts: sql`${jobSheetProcessingJobs.attempts} + 1`,
      })
      .where(
        and(
          eq(jobSheetProcessingJobs.id, candidate.id),
          eq(jobSheetProcessingJobs.status, "queued")
        )
      );

    const claimed = await db
      .select()
      .from(jobSheetProcessingJobs)
      .where(
        and(
          eq(jobSheetProcessingJobs.id, candidate.id),
          eq(jobSheetProcessingJobs.status, "running"),
          eq(jobSheetProcessingJobs.lockedBy, workerId)
        )
      )
      .limit(1);

    if (claimed[0]) {
      return rowToJob(claimed[0]);
    }
  }

  return undefined;
}

export async function completeDurableJobSheetProcessingJob(
  jobId: string
): Promise<void> {
  await ensureSchema();
  const db = await getDb();
  if (!db) return;

  await db
    .update(jobSheetProcessingJobs)
    .set({
      status: "completed",
      finishedAt: new Date(),
      activeDedupeKey: null,
      lockedBy: null,
      lockedAt: null,
    })
    .where(eq(jobSheetProcessingJobs.id, jobId));
}

export async function failDurableJobSheetProcessingJob(
  jobId: string,
  error: unknown
): Promise<void> {
  await ensureSchema();
  const db = await getDb();
  if (!db) return;

  await db
    .update(jobSheetProcessingJobs)
    .set({
      status: "failed",
      finishedAt: new Date(),
      error: error instanceof Error ? error.message : String(error),
      activeDedupeKey: null,
      lockedBy: null,
      lockedAt: null,
    })
    .where(eq(jobSheetProcessingJobs.id, jobId));
}

export async function hasDurableQueuedJobSheetProcessingJobs(): Promise<boolean> {
  await ensureSchema();
  const db = await getDb();
  if (!db) return false;

  const rows = await db
    .select({ id: jobSheetProcessingJobs.id })
    .from(jobSheetProcessingJobs)
    .where(eq(jobSheetProcessingJobs.status, "queued"))
    .limit(1);

  return rows.length > 0;
}

export async function getDurableJobSheetProcessingJob(
  jobId: string
): Promise<JobSheetQueueJob | undefined> {
  await ensureSchema();
  const db = await getDb();
  if (!db) return undefined;

  const rows = await db
    .select()
    .from(jobSheetProcessingJobs)
    .where(eq(jobSheetProcessingJobs.id, jobId))
    .limit(1);

  return rows[0] ? rowToJob(rows[0]) : undefined;
}

export async function recoverDurableJobSheetProcessingJobs(): Promise<number> {
  await ensureSchema();
  const db = await getDb();
  if (!db) return 0;

  const cutoff = new Date(Date.now() - getStaleLockMs());
  const result = await db
    .update(jobSheetProcessingJobs)
    .set({
      status: "queued",
      lockedBy: null,
      lockedAt: null,
      startedAt: null,
    })
    .where(
      and(
        eq(jobSheetProcessingJobs.status, "running"),
        isNotNull(jobSheetProcessingJobs.lockedAt),
        lt(jobSheetProcessingJobs.lockedAt, cutoff)
      )
    );

  // drizzle mysql update return shape varies; treat as best-effort count
  const rowsAffected =
    result && typeof result === "object" && "rowsAffected" in result
      ? Number((result as { rowsAffected?: number }).rowsAffected ?? 0)
      : 0;

  if (rowsAffected > 0) {
    console.info("[JobQueue] Reclaimed stale running jobs", {
      count: rowsAffected,
      staleLockMs: getStaleLockMs(),
    });
  }

  return rowsAffected;
}

export async function clearDurableJobSheetProcessingQueue(): Promise<void> {
  // Test helper only — no-op without DB
  const db = await getDb();
  if (!db) return;
  try {
    await ensureSchema();
    await db.execute(sql`DELETE FROM job_sheet_processing_jobs`);
  } catch {
    // ignore in environments without the table yet
  }
}

export const mysqlDurableJobQueueBackend: JobQueueBackend = {
  enqueue: enqueueDurableJobSheetProcessing,
  dequeue: dequeueDurableJobSheetProcessingJob,
  complete: completeDurableJobSheetProcessingJob,
  fail: failDurableJobSheetProcessingJob,
  hasQueued: hasDurableQueuedJobSheetProcessingJobs,
  get: getDurableJobSheetProcessingJob,
  clear: clearDurableJobSheetProcessingQueue,
  recover: recoverDurableJobSheetProcessingJobs,
};

/**
 * In-process durable store for unit tests — survives "restart" of the
 * in-memory Maps while keeping the same dedupe semantics as MySQL.
 */
export function createInProcessDurableBackend(): JobQueueBackend {
  const jobsById = new Map<string, JobSheetQueueJob>();
  const activeByJobSheetId = new Map<number, string>();
  const queuedIds: string[] = [];
  let seq = 0;

  return {
    enqueue(payload) {
      const existingId = activeByJobSheetId.get(payload.jobSheetId);
      const existing = existingId ? jobsById.get(existingId) : undefined;
      if (
        existing &&
        (existing.status === "queued" || existing.status === "running")
      ) {
        return { job: existing, deduped: true };
      }

      seq += 1;
      const job: JobSheetQueueJob = {
        id: `durable-${payload.jobSheetId}-${Date.now()}-${seq}`,
        payload,
        status: "queued",
        enqueuedAt: new Date(),
        attempts: 0,
      };
      jobsById.set(job.id, job);
      activeByJobSheetId.set(payload.jobSheetId, job.id);
      queuedIds.push(job.id);
      return { job, deduped: false };
    },
    dequeue() {
      while (queuedIds.length > 0) {
        const id = queuedIds.shift();
        const job = id ? jobsById.get(id) : undefined;
        if (job?.status === "queued") {
          job.status = "running";
          job.startedAt = new Date();
          job.attempts += 1;
          return job;
        }
      }
      return undefined;
    },
    complete(jobId) {
      const job = jobsById.get(jobId);
      if (!job) return;
      job.status = "completed";
      job.finishedAt = new Date();
      if (activeByJobSheetId.get(job.payload.jobSheetId) === jobId) {
        activeByJobSheetId.delete(job.payload.jobSheetId);
      }
    },
    fail(jobId, error) {
      const job = jobsById.get(jobId);
      if (!job) return;
      job.status = "failed";
      job.finishedAt = new Date();
      job.error = error instanceof Error ? error.message : String(error);
      if (activeByJobSheetId.get(job.payload.jobSheetId) === jobId) {
        activeByJobSheetId.delete(job.payload.jobSheetId);
      }
    },
    hasQueued() {
      return queuedIds.some(id => jobsById.get(id)?.status === "queued");
    },
    get(jobId) {
      return jobsById.get(jobId);
    },
    clear() {
      jobsById.clear();
      activeByJobSheetId.clear();
      queuedIds.length = 0;
      seq = 0;
    },
    recover() {
      let reclaimed = 0;
      const staleMs = getStaleLockMs();
      const now = Date.now();
      for (const job of jobsById.values()) {
        if (
          job.status === "running" &&
          job.startedAt &&
          now - job.startedAt.getTime() > staleMs
        ) {
          job.status = "queued";
          job.startedAt = undefined;
          queuedIds.push(job.id);
          reclaimed += 1;
        }
      }
      return reclaimed;
    },
  };
}

/** Reset schema-ready latch (tests). */
export function resetDurableSchemaLatchForTests(): void {
  schemaReady = null;
  sequence = 0;
}
