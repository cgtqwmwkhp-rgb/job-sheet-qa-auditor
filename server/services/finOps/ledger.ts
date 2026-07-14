/**
 * API cost event ledger with durable MySQL write-through.
 *
 * Hot path keeps an in-memory ring buffer for summaries / no-DB environments.
 * When DATABASE_URL is available, events are persisted to `api_cost_events`
 * and restored on boot via hydrateApiCostLedgerFromDb — restarts do not wipe
 * cost history across replicas once the table is migrated.
 *
 * Dimensions: AI tool, provider, model, stage, job-sheet review, day, month.
 * Estimates use published token rates, not provider invoices.
 */

import { desc } from "drizzle-orm";
import { apiCostEvents, type ApiCostEventRow } from "../../../drizzle/schema";
import { getDb } from "../../db";
import { estimateTokenCostUsd } from "./pricing";
import { deriveToolId, toolDisplayLabel } from "./toolLabels";
import type {
  ApiCostBucket,
  ApiCostEvent,
  ApiCostSummary,
  JobSheetCostBucket,
  PeriodCostBucket,
} from "./types";

const MAX_EVENTS = 5_000;
const RETENTION_NOTE =
  "Costs are estimated from token usage and approximate public rates. " +
  "Events are write-through persisted to api_cost_events when the database " +
  "is available (up to 5,000 retained in-memory) and restored on restart.";

let events: ApiCostEvent[] = [];
let seq = 0;
let hydrated = false;

function nextId(): string {
  seq += 1;
  return `cost_${Date.now()}_${seq}`;
}

function roundUsd(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

function toRecordedAtDate(iso: string): Date {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? new Date(ms) : new Date();
}

function decimalToNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function rowToEvent(row: ApiCostEventRow): ApiCostEvent {
  const recordedAt =
    row.recordedAt instanceof Date
      ? row.recordedAt.toISOString()
      : new Date(row.recordedAt as unknown as string).toISOString();
  return {
    id: row.id,
    recordedAt,
    provider: row.provider,
    model: row.model,
    tool: row.tool,
    stage: row.stage,
    ...(row.jobSheetId != null ? { jobSheetId: row.jobSheetId } : {}),
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    estimatedCostUsd: decimalToNumber(row.estimatedCostUsd),
    ...(row.latencyMs != null ? { latencyMs: row.latencyMs } : {}),
  };
}

/**
 * Persist one cost event to `api_cost_events` (best-effort, never throws).
 */
async function persistApiCostEvent(event: ApiCostEvent): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;

    await db.insert(apiCostEvents).values({
      id: event.id,
      recordedAt: toRecordedAtDate(event.recordedAt),
      provider: event.provider,
      model: event.model,
      tool: event.tool,
      stage: event.stage,
      jobSheetId: event.jobSheetId,
      inputTokens: event.inputTokens,
      outputTokens: event.outputTokens,
      estimatedCostUsd: event.estimatedCostUsd.toFixed(6),
      latencyMs: event.latencyMs,
    });
  } catch (error) {
    console.warn(
      "[FinOps] Failed to persist cost event (in-memory retained):",
      error
    );
  }
}

/**
 * Merge events by id (DB hydrate / restart restore). Newest recordedAt wins
 * when trimming to MAX_EVENTS.
 */
export function importApiCostEvents(incoming: ApiCostEvent[]): number {
  if (incoming.length === 0) return 0;
  const byId = new Map(events.map(e => [e.id, e]));
  let imported = 0;
  for (const event of incoming) {
    if (!byId.has(event.id)) {
      byId.set(event.id, event);
      imported += 1;
    }
  }
  events = Array.from(byId.values())
    .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))
    .slice(-MAX_EVENTS);
  return imported;
}

/**
 * Snapshot retained events (test / ops helper).
 */
export function exportApiCostEvents(): ApiCostEvent[] {
  return [...events];
}

/**
 * Hydrate the in-memory ledger from durable `api_cost_events` rows.
 * Fail-safe: returns 0 and never throws when DB is unavailable / table missing.
 */
export async function hydrateApiCostLedgerFromDb(): Promise<number> {
  try {
    const db = await getDb();
    if (!db) {
      hydrated = true;
      return 0;
    }

    const rows = await db
      .select()
      .from(apiCostEvents)
      .orderBy(desc(apiCostEvents.recordedAt))
      .limit(MAX_EVENTS);

    const imported = importApiCostEvents(rows.map(rowToEvent));
    hydrated = true;
    if (imported > 0) {
      console.log(
        `[FinOps] Hydrated ${imported} cost event(s) from api_cost_events`
      );
    }
    return imported;
  } catch (error) {
    hydrated = true;
    console.warn(
      "[FinOps] Failed to hydrate cost ledger from database (continuing with in-memory only):",
      error
    );
    return 0;
  }
}

/** Whether boot/lazy hydrate has completed (success or fail-safe skip). */
export function isApiCostLedgerHydrated(): boolean {
  return hydrated;
}

