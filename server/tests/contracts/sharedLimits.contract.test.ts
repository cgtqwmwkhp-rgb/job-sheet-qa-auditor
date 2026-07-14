/**
 * Shared limits / multi-replica deploy guard (PR-OPS-LIMITS)
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  assertSharedLimitsReplicaSafety,
  getConfiguredReplicaCount,
  getSharedLimitsBackend,
  checkRateLimit,
  clearAllRateLimits,
  enforceRateLimitSync,
  RATE_LIMITS,
} from "../../utils/rateLimiter";

describe("Shared limits replica guard (PR-OPS-LIMITS)", () => {
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    await clearAllRateLimits();
    delete process.env.SHARED_LIMITS_REDIS_URL;
    delete process.env.REDIS_URL;
    delete process.env.SHARED_LIMITS_BACKEND;
    delete process.env.SHARED_LIMITS_EXPECTED_REPLICAS;
    delete process.env.WEBSITES_NUM_INSTANCES;
    delete process.env.CONTAINER_APP_REPLICA_COUNT;
    delete process.env.CONTAINER_APP_REPLICAS;
    delete process.env.ALLOW_INMEMORY_MULTI_REPLICA;
    delete process.env.SKIP_SHARED_LIMITS_REPLICA_GUARD;
    delete process.env.APP_ENV;
    process.env.NODE_ENV = "test";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("defaults to memory backend and replica count 1", () => {
    expect(getSharedLimitsBackend()).toBe("memory");
    expect(getConfiguredReplicaCount()).toBe(1);
  });

  it("selects redis backend when REDIS_URL is set", () => {
    process.env.REDIS_URL = "redis://127.0.0.1:6379/0";
    expect(getSharedLimitsBackend()).toBe("redis");
  });

  it("skips guard in NODE_ENV=test", () => {
    process.env.NODE_ENV = "test";
    process.env.APP_ENV = "production";
    process.env.SHARED_LIMITS_EXPECTED_REPLICAS = "3";
    expect(() => assertSharedLimitsReplicaSafety()).not.toThrow();
  });

  it("allows single-replica production with in-memory backend", () => {
    process.env.NODE_ENV = "production";
    process.env.APP_ENV = "production";
    process.env.SHARED_LIMITS_EXPECTED_REPLICAS = "1";
    expect(() => assertSharedLimitsReplicaSafety()).not.toThrow();
  });

  it("refuses multi-replica production without Redis", () => {
    process.env.NODE_ENV = "production";
    process.env.APP_ENV = "production";
    process.env.SHARED_LIMITS_EXPECTED_REPLICAS = "2";
    expect(() => assertSharedLimitsReplicaSafety()).toThrow(
      /Refusing to start.*replicas=2/i
    );
  });

  it("allows multi-replica when Redis URL is configured", () => {
    process.env.NODE_ENV = "production";
    process.env.APP_ENV = "production";
    process.env.SHARED_LIMITS_EXPECTED_REPLICAS = "3";
    process.env.SHARED_LIMITS_REDIS_URL = "redis://127.0.0.1:6379/0";
    expect(() => assertSharedLimitsReplicaSafety()).not.toThrow();
  });

  it("memory rate limit still works synchronously for local/tests", async () => {
    const key = "ops-limits-sync";
    for (let i = 0; i < RATE_LIMITS.upload.maxRequests; i++) {
      enforceRateLimitSync(key, RATE_LIMITS.upload);
    }
    expect(() => enforceRateLimitSync(key, RATE_LIMITS.upload)).toThrow();
    const status = await checkRateLimit("ops-limits-async-ok", {
      maxRequests: 2,
      windowMs: 60_000,
    });
    expect(status.allowed).toBe(true);
  });

  it("boot path calls assertSharedLimitsReplicaSafety", () => {
    const indexPath = path.resolve(__dirname, "../../_core/index.ts");
    const index = fs.readFileSync(indexPath, "utf-8");
    expect(index).toContain("assertSharedLimitsReplicaSafety");
  });

  it("processStatus uses shared live progress helper", () => {
    const statusPath = path.resolve(
      __dirname,
      "../../services/processStatus.ts"
    );
    const storePath = path.resolve(
      __dirname,
      "../../services/processingProgressStore.ts"
    );
    const status = fs.readFileSync(statusPath, "utf-8");
    const store = fs.readFileSync(storePath, "utf-8");
    expect(status).toContain("getLiveProcessingProgressShared");
    expect(store).toContain("getLiveProcessingProgressShared");
    expect(store).toContain("jsqa:progress:");
  });
});
