/**
 * Durable process outbox + Idempotency-Key replay (Wave-4 C2).
 *
 * Challenge bar: double-submit same key → one billable process; crash with a
 * pending outbox row can resume without starting a second OCR charge.
 *
 * Ownership: process/enqueue idempotency path only (not documentProcessor).
 */

import { createHash, randomUUID } from "crypto";
import { and, eq, lt, sql } from "drizzle-orm";
import {
  int,
  json,
  mysqlEnum,
  mysqlTable,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";
import { TRPCError } from "@trpc/server";
import { getDb } from "../../db";
import { normalizeIdempotencyKey } from "./actionResponseStore";

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

export type ProcessOutboxStatus = "pending" | "completed";

export interface ProcessOutboxRecord {
  id: string;
  scope: string;
  idempotencyKey: string;
  requestFingerprint: string;
  status: ProcessOutboxStatus;
  jobSheetId: number | null;
  responseJson: unknown | null;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
}

export interface ProcessOutboxResumeDeps {
  findActiveJob: (
    jobSheetId: number
  ) => Promise<{ id: string; status: string } | null>;
  /** Soft-claim / terminal statuses from job_sheets. */
  getJobSheetStatus: (jobSheetId: number) => Promise<string | null>;
  /**
   * Re-enter enqueue for a pending outbox that never completed.
   * Must be content-hash / active-job safe (dedupe, not second bill).
   */
  reenqueue: (record: ProcessOutboxRecord) => Promise<unknown>;
}

type StoredRow = ProcessOutboxRecord & {
  inFlight?: Promise<unknown>;
};

const processIdempotencyOutbox = mysqlTable(
  "process_idempotency_outbox",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    scope: varchar("scope", { length: 191 }).notNull(),
    idempotencyKey: varchar("idempotencyKey", { length: 255 }).notNull(),
    requestFingerprint: varchar("requestFingerprint", { length: 64 }).notNull(),
    status: mysqlEnum("status", ["pending", "completed"]).notNull(),
    jobSheetId: int("jobSheetId"),
    responseJson: json("responseJson"),
    createdAt: timestamp("createdAt").notNull(),
    updatedAt: timestamp("updatedAt").notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
  },
  table => ({
    scopeKey: uniqueIndex("uq_process_idempotency_scope_key").on(
      table.scope,
      table.idempotencyKey
    ),
  })
);

const DDL = `
CREATE TABLE IF NOT EXISTS process_idempotency_outbox (
  id VARCHAR(64) NOT NULL,
  scope VARCHAR(191) NOT NULL,
  idempotencyKey VARCHAR(255) NOT NULL,
  requestFingerprint VARCHAR(64) NOT NULL,
  status ENUM('pending','completed') NOT NULL,
  jobSheetId INT NULL,
  responseJson JSON NULL,
  createdAt TIMESTAMP NOT NULL,
  updatedAt TIMESTAMP NOT NULL,
  expiresAt TIMESTAMP NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_process_idempotency_scope_key (scope, idempotencyKey),
  KEY idx_process_idempotency_pending (status, expiresAt)
)
`;

let schemaReady: Promise<void> | null = null;
const memoryRows = new Map<string, StoredRow>();
let backendOverride: "memory" | "mysql" | null = null;

function recordKey(scope: string, key: string): string {
  return `${scope}\0${key}`;
}

function fingerprintBody(body: unknown): string {
  return createHash("sha256").update(stableJson(body)).digest("hex");
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map(key => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
}

export function extractProcessJobSheetId(body: unknown): number | null {
  if (!body || typeof body !== "object") return null;
  const id = (body as { id?: unknown }).id;
  return typeof id === "number" && Number.isFinite(id) ? id : null;
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
    message.includes("uq_process_idempotency_scope_key")
  );
}

async function ensureSchema(): Promise<boolean> {
  if (backendOverride === "memory") return false;
  const db = await getDb();
  if (!db) return false;
  if (!schemaReady) {
    schemaReady = (async () => {
      await db.execute(sql.raw(DDL));
    })().catch(error => {
      schemaReady = null;
      throw error;
    });
  }
  await schemaReady;
  return true;
}