export type RecordApiCostInput = {
  provider: string;
  model: string;
  stage?: string;
  tool?: string;
  jobSheetId?: number;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostUsd?: number;
  latencyMs?: number;
  recordedAt?: Date;
};

/**
 * Record one API cost observation. Safe to call from hot paths; never throws.
 * Write-through to MySQL when available (fire-and-forget).
 */
export function recordApiCost(input: RecordApiCostInput): ApiCostEvent | null {
  try {
    const inputTokens = Math.max(0, Math.floor(input.inputTokens ?? 0));
    const outputTokens = Math.max(0, Math.floor(input.outputTokens ?? 0));
    const provider = (input.provider || "unknown").trim() || "unknown";
    const model = (input.model || "unknown").trim() || "unknown";
    const stage = (input.stage || "unknown").trim() || "unknown";
    const tool = deriveToolId({
      tool: input.tool,
      stage,
      provider,
    });
    const jobSheetId =
      typeof input.jobSheetId === "number" &&
      Number.isFinite(input.jobSheetId) &&
      input.jobSheetId > 0
        ? Math.floor(input.jobSheetId)
        : undefined;

    const estimatedCostUsd =
      input.estimatedCostUsd !== undefined
        ? Math.max(0, input.estimatedCostUsd)
        : estimateTokenCostUsd({
            provider,
            model,
            inputTokens,
            outputTokens,
          });

    const event: ApiCostEvent = {
      id: nextId(),
      recordedAt: (input.recordedAt ?? new Date()).toISOString(),
      provider,
      model,
      tool,
      stage,
      ...(jobSheetId !== undefined ? { jobSheetId } : {}),
      inputTokens,
      outputTokens,
      estimatedCostUsd,
      ...(input.latencyMs !== undefined
        ? { latencyMs: Math.max(0, input.latencyMs) }
        : {}),
    };

    events.push(event);
    if (events.length > MAX_EVENTS) {
      events = events.slice(events.length - MAX_EVENTS);
    }

    // Fire-and-forget durable write-through
    void persistApiCostEvent(event);

    return event;
  } catch {
    return null;
  }
}

/** Test helper — wipe retained in-memory events (does not delete DB rows). */
export function clearApiCostLedger(): void {
  events = [];
  seq = 0;
  hydrated = false;
}

export function getApiCostEventCount(): number {
  return events.length;
}

function filterByWindow(
  all: ApiCostEvent[],
  windowHours: number | null,
  nowMs: number
): { filtered: ApiCostEvent[]; since: string | null } {
  if (windowHours === null || windowHours <= 0) {
    return { filtered: [...all], since: null };
  }
  const sinceMs = nowMs - windowHours * 3_600_000;
  return {
    filtered: all.filter(e => Date.parse(e.recordedAt) >= sinceMs),
    since: new Date(sinceMs).toISOString(),
  };
}

function withShares(
  buckets: ApiCostBucket[],
  totalCostUsd: number
): ApiCostBucket[] {
  if (totalCostUsd <= 0) {
    return buckets.map(b => ({ ...b, share: 0 }));
  }
  return buckets.map(b => ({
    ...b,
    share: roundUsd(b.totalCostUsd / totalCostUsd),
  }));
}

function rollupBy(
  samples: ApiCostEvent[],
  keyFn: (e: ApiCostEvent) => string,
  labelFn?: (key: string) => string
): ApiCostBucket[] {
  const map = new Map<string, ApiCostBucket>();
  for (const e of samples) {
    const key = keyFn(e);
    const bucket = map.get(key) ?? {
      key,
      ...(labelFn ? { label: labelFn(key) } : {}),
      count: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalCostUsd: 0,
    };
    bucket.count += 1;
    bucket.inputTokens += e.inputTokens;
    bucket.outputTokens += e.outputTokens;
    bucket.totalCostUsd += e.estimatedCostUsd;
    map.set(key, bucket);
  }
  return Array.from(map.values())
    .map(b => ({
      ...b,
      totalCostUsd: roundUsd(b.totalCostUsd),
    }))
    .sort(
      (a, b) => b.totalCostUsd - a.totalCostUsd || a.key.localeCompare(b.key)
    );
}

function rollupByJobSheet(samples: ApiCostEvent[]): JobSheetCostBucket[] {
  const map = new Map<number, ApiCostEvent[]>();
  for (const e of samples) {
    if (e.jobSheetId === undefined) continue;
    const list = map.get(e.jobSheetId) ?? [];
    list.push(e);
    map.set(e.jobSheetId, list);
  }

  return Array.from(map.entries())
    .map(([jobSheetId, rows]) => {
      const totalCostUsd = roundUsd(
        rows.reduce((s, e) => s + e.estimatedCostUsd, 0)
      );
      return {
        jobSheetId,
        callCount: rows.length,
        inputTokens: rows.reduce((s, e) => s + e.inputTokens, 0),
        outputTokens: rows.reduce((s, e) => s + e.outputTokens, 0),
        totalCostUsd,
        byTool: withShares(
          rollupBy(rows, e => e.tool, toolDisplayLabel),
          totalCostUsd
        ),
      };
    })
    .sort(
      (a, b) => b.totalCostUsd - a.totalCostUsd || a.jobSheetId - b.jobSheetId
    );
}

