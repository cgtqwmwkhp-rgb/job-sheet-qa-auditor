/**
 * Webhook Service
 * Sends notifications to external systems when audits complete.
 *
 * PR-IO-WEBHOOKS: Durable MySQL write-through for subscriptions + signed
 * delivery log. Hot path keeps an in-memory registry for tests / no-DB
 * environments. When DATABASE_URL is available, subscriptions and delivery
 * results persist and restore on boot so restarts do not wipe the registry.
 */

import { createHash } from "crypto";
import { desc, eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import {
  webhookDeliveryLog,
  webhookSubscriptions,
  type WebhookDeliveryLogRow,
  type WebhookSubscriptionRow,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { withRetry } from "../utils/resilience";
import { getCorrelationId } from "../utils/context";
import { redactObject } from "../utils/piiRedaction";

export interface WebhookConfig {
  id: string;
  url: string;
  secret: string;
  events: WebhookEvent[];
  active: boolean;
  retryCount: number;
  timeoutMs: number;
  createdAt: Date;
  updatedAt: Date;
}

export type WebhookEvent =
  | "audit.completed"
  | "audit.failed"
  | "dispute.created"
  | "dispute.resolved"
  | "waiver.approved"
  | "waiver.rejected"
  | "spec.activated"
  | "spec.deactivated"
  | "template.stored"
  | "selection_trace.stored";

export interface WebhookPayload {
  id: string;
  event: WebhookEvent;
  timestamp: string;
  correlationId?: string;
  data: Record<string, unknown>;
}

export interface WebhookDeliveryResult {
  id: string;
  success: boolean;
  webhookId: string;
  event: WebhookEvent;
  payloadId?: string;
  statusCode?: number;
  responseTime?: number;
  error?: string;
  retryCount: number;
  /** HMAC-SHA256 hex digest of the payload body (prefixed sha256= in headers). */
  signature: string;
  /** SHA-256 hex of the exact JSON body that was signed. */
  payloadHash: string;
  deliveredAt: Date;
}

// In-memory webhook registry (write-through to webhook_subscriptions when DB available)
const webhookRegistry: Map<string, WebhookConfig> = new Map();

// Delivery log for debugging (write-through to webhook_delivery_log when DB available)
const deliveryLog: WebhookDeliveryResult[] = [];
const MAX_DELIVERY_LOG = 1000;

let hydrated = false;
let hydratePromise: Promise<number> | null = null;

const KNOWN_EVENTS = new Set<WebhookEvent>([
  "audit.completed",
  "audit.failed",
  "dispute.created",
  "dispute.resolved",
  "waiver.approved",
  "waiver.rejected",
  "spec.activated",
  "spec.deactivated",
  "template.stored",
  "selection_trace.stored",
]);

function isWebhookEvent(value: string): value is WebhookEvent {
  return KNOWN_EVENTS.has(value as WebhookEvent);
}

function parseEvents(raw: unknown): WebhookEvent[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (e): e is WebhookEvent => typeof e === "string" && isWebhookEvent(e)
  );
}

function rowToConfig(row: WebhookSubscriptionRow): WebhookConfig {
  return {
    id: row.id,
    url: row.url,
    secret: row.secret,
    events: parseEvents(row.events),
    active: row.active,
    retryCount: row.retryCount,
    timeoutMs: row.timeoutMs,
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt
        : new Date(row.createdAt as unknown as string),
    updatedAt:
      row.updatedAt instanceof Date
        ? row.updatedAt
        : new Date(row.updatedAt as unknown as string),
  };
}

function rowToDelivery(row: WebhookDeliveryLogRow): WebhookDeliveryResult {
  const event = isWebhookEvent(row.event)
    ? row.event
    : ("audit.completed" as WebhookEvent);
  return {
    id: row.id,
    success: row.success,
    webhookId: row.webhookId,
    event,
    payloadId: row.payloadId ?? undefined,
    statusCode: row.statusCode ?? undefined,
    responseTime: row.responseTimeMs ?? undefined,
    error: row.error ?? undefined,
    retryCount: row.retryCount,
    signature: row.signature,
    payloadHash: row.payloadHash,
    deliveredAt:
      row.deliveredAt instanceof Date
        ? row.deliveredAt
        : new Date(row.deliveredAt as unknown as string),
  };
}

async function persistSubscription(webhook: WebhookConfig): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;

    await db
      .insert(webhookSubscriptions)
      .values({
        id: webhook.id,
        url: webhook.url,
        secret: webhook.secret,
        events: webhook.events,
        active: webhook.active,
        retryCount: webhook.retryCount,
        timeoutMs: webhook.timeoutMs,
        createdAt: webhook.createdAt,
        updatedAt: webhook.updatedAt,
      })
      .onDuplicateKeyUpdate({
        set: {
          url: webhook.url,
          secret: webhook.secret,
          events: webhook.events,
          active: webhook.active,
          retryCount: webhook.retryCount,
          timeoutMs: webhook.timeoutMs,
          updatedAt: webhook.updatedAt,
        },
      });
  } catch (error) {
    console.warn(
      "[Webhooks] Failed to persist subscription (in-memory retained):",
      error
    );
  }
}

