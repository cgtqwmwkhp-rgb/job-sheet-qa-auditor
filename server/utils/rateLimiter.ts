/**
 * Rate Limiter for API Endpoints
 *
 * Default backend is in-memory (single-replica only).
 * Set SHARED_LIMITS_REDIS_URL or REDIS_URL to share limits across replicas.
 * Production/staging multi-replica without Redis is refused at boot
 * via assertSharedLimitsReplicaSafety().
 */

import net from "net";
import { URL } from "url";

export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  keyGenerator?: (req: any) => string; // Function to generate rate limit key
  skipFailedRequests?: boolean;
  skipSuccessfulRequests?: boolean;
  message?: string;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  retryAfter?: number;
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

export type SharedLimitsBackend = "memory" | "redis";

const RATE_LIMIT_KEY_PREFIX = "jsqa:rl:";

// In-memory store for rate limits (single-replica)
const rateLimitStore: Map<string, RateLimitEntry> = new Map();

const DEFAULT_CONFIG: RateLimitConfig = {
  windowMs: 60 * 1000,
  maxRequests: 100,
  message: "Too many requests, please try again later.",
};

const CLEANUP_INTERVAL = 5 * 60 * 1000;
let cleanupTimer: NodeJS.Timeout | null = null;

function startCleanup() {
  if (cleanupTimer) return;

  cleanupTimer = setInterval(() => {
    const now = Date.now();
    const entries = Array.from(rateLimitStore.entries());
    for (const [key, entry] of entries) {
      if (entry.resetTime < now) {
        rateLimitStore.delete(key);
      }
    }
  }, CLEANUP_INTERVAL);
  // Allow process to exit in tests without waiting for the timer
  if (typeof cleanupTimer.unref === "function") {
    cleanupTimer.unref();
  }
}

startCleanup();

/** Redis / shared-limits connection URL (optional). */
export function getSharedLimitsRedisUrl(): string | undefined {
  const raw =
    process.env.SHARED_LIMITS_REDIS_URL?.trim() ||
    process.env.REDIS_URL?.trim() ||
    "";
  return raw || undefined;
}

/**
 * Active shared-limits backend.
 * Redis wins when a URL is configured (multi-replica safe path).
 */
export function getSharedLimitsBackend(): SharedLimitsBackend {
  const forced = (process.env.SHARED_LIMITS_BACKEND || "").trim().toLowerCase();
  if (forced === "redis") return "redis";
  if (forced === "memory") return "memory";
  return getSharedLimitsRedisUrl() ? "redis" : "memory";
}

/**
 * Configured replica / instance count for deploy-guard checks.
 * Prefer explicit SHARED_LIMITS_EXPECTED_REPLICAS, then Azure App Service /
 * Container Apps hints. Defaults to 1 (single replica).
 */
export function getConfiguredReplicaCount(): number {
  const explicit = parsePositiveInt(
    process.env.SHARED_LIMITS_EXPECTED_REPLICAS
  );
  if (explicit !== undefined) return explicit;

  const websites = parsePositiveInt(process.env.WEBSITES_NUM_INSTANCES);
  if (websites !== undefined) return websites;

  const containerApp = parsePositiveInt(
    process.env.CONTAINER_APP_REPLICA_COUNT ||
      process.env.CONTAINER_APP_REPLICAS
  );
  if (containerApp !== undefined) return containerApp;

  return 1;
}

function parsePositiveInt(raw: string | undefined): number | undefined {
  if (raw === undefined || raw.trim() === "") return undefined;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return undefined;
  return n;
}

function isDeployGuardEnv(): boolean {
  if (process.env.NODE_ENV === "test") return false;
  if (process.env.SKIP_SHARED_LIMITS_REPLICA_GUARD === "true") return false;

  const appEnv = (process.env.APP_ENV || "").trim().toLowerCase();
  if (appEnv === "production" || appEnv === "staging" || appEnv === "prod") {
    return true;
  }
  return process.env.NODE_ENV === "production";
}

/**
 * Fail boot when in-memory limits/progress would be split across replicas.
 * Multi-replica requires Redis (SHARED_LIMITS_REDIS_URL / REDIS_URL).
 *
 * Escape hatch (ops only): ALLOW_INMEMORY_MULTI_REPLICA=true — logs loudly
 * and does not meet the multi-replica safety bar.
 */