function periodKey(iso: string, grain: "day" | "month"): string {
  // recordedAt is ISO UTC → slice YYYY-MM-DD or YYYY-MM
  return grain === "day" ? iso.slice(0, 10) : iso.slice(0, 7);
}

function rollupByPeriod(
  samples: ApiCostEvent[],
  grain: "day" | "month"
): PeriodCostBucket[] {
  const map = new Map<string, ApiCostEvent[]>();
  for (const e of samples) {
    const key = periodKey(e.recordedAt, grain);
    const list = map.get(key) ?? [];
    list.push(e);
    map.set(key, list);
  }

  return Array.from(map.entries())
    .map(([period, rows]) => {
      const totalCostUsd = roundUsd(
        rows.reduce((s, e) => s + e.estimatedCostUsd, 0)
      );
      const jobIds = new Set(
        rows
          .map(e => e.jobSheetId)
          .filter((id): id is number => typeof id === "number")
      );
      const jobSheetsReviewed = jobIds.size;
      const attributed = rows
        .filter(e => e.jobSheetId !== undefined)
        .reduce((s, e) => s + e.estimatedCostUsd, 0);
      return {
        period,
        callCount: rows.length,
        jobSheetsReviewed,
        inputTokens: rows.reduce((s, e) => s + e.inputTokens, 0),
        outputTokens: rows.reduce((s, e) => s + e.outputTokens, 0),
        totalCostUsd,
        avgCostPerJobSheetUsd:
          jobSheetsReviewed > 0 ? roundUsd(attributed / jobSheetsReviewed) : 0,
        byTool: withShares(
          rollupBy(rows, e => e.tool, toolDisplayLabel),
          totalCostUsd
        ),
      };
    })
    .sort((a, b) => b.period.localeCompare(a.period));
}

/**
 * Aggregate retained cost events for the admin dashboard.
 */
export function summarizeApiCosts(opts?: {
  windowHours?: number | null;
  recentLimit?: number;
  jobSheetLimit?: number;
  dayLimit?: number;
  monthLimit?: number;
  now?: Date;
}): ApiCostSummary {
  const windowHours = opts?.windowHours === undefined ? 24 : opts.windowHours;
  const recentLimit = Math.min(Math.max(opts?.recentLimit ?? 25, 1), 200);
  const jobSheetLimit = Math.min(Math.max(opts?.jobSheetLimit ?? 50, 1), 200);
  const dayLimit = Math.min(Math.max(opts?.dayLimit ?? 62, 1), 366);
  const monthLimit = Math.min(Math.max(opts?.monthLimit ?? 24, 1), 60);
  const now = opts?.now ?? new Date();
  const { filtered, since } = filterByWindow(
    events,
    windowHours,
    now.getTime()
  );

  const totalCostUsd = roundUsd(
    filtered.reduce((sum, e) => sum + e.estimatedCostUsd, 0)
  );
  const byJobSheet = rollupByJobSheet(filtered);
  const jobSheetsReviewed = byJobSheet.length;
  const attributedCostUsd = byJobSheet.reduce(
    (sum, b) => sum + b.totalCostUsd,
    0
  );

  return {
    windowHours,
    since,
    totalCalls: filtered.length,
    totalInputTokens: filtered.reduce((s, e) => s + e.inputTokens, 0),
    totalOutputTokens: filtered.reduce((s, e) => s + e.outputTokens, 0),
    totalCostUsd,
    avgCostPerCallUsd:
      filtered.length > 0 ? roundUsd(totalCostUsd / filtered.length) : 0,
    jobSheetsReviewed,
    avgCostPerJobSheetUsd:
      jobSheetsReviewed > 0
        ? roundUsd(attributedCostUsd / jobSheetsReviewed)
        : 0,
    byTool: withShares(
      rollupBy(filtered, e => e.tool, toolDisplayLabel),
      totalCostUsd
    ),
    byProvider: withShares(
      rollupBy(filtered, e => e.provider),
      totalCostUsd
    ),
    byModel: withShares(
      rollupBy(filtered, e => `${e.provider}/${e.model}`),
      totalCostUsd
    ),
    byStage: withShares(
      rollupBy(filtered, e => e.stage),
      totalCostUsd
    ),
    byJobSheet: byJobSheet.slice(0, jobSheetLimit),
    byDay: rollupByPeriod(filtered, "day").slice(0, dayLimit),
    byMonth: rollupByPeriod(filtered, "month").slice(0, monthLimit),
    recentEvents: [...filtered]
      .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
      .slice(0, recentLimit),
    retentionNote: RETENTION_NOTE,
  };
}