async function deleteSubscriptionFromDb(id: string): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    await db
      .delete(webhookSubscriptions)
      .where(eq(webhookSubscriptions.id, id));
  } catch (error) {
    console.warn(
      "[Webhooks] Failed to delete subscription from database:",
      error
    );
  }
}

async function persistDeliveryResult(
  result: WebhookDeliveryResult
): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;

    await db.insert(webhookDeliveryLog).values({
      id: result.id,
      webhookId: result.webhookId,
      event: result.event,
      payloadId: result.payloadId,
      success: result.success,
      statusCode: result.statusCode,
      responseTimeMs: result.responseTime,
      error: result.error,
      retryCount: result.retryCount,
      signature: result.signature,
      payloadHash: result.payloadHash,
      deliveredAt: result.deliveredAt,
    });
  } catch (error) {
    console.warn(
      "[Webhooks] Failed to persist delivery log (in-memory retained):",
      error
    );
  }
}

/**
 * Merge subscriptions by id (DB hydrate / restart restore).
 */
export function importWebhookSubscriptions(incoming: WebhookConfig[]): number {
  if (incoming.length === 0) return 0;
  let imported = 0;
  for (const webhook of incoming) {
    if (!webhookRegistry.has(webhook.id)) {
      webhookRegistry.set(webhook.id, webhook);
      imported += 1;
    }
  }
  return imported;
}

/**
 * Merge delivery log entries by id (newest last; trim to MAX_DELIVERY_LOG).
 */
export function importWebhookDeliveryLog(
  incoming: WebhookDeliveryResult[]
): number {
  if (incoming.length === 0) return 0;
  const byId = new Map(deliveryLog.map(d => [d.id, d]));
  let imported = 0;
  for (const entry of incoming) {
    if (!byId.has(entry.id)) {
      byId.set(entry.id, entry);
      imported += 1;
    }
  }
  const merged = Array.from(byId.values()).sort(
    (a, b) => a.deliveredAt.getTime() - b.deliveredAt.getTime()
  );
  deliveryLog.length = 0;
  deliveryLog.push(...merged.slice(-MAX_DELIVERY_LOG));
  return imported;
}

/** Snapshot retained subscriptions (test / ops helper). */
export function exportWebhookSubscriptions(): WebhookConfig[] {
  return Array.from(webhookRegistry.values());
}

/** Snapshot retained delivery log (test / ops helper). */
export function exportWebhookDeliveryLog(): WebhookDeliveryResult[] {
  return [...deliveryLog];
}

/**
 * Hydrate in-memory registry + delivery log from durable tables.
 * Fail-safe: returns 0 and never throws when DB is unavailable / table missing.
 */
export async function hydrateWebhooksFromDb(): Promise<number> {
  try {
    const db = await getDb();
    if (!db) {
      hydrated = true;
      return 0;
    }

    const [subs, deliveries] = await Promise.all([
      db.select().from(webhookSubscriptions),
      db
        .select()
        .from(webhookDeliveryLog)
        .orderBy(desc(webhookDeliveryLog.deliveredAt))
        .limit(MAX_DELIVERY_LOG),
    ]);

    const importedSubs = importWebhookSubscriptions(subs.map(rowToConfig));
    const importedDeliveries = importWebhookDeliveryLog(
      deliveries.map(rowToDelivery).reverse()
    );
    hydrated = true;

    if (importedSubs > 0 || importedDeliveries > 0) {
      console.log(
        `[Webhooks] Hydrated ${importedSubs} subscription(s) and ${importedDeliveries} delivery log entr(y/ies)`
      );
    }
    return importedSubs;
  } catch (error) {
    hydrated = true;
    console.warn(
      "[Webhooks] Failed to hydrate from database (continuing with in-memory only):",
      error
    );
    return 0;
  }
}

/** Whether boot/lazy hydrate has completed (success or fail-safe skip). */
export function isWebhooksHydrated(): boolean {
  return hydrated;
}

