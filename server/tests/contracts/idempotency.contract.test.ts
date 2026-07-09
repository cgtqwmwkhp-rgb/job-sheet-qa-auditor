/**
 * Idempotency Key Contract Tests (Phase 3.x)
 *
 * Fixtures only — no DB, documentProcessor, or live AI.
 * Verifies feature flag default-off and pure deterministic key rules.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createHash } from "crypto";
import {
  FEATURE_FLAG,
  isIdempotencyEnabled,
  buildIdempotencyKey,
  type IdempotencyKey,
} from "../../services/idempotency";

function expectedKey(scope: string, parts: string[]): string {
  const payload = parts.join("|");
  const hash = createHash("sha256").update(payload).digest("hex").slice(0, 32);
  return `${scope}:${hash}`;
}

describe("Idempotency Contract (Phase 3.x)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env[FEATURE_FLAG];
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("feature flag", () => {
    it("is disabled by default when FEATURE_IDEMPOTENCY unset", () => {
      expect(isIdempotencyEnabled()).toBe(false);
    });

    it("is enabled only when FEATURE_IDEMPOTENCY=true", () => {
      process.env[FEATURE_FLAG] = "true";
      expect(isIdempotencyEnabled()).toBe(true);
    });

    it("remains disabled for non-true values", () => {
      process.env[FEATURE_FLAG] = "1";
      expect(isIdempotencyEnabled()).toBe(false);
      process.env[FEATURE_FLAG] = "false";
      expect(isIdempotencyEnabled()).toBe(false);
    });
  });

  describe("buildIdempotencyKey", () => {
    it("returns scope-prefixed sha256 digest (first 32 hex chars)", () => {
      const parts = ["job-123", "user-456"];
      const key = buildIdempotencyKey("process-job", parts);

      expect(key).toBe(expectedKey("process-job", parts));
      expect(key).toBe("process-job:5edd2a3c6f061edf059a152311a33434");
      expect(key).toMatch(/^process-job:[0-9a-f]{32}$/);
    });

    it("is deterministic for the same scope and parts", () => {
      const parts = ["sheet-42", "v2"];
      const first = buildIdempotencyKey("enqueue", parts);
      const second = buildIdempotencyKey("enqueue", parts);

      expect(first).toBe(second);
      expect(first).toBe(expectedKey("enqueue", parts));
    });

    it("changes when parts differ", () => {
      const base = buildIdempotencyKey("process-job", ["job-123", "user-456"]);
      const changed = buildIdempotencyKey("process-job", [
        "job-123",
        "user-457",
      ]);

      expect(changed).not.toBe(base);
    });

    it("changes when part order differs", () => {
      const forward = buildIdempotencyKey("process-job", [
        "job-123",
        "user-456",
      ]);
      const reversed = buildIdempotencyKey("process-job", [
        "user-456",
        "job-123",
      ]);

      expect(reversed).not.toBe(forward);
    });

    it("changes when scope differs", () => {
      const parts = ["job-123"];
      const processKey = buildIdempotencyKey("process-job", parts);
      const reprocessKey = buildIdempotencyKey("reprocess", parts);

      expect(reprocessKey).not.toBe(processKey);
      expect(reprocessKey).toBe(expectedKey("reprocess", parts));
    });

    it("supports empty parts array", () => {
      const key = buildIdempotencyKey("singleton", []);

      expect(key).toBe(expectedKey("singleton", []));
      expect(key).toMatch(/^singleton:[0-9a-f]{32}$/);
    });

    it("rejects empty scope", () => {
      expect(() => buildIdempotencyKey("", ["job-123"])).toThrow(
        /scope must not be empty/i
      );
    });

    it("rejects whitespace-only scope", () => {
      expect(() => buildIdempotencyKey("   ", ["job-123"])).toThrow(
        /scope must not be empty/i
      );
    });

    it("trims scope before prefixing", () => {
      const key = buildIdempotencyKey("  process-job  ", ["job-123"]);

      expect(key.startsWith("process-job:")).toBe(true);
      expect(key).toBe(expectedKey("process-job", ["job-123"]));
    });
  });

  describe("IdempotencyKey type", () => {
    it("accepts key + scope pairs for downstream wiring", () => {
      const scope = "process-job";
      const record: IdempotencyKey = {
        scope,
        key: buildIdempotencyKey(scope, ["job-123"]),
      };

      expect(record.scope).toBe("process-job");
      expect(record.key).toMatch(/^process-job:[0-9a-f]{32}$/);
    });
  });
});