function rowFromDb(row: {
  id: string;
  scope: string;
  idempotencyKey: string;
  requestFingerprint: string;
  status: ProcessOutboxStatus;
  jobSheetId: number | null;
  responseJson: unknown;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
}): ProcessOutboxRecord {
  return {
    id: row.id,
    scope: row.scope,
    idempotencyKey: row.idempotencyKey,
    requestFingerprint: row.requestFingerprint,
    status: row.status,
    jobSheetId: row.jobSheetId,
    responseJson: row.responseJson ?? null,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
    expiresAt: row.expiresAt.getTime(),
  };
}

async function readRow(
  scope: string,
  key: string
): Promise<StoredRow | undefined> {
  const mem = memoryRows.get(recordKey(scope, key));
  if (mem && mem.expiresAt > Date.now()) return mem;

  const durable = await ensureSchema();
  if (!durable)
    return mem?.expiresAt && mem.expiresAt > Date.now() ? mem : undefined;

  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(processIdempotencyOutbox)
    .where(
      and(
        eq(processIdempotencyOutbox.scope, scope),
        eq(processIdempotencyOutbox.idempotencyKey, key)
      )
    )
    .limit(1);
  const row = rows[0];
  if (!row) return undefined;
  if (row.expiresAt.getTime() <= Date.now()) {
    await db
      .delete(processIdempotencyOutbox)
      .where(eq(processIdempotencyOutbox.id, row.id));
    memoryRows.delete(recordKey(scope, key));
    return undefined;
  }
  const parsed = rowFromDb(row);
  const merged: StoredRow = { ...parsed, inFlight: mem?.inFlight };
  memoryRows.set(recordKey(scope, key), merged);
  return merged;
}

async function insertPending(input: {
  scope: string;
  key: string;
  fingerprint: string;
  jobSheetId: number | null;
  ttlMs: number;
}): Promise<"inserted" | "exists"> {
  const now = Date.now();
  const record: StoredRow = {
    id: randomUUID(),
    scope: input.scope,
    idempotencyKey: input.key,
    requestFingerprint: input.fingerprint,
    status: "pending",
    jobSheetId: input.jobSheetId,
    responseJson: null,
    createdAt: now,
    updatedAt: now,
    expiresAt: now + input.ttlMs,
  };

  const durable = await ensureSchema();
  if (!durable) {
    const existing = memoryRows.get(recordKey(input.scope, input.key));
    if (existing && existing.expiresAt > now) return "exists";
    memoryRows.set(recordKey(input.scope, input.key), record);
    return "inserted";
  }

  const db = await getDb();
  if (!db) {
    memoryRows.set(recordKey(input.scope, input.key), record);
    return "inserted";
  }

  try {
    await db.insert(processIdempotencyOutbox).values({
      id: record.id,
      scope: record.scope,
      idempotencyKey: record.idempotencyKey,
      requestFingerprint: record.requestFingerprint,
      status: "pending",
      jobSheetId: record.jobSheetId,
      responseJson: null,
      createdAt: new Date(record.createdAt),
      updatedAt: new Date(record.updatedAt),
      expiresAt: new Date(record.expiresAt),
    });
    memoryRows.set(recordKey(input.scope, input.key), record);
    return "inserted";
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    return "exists";
  }
}

async function completeRow(
  scope: string,
  key: string,
  response: unknown
): Promise<void> {
  const now = Date.now();
  const existing = memoryRows.get(recordKey(scope, key));
  if (existing) {
    existing.status = "completed";
    existing.responseJson = response;
    existing.updatedAt = now;
    existing.inFlight = undefined;
  }

  const durable = await ensureSchema();
  if (!durable) return;
  const db = await getDb();
  if (!db) return;

  await db
    .update(processIdempotencyOutbox)
    .set({
      status: "completed",
      responseJson: response as object,
      updatedAt: new Date(now),
    })
    .where(
      and(
        eq(processIdempotencyOutbox.scope, scope),
        eq(processIdempotencyOutbox.idempotencyKey, key)
      )
    );
}

