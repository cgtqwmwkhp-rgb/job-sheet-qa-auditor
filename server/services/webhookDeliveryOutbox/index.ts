/**
 * Durable HTTP delivery outbox.
 *
 * A row is committed before any network call. Each drain performs one attempt;
 * failures remain pending with exponential backoff and become DLQ after the
 * configured attempt ceiling. The memory backend is only a DB-less/test
 * fallback and intentionally mirrors the same state machine.
 */
import { createHmac, randomUUID } from "crypto";
import { and, eq, inArray, lte } from "drizzle-orm";
import {
  webhookDeliveryOutbox,
  type WebhookDeliveryOutboxRow,
} from "../../../drizzle/schema";
import { getDb } from "../../db";

export type DeliveryTargetType = "webhook" | "erp" | "teams";
export type DeliveryOutboxStatus =
  | "pending"
  | "processing"
  | "delivered"
  | "dlq";

export interface DeliveryOutboxRecord {
  id: string;
  targetType: DeliveryTargetType;
  webhookId: string | null;
  event: string;
  payloadId: string | null;
  url: string;
  secret: string | null;
  payload: Record<string, unknown>;
  headers: Record<string, string>;
  status: DeliveryOutboxStatus;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: Date;
  lastError: string | null;
  statusCode: number | null;
  createdAt: Date;
  updatedAt: Date;
  deliveredAt: Date | null;
}

export interface EnqueueDeliveryInput {
  targetType: DeliveryTargetType;
  webhookId?: string;
  event: string;
  payloadId?: string;
  url: string;
  secret?: string;
  payload: Record<string, unknown>;
  headers?: Record<string, string>;
  maxAttempts?: number;
}

export interface DeliveryAttemptResult {
  outboxId: string;
  success: boolean;
  status: DeliveryOutboxStatus;
  attempts: number;
  statusCode?: number;
  responseTimeMs: number;
  error?: string;
}

const memoryRows = new Map<string, DeliveryOutboxRecord>();
let forceMemory = false;

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function fromDb(row: WebhookDeliveryOutboxRow): DeliveryOutboxRecord {
  return {
    id: row.id,
    targetType: row.targetType,
    webhookId: row.webhookId,
    event: row.event,
    payloadId: row.payloadId,
    url: row.url,
    secret: row.secret,
    payload: row.payload,
    headers: row.headers ?? {},
    status: row.status,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    nextAttemptAt: asDate(row.nextAttemptAt),
    lastError: row.lastError,
    statusCode: row.statusCode,
    createdAt: asDate(row.createdAt),
    updatedAt: asDate(row.updatedAt),
    deliveredAt: row.deliveredAt ? asDate(row.deliveredAt) : null,
  };
}

async function databaseAvailable(): Promise<boolean> {
  if (forceMemory) return false;
  return (await getDb()) != null;
}

export async function enqueueWebhookDelivery(
  input: EnqueueDeliveryInput
): Promise<DeliveryOutboxRecord> {
  const now = new Date();
  const record: DeliveryOutboxRecord = {
    id: randomUUID(),
    targetType: input.targetType,
    webhookId: input.webhookId ?? null,
    event: input.event,
    payloadId: input.payloadId ?? null,
    url: input.url,
    secret: input.secret ?? null,
    payload: input.payload,
    headers: input.headers ?? {},
    status: "pending",
    attempts: 0,
    maxAttempts: Math.max(1, input.maxAttempts ?? 4),
    nextAttemptAt: now,
    lastError: null,
    statusCode: null,
    createdAt: now,
    updatedAt: now,
    deliveredAt: null,
  };

  if (await databaseAvailable()) {
    const db = await getDb();
    if (!db) throw new Error("Webhook outbox database became unavailable");
    await db.insert(webhookDeliveryOutbox).values(record);
  }

  memoryRows.set(record.id, record);
  return { ...record };
}

async function loadDueRows(
  now: Date,
  ids?: string[],
  limit = 50
): Promise<DeliveryOutboxRecord[]> {
  if (await databaseAvailable()) {
    const db = await getDb();
    if (!db) return [];
    const conditions = [
      eq(webhookDeliveryOutbox.status, "pending"),
      lte(webhookDeliveryOutbox.nextAttemptAt, now),
    ];
    if (ids?.length) {
      conditions.push(inArray(webhookDeliveryOutbox.id, ids));
    }
    const rows = await db
      .select()
      .from(webhookDeliveryOutbox)
      .where(and(...conditions))
      .limit(limit);
    return rows.map(fromDb);
  }

  return Array.from(memoryRows.values())
    .filter(
      row =>
        row.status === "pending" &&
        row.nextAttemptAt <= now &&
        (!ids?.length || ids.includes(row.id))
    )
    .slice(0, limit)
    .map(row => ({ ...row }));
}