export function assertSharedLimitsReplicaSafety(): void {
  if (!isDeployGuardEnv()) return;

  const replicas = getConfiguredReplicaCount();
  const backend = getSharedLimitsBackend();

  if (replicas <= 1) {
    console.log(
      `[SharedLimits] backend=${backend} replicas=${replicas} (single-replica OK)`
    );
    return;
  }

  if (backend === "redis") {
    if (!getSharedLimitsRedisUrl()) {
      throw new Error(
        "[SharedLimits] SHARED_LIMITS_BACKEND=redis but SHARED_LIMITS_REDIS_URL/REDIS_URL is unset"
      );
    }
    console.log(
      `[SharedLimits] backend=redis replicas=${replicas} (multi-replica OK)`
    );
    return;
  }

  if (process.env.ALLOW_INMEMORY_MULTI_REPLICA === "true") {
    console.error(
      `[SharedLimits] WARNING: in-memory rate limits/progress with replicas=${replicas}. ` +
        `Limits and live processStatus are NOT shared across replicas. ` +
        `Set SHARED_LIMITS_REDIS_URL or scale to 1 instance.`
    );
    return;
  }

  throw new Error(
    `[SharedLimits] Refusing to start: replicas=${replicas} but shared limits backend is in-memory. ` +
      `Rate limits and live processStatus are process-local and unsafe across replicas. ` +
      `Fix: set SHARED_LIMITS_REDIS_URL (or REDIS_URL) and deploy Redis, ` +
      `or set SHARED_LIMITS_EXPECTED_REPLICAS=1 / scale the app to a single replica, ` +
      `or (emergency only) ALLOW_INMEMORY_MULTI_REPLICA=true.`
  );
}

// ─── Minimal Redis RESP client (no extra dependency) ─────────────────────────

type RedisReply = string | number | null | RedisReply[];

class MiniRedis {
  private readonly host: string;
  private readonly port: number;
  private readonly password?: string;
  private readonly db: number;
  private socket: net.Socket | null = null;
  private buffer = Buffer.alloc(0);
  private readonly waiters: Array<{
    resolve: (v: RedisReply) => void;
    reject: (e: Error) => void;
  }> = [];
  private connecting: Promise<void> | null = null;

  constructor(redisUrl: string) {
    const u = new URL(redisUrl);
    this.host = u.hostname || "127.0.0.1";
    this.port = u.port ? Number(u.port) : 6379;
    this.password = u.password ? decodeURIComponent(u.password) : undefined;
    const pathDb = u.pathname?.replace(/^\//, "");
    this.db = pathDb ? Number(pathDb) || 0 : 0;
  }

  async connect(): Promise<void> {
    if (this.socket && !this.socket.destroyed) return;
    if (this.connecting) return this.connecting;

    const pending = new Promise<void>((resolve, reject) => {
      const socket = net.createConnection({ host: this.host, port: this.port });
      const onError = (err: Error) => {
        this.connecting = null;
        reject(err);
      };
      socket.once("error", onError);
      socket.once("connect", () => {
        socket.off("error", onError);
        this.socket = socket;
        socket.on("data", chunk => this.onData(chunk));
        socket.on("error", err => this.failAll(err));
        socket.on("close", () => {
          this.socket = null;
          this.failAll(new Error("Redis connection closed"));
        });
        this.connecting = null;
        resolve();
      });
    });
    this.connecting = pending;
    await pending;

    if (this.password) {
      await this.rawCommand("AUTH", this.password);
    }
    if (this.db > 0) {
      await this.rawCommand("SELECT", String(this.db));
    }
  }

  private failAll(err: Error) {
    while (this.waiters.length) {
      this.waiters.shift()!.reject(err);
    }
  }

  private onData(chunk: Buffer) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.waiters.length) {
      const parsed = tryParseReply(this.buffer);
      if (!parsed) break;
      this.buffer = Buffer.from(parsed.rest);
      const waiter = this.waiters.shift()!;
      if (parsed.error) waiter.reject(parsed.error);
      else waiter.resolve(parsed.value!);
    }
  }

  private rawCommand(...args: string[]): Promise<RedisReply> {
    if (!this.socket) throw new Error("Redis not connected");
    const payload = encodeCommand(args);
    return new Promise<RedisReply>((resolve, reject) => {
      this.waiters.push({ resolve, reject });
      this.socket!.write(payload);
    });
  }

  async command(...args: string[]): Promise<RedisReply> {
    await this.connect();
    return this.rawCommand(...args);
  }

  async eval(
    script: string,
    keys: string[],
    argv: string[]
  ): Promise<RedisReply> {
    return this.command("EVAL", script, String(keys.length), ...keys, ...argv);
  }

  async get(key: string): Promise<string | null> {
    const v = await this.command("GET", key);
    return v === null ? null : String(v);
  }

  async set(key: string, value: string, pxMs?: number): Promise<void> {
    if (pxMs !== undefined) {
      await this.command("SET", key, value, "PX", String(pxMs));
    } else {
      await this.command("SET", key, value);
    }
  }

  async del(key: string): Promise<void> {
    await this.command("DEL", key);
  }

  async ping(): Promise<void> {
    const pong = await this.command("PING");
    if (String(pong) !== "PONG") {
      throw new Error(`Unexpected Redis PING reply: ${String(pong)}`);
    }
  }

  disconnect(): void {
    this.socket?.destroy();
    this.socket = null;
  }
}

