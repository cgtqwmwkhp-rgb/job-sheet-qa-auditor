import { createHash } from "crypto";
import { TRPCError } from "@trpc/server";

const DEFAULT_TTL_MS = 5 * 60 * 1000;

type StoredResponse = {
  fingerprint: string;
  expiresAt: number;
  response: Promise<unknown>;
};

/**
 * Short-lived per-process replay store for request idempotency. Callers must
 * scope keys by authenticated user and procedure so one user's key cannot
 * replay another user's result.
 */
export class ActionResponseStore {
  private readonly records = new Map<string, StoredResponse>();

  constructor(
    private readonly now: () => number = Date.now,
    private readonly ttlMs: number = DEFAULT_TTL_MS
  ) {}

  async execute<T>(input: {
    scope: string;
    key?: string | null;
    body: unknown;
    action: () => Promise<T>;
  }): Promise<T> {
    const key = normalizeIdempotencyKey(input.key);
    if (!key) return input.action();

    const recordKey = `${input.scope}:${key}`;
    const fingerprint = fingerprintBody(input.body);
    const existing = this.records.get(recordKey);
    if (existing && existing.expiresAt > this.now()) {
      if (existing.fingerprint !== fingerprint) {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "Idempotency-Key was already used with a different request body",
        });
      }
      return existing.response as Promise<T>;
    }

    this.records.delete(recordKey);
    const response = Promise.resolve().then(input.action);
    this.records.set(recordKey, {
      fingerprint,
      expiresAt: this.now() + this.ttlMs,
      response,
    });

    try {
      return await response;
    } catch (error) {
      // Failed attempts are retriable with the same key.
      this.records.delete(recordKey);
      throw error;
    }
  }
}

export function getIdempotencyKey(req: unknown): string | undefined {
  const request = req as {
    get?: (name: string) => string | undefined;
    header?: (name: string) => string | undefined;
    headers?: Record<string, string | string[] | undefined>;
  };
  const value =
    request.get?.("Idempotency-Key") ??
    request.header?.("Idempotency-Key") ??
    request.headers?.["idempotency-key"] ??
    request.headers?.["Idempotency-Key"];
  return Array.isArray(value) ? value[0] : value;
}

export function normalizeIdempotencyKey(
  key: string | null | undefined
): string | undefined {
  const normalized = key?.trim();
  if (!normalized) return undefined;
  if (normalized.length > 255) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Idempotency-Key must be 255 characters or fewer",
    });
  }
  return normalized;
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

export const auditActionResponseStore = new ActionResponseStore();