async function recoverStaleClaims(now: Date): Promise<void> {
  const staleBefore = new Date(now.getTime() - 5 * 60_000);
  for (const [id, row] of Array.from(memoryRows.entries())) {
    if (row.status === "processing" && row.updatedAt <= staleBefore) {
      memoryRows.set(id, {
        ...row,
        status: "pending",
        nextAttemptAt: now,
        updatedAt: now,
        lastError: "Recovered stale processing claim",
      });
    }
  }

  if (await databaseAvailable()) {
    const db = await getDb();
    if (!db) return;
    await db
      .update(webhookDeliveryOutbox)
      .set({
        status: "pending",
        nextAttemptAt: now,
        updatedAt: now,
        lastError: "Recovered stale processing claim",
      })
      .where(
        and(
          eq(webhookDeliveryOutbox.status, "processing"),
          lte(webhookDeliveryOutbox.updatedAt, staleBefore)
        )
      );
  }
}

async function saveState(
  id: string,
  patch: Partial<DeliveryOutboxRecord>
): Promise<void> {
  const current = memoryRows.get(id);
  if (current) memoryRows.set(id, { ...current, ...patch });

  if (await databaseAvailable()) {
    const db = await getDb();
    if (!db) return;
    await db
      .update(webhookDeliveryOutbox)
      .set({
        status: patch.status,
        attempts: patch.attempts,
        nextAttemptAt: patch.nextAttemptAt,
        lastError: patch.lastError,
        statusCode: patch.statusCode,
        updatedAt: patch.updatedAt,
        deliveredAt: patch.deliveredAt,
      })
      .where(eq(webhookDeliveryOutbox.id, id));
  }
}

function signatureFor(row: DeliveryOutboxRecord, body: string): string | null {
  if (!row.secret) return null;
  return createHmac("sha256", row.secret).update(body, "utf8").digest("hex");
}

async function attemptDelivery(
  row: DeliveryOutboxRecord
): Promise<DeliveryAttemptResult> {
  const startedAt = Date.now();
  const body = JSON.stringify(row.payload);
  const signature = signatureFor(row, body);
  const attempts = row.attempts + 1;
  const claimedAt = new Date();

  await saveState(row.id, {
    status: "processing",
    attempts,
    updatedAt: claimedAt,
  });

  try {
    const response = await fetch(row.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...row.headers,
        ...(signature ? { "X-Webhook-Signature": `sha256=${signature}` } : {}),
      },
      body,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const deliveredAt = new Date();
    await saveState(row.id, {
      status: "delivered",
      attempts,
      statusCode: response.status,
      lastError: null,
      updatedAt: deliveredAt,
      deliveredAt,
    });
    return {
      outboxId: row.id,
      success: true,
      status: "delivered",
      attempts,
      statusCode: response.status,
      responseTimeMs: Date.now() - startedAt,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status: DeliveryOutboxStatus =
      attempts >= row.maxAttempts ? "dlq" : "pending";
    const updatedAt = new Date();
    const nextAttemptAt = new Date(
      updatedAt.getTime() + Math.min(60_000, 1_000 * 2 ** (attempts - 1))
    );
    await saveState(row.id, {
      status,
      attempts,
      lastError: message,
      nextAttemptAt,
      updatedAt,
    });
    return {
      outboxId: row.id,
      success: false,
      status,
      attempts,
      responseTimeMs: Date.now() - startedAt,
      error: message,
    };
  }
}

export async function drainWebhookDeliveryOutbox(options?: {
  ids?: string[];
  limit?: number;
  now?: Date;
}): Promise<DeliveryAttemptResult[]> {
  const now = options?.now ?? new Date();
  await recoverStaleClaims(now);
  const rows = await loadDueRows(
    now,
    options?.ids,
    options?.limit
  );
  return Promise.all(rows.map(attemptDelivery));
}

export async function redriveWebhookDelivery(
  id: string
): Promise<DeliveryAttemptResult | null> {
  let row = memoryRows.get(id);
  if (!row && (await databaseAvailable())) {
    const db = await getDb();
    if (db) {
      const rows = await db
        .select()
        .from(webhookDeliveryOutbox)
        .where(eq(webhookDeliveryOutbox.id, id))
        .limit(1);
      row = rows[0] ? fromDb(rows[0]) : undefined;
    }
  }
  if (!row || row.status !== "dlq") return null;

  const now = new Date();
  await saveState(id, {
    status: "pending",
    attempts: 0,
    nextAttemptAt: now,
    lastError: null,
    updatedAt: now,
  });
  const [result] = await drainWebhookDeliveryOutbox({ ids: [id], now });
  return result ?? null;
}

export function listMemoryOutboxForTests(): DeliveryOutboxRecord[] {
  return Array.from(memoryRows.values()).map(row => ({ ...row }));
}

export function clearWebhookDeliveryOutboxForTests(): void {
  memoryRows.clear();
  forceMemory = true;
}

export function restoreWebhookDeliveryOutboxBackendForTests(): void {
  forceMemory = false;
}