function encodeCommand(args: string[]): string {
  let out = `*${args.length}\r\n`;
  for (const arg of args) {
    const buf = Buffer.from(arg, "utf8");
    out += `$${buf.length}\r\n${arg}\r\n`;
  }
  return out;
}

function tryParseReply(buf: Buffer): {
  value?: RedisReply;
  error?: Error;
  rest: Buffer;
} | null {
  if (buf.length === 0) return null;
  const type = String.fromCharCode(buf[0]);
  if (type === "+" || type === "-" || type === ":") {
    const idx = buf.indexOf("\r\n");
    if (idx < 0) return null;
    const body = buf.subarray(1, idx).toString("utf8");
    const rest = buf.subarray(idx + 2);
    if (type === "-") return { error: new Error(body), rest };
    if (type === ":") return { value: Number(body), rest };
    return { value: body, rest };
  }
  if (type === "$") {
    const idx = buf.indexOf("\r\n");
    if (idx < 0) return null;
    const len = Number(buf.subarray(1, idx).toString("utf8"));
    if (len === -1) return { value: null, rest: buf.subarray(idx + 2) };
    const start = idx + 2;
    const end = start + len;
    if (buf.length < end + 2) return null;
    const value = buf.subarray(start, end).toString("utf8");
    return { value, rest: buf.subarray(end + 2) };
  }
  if (type === "*") {
    const idx = buf.indexOf("\r\n");
    if (idx < 0) return null;
    const count = Number(buf.subarray(1, idx).toString("utf8"));
    let rest = buf.subarray(idx + 2);
    if (count === -1) return { value: null, rest };
    const items: RedisReply[] = [];
    for (let i = 0; i < count; i++) {
      const part = tryParseReply(rest);
      if (!part) return null;
      if (part.error) return { error: part.error, rest: part.rest };
      items.push(part.value!);
      rest = part.rest;
    }
    return { value: items, rest };
  }
  return {
    error: new Error(`Unsupported Redis reply type: ${type}`),
    rest: Buffer.alloc(0),
  };
}

let redisClient: MiniRedis | null = null;
let redisInit: Promise<MiniRedis> | null = null;

export async function getSharedLimitsRedis(): Promise<MiniRedis> {
  const url = getSharedLimitsRedisUrl();
  if (!url) {
    throw new Error("Shared limits Redis URL is not configured");
  }
  if (redisClient) return redisClient;
  if (redisInit) return redisInit;

  redisInit = (async () => {
    const client = new MiniRedis(url);
    await client.connect();
    await client.ping();
    redisClient = client;
    return client;
  })();

  try {
    return await redisInit;
  } catch (err) {
    redisInit = null;
    redisClient = null;
    throw err;
  }
}

/** Test helper — drop Redis client (forces reconnect). */
export function resetSharedLimitsRedisClient(): void {
  redisClient?.disconnect();
  redisClient = null;
  redisInit = null;
}

