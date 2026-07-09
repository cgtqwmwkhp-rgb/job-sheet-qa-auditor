/**
 * API/Model Quota Guard Contract Tests (Phase 3.x)
 *
 * Fixtures only — no DB, documentProcessor, or live AI.
 * Verifies feature flag default-off and pure quota window checks.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  FEATURE_FLAG,
  isQuotaGuardEnabled,
  checkQuota,
  type QuotaWindow,
} from "../../services/quotaGuard";

describe("Quota Guard Contract (Phase 3.x)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env[FEATURE_FLAG];
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("feature flag", () => {
    it("is disabled by default when FEATURE_QUOTA_GUARD unset", () => {
      expect(isQuotaGuardEnabled()).toBe(false);
    });

    it("is enabled only when FEATURE_QUOTA_GUARD=true", () => {
      process.env[FEATURE_FLAG] = "true";
      expect(isQuotaGuardEnabled()).toBe(true);
    });

    it("remains disabled for non-true values", () => {
      process.env[FEATURE_FLAG] = "1";
      expect(isQuotaGuardEnabled()).toBe(false);
      process.env[FEATURE_FLAG] = "false";
      expect(isQuotaGuardEnabled()).toBe(false);
    });
  });

  describe("checkQuota", () => {
    const window: QuotaWindow = {
      used: 8,
      limit: 10,
      unit: "requests",
    };

    it("allows when used + default cost is within limit", () => {
      const result = checkQuota(window);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(2);
      expect(result.reason).toContain("within quota");
      expect(result.reason).toContain("9/10 requests");
    });

    it("allows when used + custom cost equals limit", () => {
      const result = checkQuota(window, 2);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(2);
      expect(result.reason).toContain("10/10 requests");
    });

    it("denies when used + cost exceeds limit", () => {
      const result = checkQuota(window, 3);

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(2);
      expect(result.reason).toContain("quota exceeded");
      expect(result.reason).toContain("11/10 requests");
    });

    it("returns zero remaining when quota is exhausted", () => {
      const exhausted: QuotaWindow = {
        used: 10,
        limit: 10,
        unit: "tokens",
      };

      const result = checkQuota(exhausted);

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.reason).toContain("quota exceeded");
    });

    it("returns zero remaining when used exceeds limit", () => {
      const over: QuotaWindow = {
        used: 12,
        limit: 10,
        unit: "calls",
      };

      const result = checkQuota(over);

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it("allows fresh window with zero usage", () => {
      const fresh: QuotaWindow = {
        used: 0,
        limit: 100,
        unit: "requests",
      };

      const result = checkQuota(fresh, 5);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(100);
      expect(result.reason).toContain("within quota");
    });
  });
});