async function ensureHydrated(): Promise<void> {
  if (hydrated) return;
  if (!hydratePromise) {
    hydratePromise = hydrateWebhooksFromDb().finally(() => {
      hydratePromise = null;
    });
  }
  await hydratePromise;
}

/** Clear in-memory state (tests only). */
export function clearWebhookState(): void {
  webhookRegistry.clear();
  deliveryLog.length = 0;
  hydrated = false;
  hydratePromise = null;
}

/**
 * Register a new webhook
 */
export function registerWebhook(
  url: string,
  events: WebhookEvent[],
  options: Partial<
    Omit<WebhookConfig, "id" | "url" | "events" | "createdAt" | "updatedAt">
  > = {}
): WebhookConfig {
  const webhook: WebhookConfig = {
    id: uuidv4(),
    url,
    secret: options.secret || generateSecret(),
    events,
    active: options.active ?? true,
    retryCount: options.retryCount ?? 3,
    timeoutMs: options.timeoutMs ?? 10000,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  webhookRegistry.set(webhook.id, webhook);
  void ensureHydrated().then(() => persistSubscription(webhook));
  console.log(
    `[Webhooks] Registered webhook ${webhook.id} for events: ${events.join(", ")}`
  );

  return webhook;
}

/**
 * Generate a random secret for webhook signing
 */
function generateSecret(): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let secret = "whsec_";
  for (let i = 0; i < 32; i++) {
    secret += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return secret;
}

/**
 * Create HMAC signature for webhook payload
 */
async function signPayload(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payload)
  );
  const hashArray = Array.from(new Uint8Array(signature));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

function hashPayload(payload: string): string {
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

/**
 * Deliver a webhook to a single endpoint
 */
async function deliverWebhook(
  webhook: WebhookConfig,
  payload: WebhookPayload
): Promise<WebhookDeliveryResult> {
  const startTime = Date.now();
  const payloadString = JSON.stringify(payload);
  const payloadHash = hashPayload(payloadString);
  const deliveredAt = new Date();
  const deliveryId = uuidv4();

  let signature = "";
  try {
    signature = await signPayload(payloadString, webhook.secret);

    const response = await withRetry(
      async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(
          () => controller.abort(),
          webhook.timeoutMs
        );

        try {
          const res = await fetch(webhook.url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Webhook-ID": webhook.id,
              "X-Webhook-Event": payload.event,
              "X-Webhook-Signature": `sha256=${signature}`,
              "X-Webhook-Timestamp": payload.timestamp,
              "X-Correlation-ID": payload.correlationId || "",
            },
            body: payloadString,
            signal: controller.signal,
          });

          if (!res.ok && res.status >= 500) {
            throw new Error(`Server error: ${res.status}`);
          }

          return res;
        } finally {
          clearTimeout(timeoutId);
        }
      },
      {
        maxRetries: webhook.retryCount,
        baseDelayMs: 1000,
        maxDelayMs: 30000,
      }
    );

    const responseTime = Date.now() - startTime;

    return {
      id: deliveryId,
      success: response.ok,
      webhookId: webhook.id,
      event: payload.event,
      payloadId: payload.id,
      statusCode: response.status,
      responseTime,
      retryCount: 0,
      signature,
      payloadHash,
      deliveredAt,
    };
  } catch (error) {
    if (!signature) {
      try {
        signature = await signPayload(payloadString, webhook.secret);
      } catch {
        signature = "unsigned";
      }
    }
    return {
      id: deliveryId,
      success: false,
      webhookId: webhook.id,
      event: payload.event,
      payloadId: payload.id,
      responseTime: Date.now() - startTime,
      error: error instanceof Error ? error.message : "Unknown error",
      retryCount: webhook.retryCount,
      signature,
      payloadHash,
      deliveredAt,
    };
  }
}

/**
 * Emit a webhook event to all registered endpoints
 */
export async function emitWebhookEvent(
  event: WebhookEvent,
  data: Record<string, unknown>,
  { redactPII = true }: { redactPII?: boolean } = {}
): Promise<WebhookDeliveryResult[]> {
  await ensureHydrated();
  const correlationId = getCorrelationId();

  // Find all webhooks subscribed to this event
  const subscribers = Array.from(webhookRegistry.values()).filter(
    w => w.active && w.events.includes(event)
  );

  if (subscribers.length === 0) {
    console.log(`[Webhooks] No subscribers for event: ${event}`);
    return [];
  }

  // Redact PII from data by default (opt out with redactPII: false)
  const safeData = redactPII ? redactObject(data) : data;

  const payload: WebhookPayload = {
    id: uuidv4(),
    event,
    timestamp: new Date().toISOString(),
    correlationId,
    data: safeData,
  };

  console.log(
    `[Webhooks] Emitting ${event} to ${subscribers.length} subscribers`,
    {
      correlationId,
      payloadId: payload.id,
    }
  );

  // Deliver to all subscribers in parallel
  const results = await Promise.all(
    subscribers.map(webhook => deliverWebhook(webhook, payload))
  );

  // Log delivery results (in-memory + durable signed log)
  for (const result of results) {
    addToDeliveryLog(result);

    if (!result.success) {
      console.error(`[Webhooks] Delivery failed`, {
        webhookId: result.webhookId,
        event: result.event,
        error: result.error,
      });
    }
  }

  return results;
}