const RATE_LIMIT_LUA = `
local key = KEYS[1]
local windowMs = tonumber(ARGV[1])
local maxRequests = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local current = redis.call('GET', key)
if current == false then
  redis.call('SET', key, 1, 'PX', windowMs)
  return {1, maxRequests - 1, now + windowMs}
end
current = tonumber(current)
local ttl = redis.call('PTTL', key)
if ttl < 0 then
  ttl = windowMs
  redis.call('PEXPIRE', key, windowMs)
end
local resetTime = now + ttl
if current >= maxRequests then
  return {0, 0, resetTime}
end
current = redis.call('INCR', key)
if redis.call('PTTL', key) < 0 then
  redis.call('PEXPIRE', key, windowMs)
end
return {1, maxRequests - current, resetTime}
`;

function checkRateLimitMemory(
  key: string,
  config: Partial<RateLimitConfig> = {}
): RateLimitResult {
  const opts = { ...DEFAULT_CONFIG, ...config };
  const now = Date.now();

  let entry = rateLimitStore.get(key);

  if (!entry || entry.resetTime < now) {
    entry = {
      count: 0,
      resetTime: now + opts.windowMs,
    };
    rateLimitStore.set(key, entry);
  }

  if (entry.count >= opts.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetTime: entry.resetTime,
      retryAfter: Math.ceil((entry.resetTime - now) / 1000),
    };
  }

  entry.count++;

  return {
    allowed: true,
    remaining: opts.maxRequests - entry.count,
    resetTime: entry.resetTime,
  };
}

async function checkRateLimitRedis(
  key: string,
  config: Partial<RateLimitConfig> = {}
): Promise<RateLimitResult> {
  const opts = { ...DEFAULT_CONFIG, ...config };
  const now = Date.now();
  const client = await getSharedLimitsRedis();
  const reply = await client.eval(
    RATE_LIMIT_LUA,
    [`${RATE_LIMIT_KEY_PREFIX}${key}`],
    [String(opts.windowMs), String(opts.maxRequests), String(now)]
  );

  if (!Array.isArray(reply) || reply.length < 3) {
    throw new Error("Unexpected Redis rate-limit reply");
  }

  const allowed = Number(reply[0]) === 1;
  const remaining = Math.max(0, Number(reply[1]));
  const resetTime = Number(reply[2]);

  return {
    allowed,
    remaining,
    resetTime,
    retryAfter: allowed ? undefined : Math.ceil((resetTime - now) / 1000),
  };
}

/**
 * Check rate limit for a key (memory or Redis depending on config).
 */
export async function checkRateLimit(
  key: string,
  config: Partial<RateLimitConfig> = {}
): Promise<RateLimitResult> {
  if (getSharedLimitsBackend() === "redis") {
    return checkRateLimitRedis(key, config);
  }
  return checkRateLimitMemory(key, config);
}

/**
 * Sync memory-only check (tests / single-replica callers that cannot await).
 * Throws if Redis backend is active — use checkRateLimit() instead.
 */
export function checkRateLimitSync(
  key: string,
  config: Partial<RateLimitConfig> = {}
): RateLimitResult {
  if (getSharedLimitsBackend() === "redis") {
    throw new Error(
      "checkRateLimitSync is unavailable when SHARED_LIMITS backend is redis; use await checkRateLimit()"
    );
  }
  return checkRateLimitMemory(key, config);
}

export async function decrementRateLimit(key: string): Promise<void> {
  if (getSharedLimitsBackend() === "redis") {
    // Best-effort: not used on hot paths today; skip precise Redis DECR.
    return;
  }
  const entry = rateLimitStore.get(key);
  if (entry && entry.count > 0) {
    entry.count--;
  }
}

export async function resetRateLimit(key: string): Promise<void> {
  if (getSharedLimitsBackend() === "redis") {
    const client = await getSharedLimitsRedis();
    await client.del(`${RATE_LIMIT_KEY_PREFIX}${key}`);
    return;
  }
  rateLimitStore.delete(key);
}

export async function clearAllRateLimits(): Promise<void> {
  rateLimitStore.clear();
  // Redis: no KEYS scan in prod paths — tests use memory backend.
}