async function deleteRow(scope: string, key: string): Promise<void> {
  memoryRows.delete(recordKey(scope, key));
  const durable = await ensureSchema();
  if (!durable) return;
  const db = await getDb();
  if (!db) return;
  await db
    .delete(processIdempotencyOutbox)
    .where(
      and(
        eq(processIdempotencyOutbox.scope, scope),
        eq(processIdempotencyOutbox.idempotencyKey, key)
      )
    );
}

/**
 * Run a process/enqueue mutation under an Idempotency-Key.
 * Missing keys pass through. Failed attempts remain retryable.
 */
export async function executeProcessOutbox<T>(input: {
  scope: string;
  key?: string | null;
  body: unknown;
  action: () => Promise<T>;
  ttlMs?: number;
}): Promise<T> {
  const key = normalizeIdempotencyKey(input.key);
  if (!key) return input.action();

  const fingerprint = fingerprintBody(input.body);
  const jobSheetId = extractProcessJobSheetId(input.body);
  const ttlMs = input.ttlMs ?? DEFAULT_TTL_MS;

  const existing = await readRow(input.scope, key);
  if (existing) {
    if (existing.requestFingerprint !== fingerprint) {
      throw new TRPCError({
        code: "CONFLICT",
        message:
          "Idempotency-Key was already used with a different request body",
      });
    }
    if (existing.status === "completed" && existing.responseJson !== null) {
      return existing.responseJson as T;
    }
    if (existing.inFlight) {
      return existing.inFlight as Promise<T>;
    }
    // Pending after crash: do not start a second billable action here.
    // Caller/boot resume path closes the outbox once the queue/sheet state is known.
    throw new TRPCError({
      code: "CONFLICT",
      message:
        "A process request with this Idempotency-Key is already pending. Retry shortly or wait for the in-flight job.",
    });
  }

  const claimed = await insertPending({
    scope: input.scope,
    key,
    fingerprint,
    jobSheetId,
    ttlMs,
  });

  if (claimed === "exists") {
    return replayExistingClaim<T>(input.scope, key, fingerprint);
  }

  const inFlight = Promise.resolve()
    .then(input.action)
    .then(async result => {
      await completeRow(input.scope, key, result);
      return result;
    })
    .catch(async error => {
      await deleteRow(input.scope, key);
      throw error;
    });

  const pending = memoryRows.get(recordKey(input.scope, key));
  if (pending) pending.inFlight = inFlight;

  return inFlight;
}

async function replayExistingClaim<T>(
  scope: string,
  key: string,
  fingerprint: string
): Promise<T> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const raced = await readRow(scope, key);
    if (raced?.requestFingerprint !== fingerprint) {
      throw new TRPCError({
        code: "CONFLICT",
        message:
          "Idempotency-Key was already used with a different request body",
      });
    }
    if (raced?.status === "completed" && raced.responseJson !== null) {
      return raced.responseJson as T;
    }
    if (raced?.inFlight) {
      return raced.inFlight as Promise<T>;
    }
    await new Promise(resolve => setTimeout(resolve, 5 * (attempt + 1)));
  }

  throw new TRPCError({
    code: "CONFLICT",
    message:
      "A process request with this Idempotency-Key is already pending. Retry shortly or wait for the in-flight job.",
  });
}

function replayResponseForActiveJob(job: {
  id: string;
  status: string;
  jobSheetId: number;
}): unknown {
  return {
    accepted: true,
    async: true,
    deduped: true,
    jobId: job.id,
    jobSheetId: job.jobSheetId,
    status: job.status,
    reason: "outbox_resume",
  };
}

/**
 * Crash-safe drain: pending outbox rows resume without double-billing.
 * - Active queue job → complete outbox with that job (no new enqueue)
 * - Terminal sheet → complete with already-processed style response
 * - Soft-claimed / pending sheet → reenqueue once via injected handler
 */