/**
 * Add result to delivery log
 */
function addToDeliveryLog(result: WebhookDeliveryResult): void {
  deliveryLog.push(result);

  // Trim log if too large
  while (deliveryLog.length > MAX_DELIVERY_LOG) {
    deliveryLog.shift();
  }

  void persistDeliveryResult(result);
}

/**
 * Get webhook by ID
 */
export function getWebhook(id: string): WebhookConfig | undefined {
  void ensureHydrated();
  return webhookRegistry.get(id);
}

/**
 * List all webhooks
 */
export function listWebhooks(): WebhookConfig[] {
  void ensureHydrated();
  return Array.from(webhookRegistry.values());
}

/**
 * Update webhook configuration
 */
export function updateWebhook(
  id: string,
  updates: Partial<Omit<WebhookConfig, "id" | "createdAt">>
): WebhookConfig | undefined {
  const webhook = webhookRegistry.get(id);
  if (!webhook) return undefined;

  const updated: WebhookConfig = {
    ...webhook,
    ...updates,
    updatedAt: new Date(),
  };

  webhookRegistry.set(id, updated);
  void persistSubscription(updated);
  return updated;
}

/**
 * Delete a webhook
 */
export function deleteWebhook(id: string): boolean {
  const removed = webhookRegistry.delete(id);
  if (removed) {
    void deleteSubscriptionFromDb(id);
  }
  return removed;
}

/**
 * Get recent delivery log
 */
export function getDeliveryLog(limit: number = 100): WebhookDeliveryResult[] {
  void ensureHydrated();
  return deliveryLog.slice(-limit);
}

/**
 * Test webhook endpoint
 */
export async function testWebhook(id: string): Promise<WebhookDeliveryResult> {
  await ensureHydrated();
  const webhook = webhookRegistry.get(id);
  if (!webhook) {
    return {
      id: uuidv4(),
      success: false,
      webhookId: id,
      event: "audit.completed",
      error: "Webhook not found",
      retryCount: 0,
      signature: "",
      payloadHash: "",
      deliveredAt: new Date(),
    };
  }

  const testPayload: WebhookPayload = {
    id: uuidv4(),
    event: "audit.completed",
    timestamp: new Date().toISOString(),
    data: {
      test: true,
      message: "This is a test webhook delivery",
    },
  };

  const result = await deliverWebhook(webhook, testPayload);
  addToDeliveryLog(result);
  return result;
}

// Convenience functions for common events
export const webhookEvents = {
  auditCompleted: (auditId: number, result: string, score: number) =>
    emitWebhookEvent(
      "audit.completed",
      { auditId, result, score },
      { redactPII: true }
    ),

  auditFailed: (auditId: number, error: string) =>
    emitWebhookEvent("audit.failed", { auditId, error }),

  disputeCreated: (disputeId: number, auditId: number, reason: string) =>
    emitWebhookEvent("dispute.created", { disputeId, auditId, reason }),

  disputeResolved: (disputeId: number, resolution: string) =>
    emitWebhookEvent("dispute.resolved", { disputeId, resolution }),

  waiverApproved: (waiverId: number, auditId: number, approver: string) =>
    emitWebhookEvent("waiver.approved", { waiverId, auditId, approver }),

  waiverRejected: (waiverId: number, auditId: number, reason: string) =>
    emitWebhookEvent("waiver.rejected", { waiverId, auditId, reason }),

  specActivated: (specId: number, name: string, version: string) =>
    emitWebhookEvent("spec.activated", { specId, name, version }),

  specDeactivated: (specId: number, name: string) =>
    emitWebhookEvent("spec.deactivated", { specId, name }),

  templateStored: (templateId: number, details: Record<string, unknown>) =>
    emitWebhookEvent("template.stored", { templateId, ...details }),

  selectionTraceStored: (traceId: number, details: Record<string, unknown>) =>
    emitWebhookEvent("selection_trace.stored", { traceId, ...details }),
};