export async function getRateLimitStatus(
  key: string,
  config: Partial<RateLimitConfig> = {}
): Promise<RateLimitResult> {
  const opts = { ...DEFAULT_CONFIG, ...config };
  const now = Date.now();

  if (getSharedLimitsBackend() === "redis") {
    const client = await getSharedLimitsRedis();
    const redisKey = `${RATE_LIMIT_KEY_PREFIX}${key}`;
    const raw = await client.get(redisKey);
    if (raw === null) {
      return {
        allowed: true,
        remaining: opts.maxRequests,
        resetTime: now + opts.windowMs,
      };
    }
    const count = Number(raw);
    const ttlReply = await client.command("PTTL", redisKey);
    const ttl = typeof ttlReply === "number" ? ttlReply : opts.windowMs;
    const resetTime = now + Math.max(ttl, 0);
    return {
      allowed: count < opts.maxRequests,
      remaining: Math.max(0, opts.maxRequests - count),
      resetTime,
      retryAfter:
        count >= opts.maxRequests
          ? Math.ceil((resetTime - now) / 1000)
          : undefined,
    };
  }

  const entry = rateLimitStore.get(key);
  if (!entry || entry.resetTime < now) {
    return {
      allowed: true,
      remaining: opts.maxRequests,
      resetTime: now + opts.windowMs,
    };
  }

  return {
    allowed: entry.count < opts.maxRequests,
    remaining: Math.max(0, opts.maxRequests - entry.count),
    resetTime: entry.resetTime,
    retryAfter:
      entry.count >= opts.maxRequests
        ? Math.ceil((entry.resetTime - now) / 1000)
        : undefined,
  };
}

export const RATE_LIMITS = {
  standard: {
    windowMs: 60 * 1000,
    maxRequests: 100,
  },
  upload: {
    windowMs: 60 * 1000,
    maxRequests: 10,
    message:
      "Upload rate limit exceeded. Please wait before uploading more files.",
  },
  processing: {
    windowMs: 60 * 1000,
    maxRequests: 5,
    message:
      "Processing rate limit exceeded. Please wait before processing more documents.",
  },
  auth: {
    windowMs: 15 * 60 * 1000,
    maxRequests: 5,
    message: "Too many authentication attempts. Please try again later.",
  },
  admin: {
    windowMs: 60 * 1000,
    maxRequests: 30,
  },
  review: {
    windowMs: 60 * 1000,
    maxRequests: 40,
    message: "Review action rate limit exceeded. Please wait before retrying.",
  },
  webhook: {
    windowMs: 60 * 1000,
    maxRequests: 100,
  },
};

export function createRateLimiter(config: Partial<RateLimitConfig> = {}) {
  return {
    check: (userId: number | string) => {
      const key = `user:${userId}`;
      return checkRateLimit(key, config);
    },
    checkByIp: (ip: string) => {
      const key = `ip:${ip}`;
      return checkRateLimit(key, config);
    },
    reset: (userId: number | string) => {
      return resetRateLimit(`user:${userId}`);
    },
  };
}

export class RateLimitError extends Error {
  public readonly retryAfter: number;
  public readonly resetTime: number;

  constructor(message: string, retryAfter: number, resetTime: number) {
    super(message);
    this.name = "RateLimitError";
    this.retryAfter = retryAfter;
    this.resetTime = resetTime;
  }
}

export async function enforceRateLimit(
  key: string,
  config: Partial<RateLimitConfig> = {}
): Promise<RateLimitResult> {
  const result = await checkRateLimit(key, config);

  if (!result.allowed) {
    throw new RateLimitError(
      config.message || DEFAULT_CONFIG.message!,
      result.retryAfter!,
      result.resetTime
    );
  }

  return result;
}

/** Sync enforce for memory-only / legacy tests. */
export function enforceRateLimitSync(
  key: string,
  config: Partial<RateLimitConfig> = {}
): RateLimitResult {
  const result = checkRateLimitSync(key, config);
  if (!result.allowed) {
    throw new RateLimitError(
      config.message || DEFAULT_CONFIG.message!,
      result.retryAfter!,
      result.resetTime
    );
  }
  return result;
}