export async function resumePendingProcessOutbox(
  deps: ProcessOutboxResumeDeps
): Promise<number> {
  const now = Date.now();
  let resumed = 0;

  const candidates: ProcessOutboxRecord[] = [];

  for (const row of Array.from(memoryRows.values())) {
    if (row.status === "pending" && row.expiresAt > now) {
      candidates.push(row);
    }
  }

  const durable = await ensureSchema();
  if (durable) {
    const db = await getDb();
    if (db) {
      const rows = await db
        .select()
        .from(processIdempotencyOutbox)
        .where(eq(processIdempotencyOutbox.status, "pending"));
      for (const row of rows) {
        if (row.expiresAt.getTime() <= now) {
          await db
            .delete(processIdempotencyOutbox)
            .where(eq(processIdempotencyOutbox.id, row.id));
          continue;
        }
        candidates.push(rowFromDb(row));
      }
    }
  }

  const seen = new Set<string>();
  for (const record of candidates) {
    const dedupe = recordKey(record.scope, record.idempotencyKey);
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);

    if (record.jobSheetId == null) {
      await deleteRow(record.scope, record.idempotencyKey);
      continue;
    }

    const active = await deps.findActiveJob(record.jobSheetId);
    if (active) {
      await completeRow(
        record.scope,
        record.idempotencyKey,
        replayResponseForActiveJob({
          id: active.id,
          status: active.status,
          jobSheetId: record.jobSheetId,
        })
      );
      resumed += 1;
      continue;
    }

    const sheetStatus = await deps.getJobSheetStatus(record.jobSheetId);
    if (
      sheetStatus === "completed" ||
      sheetStatus === "review_queue" ||
      sheetStatus === "failed"
    ) {
      await completeRow(record.scope, record.idempotencyKey, {
        accepted: true,
        async: false,
        deduped: true,
        jobSheetId: record.jobSheetId,
        status: sheetStatus,
        reason: "outbox_resume_terminal",
      });
      resumed += 1;
      continue;
    }

    const response = await deps.reenqueue(record);
    await completeRow(record.scope, record.idempotencyKey, response);
    resumed += 1;
  }

  // Opportunistic expiry cleanup for durable rows
  if (durable) {
    const db = await getDb();
    if (db) {
      await db
        .delete(processIdempotencyOutbox)
        .where(lt(processIdempotencyOutbox.expiresAt, new Date(now)));
    }
  }

  return resumed;
}

/** Test helpers */
export function clearProcessOutboxForTests(): void {
  memoryRows.clear();
  schemaReady = null;
}

export function setProcessOutboxBackendForTests(
  backend: "memory" | "mysql" | null
): void {
  backendOverride = backend;
  if (backend === "memory") {
    schemaReady = null;
  }
}

export function listProcessOutboxForTests(): ProcessOutboxRecord[] {
  return Array.from(memoryRows.values()).map(
    ({ inFlight: _inFlight, ...row }) => row
  );
}

/** Seed a pending crash row for resume tests (no in-flight promise). */
export function seedPendingProcessOutboxForTests(input: {
  scope: string;
  key: string;
  body: unknown;
  jobSheetId?: number;
}): ProcessOutboxRecord {
  const now = Date.now();
  const key = normalizeIdempotencyKey(input.key);
  if (!key) throw new Error("key required");
  const record: StoredRow = {
    id: randomUUID(),
    scope: input.scope,
    idempotencyKey: key,
    requestFingerprint: fingerprintBody(input.body),
    status: "pending",
    jobSheetId:
      input.jobSheetId ?? extractProcessJobSheetId(input.body) ?? null,
    responseJson: null,
    createdAt: now,
    updatedAt: now,
    expiresAt: now + DEFAULT_TTL_MS,
  };
  memoryRows.set(recordKey(input.scope, key), record);
  return { ...record };
}

export { processIdempotencyOutbox };
