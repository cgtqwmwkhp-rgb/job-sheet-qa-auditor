/**
 * Attribution SLO Contract Tests (Wave-4 A3)
 *
 * Fixtures only — no DB. Proves honest unavailable + unattributed-rate gate.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("Attribution SLO Contract (Wave-4 A3)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    delete process.env.FEATURE_ATTRIBUTION_SLO;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
    vi.resetModules();
  });

  describe("feature flag", () => {
    it("is disabled by default when FEATURE_ATTRIBUTION_SLO unset", async () => {
      const { isAttributionSloEnabled } = await import(
        "../../services/attributionSlo"
      );
      expect(isAttributionSloEnabled()).toBe(false);
    });

    it("is enabled when FEATURE_ATTRIBUTION_SLO=true", async () => {
      process.env.FEATURE_ATTRIBUTION_SLO = "true";
      const { isAttributionSloEnabled } = await import(
        "../../services/attributionSlo"
      );
      expect(isAttributionSloEnabled()).toBe(true);
    });
  });

  describe("evaluateAttributionSlo", () => {
    it("returns unavailable when sheet count is below readiness", async () => {
      const { evaluateAttributionSlo } = await import(
        "../../services/attributionSlo"
      );
      const result = evaluateAttributionSlo(
        { totalSheets: 10, unattributedSheets: 0 },
        { minSheetsRequired: 50, maxUnattributedRate: 0.05 }
      );
      expect(result.status).toBe("unavailable");
      expect(result.metrics.measurementReady).toBe(false);
      expect(result.metrics.unattributedRate).toBeNull();
      expect(result.metrics.provisionalUnattributedRate).toBe(0);
    });

    it("passes when unattributed rate is under target", async () => {
      const { evaluateAttributionSlo } = await import(
        "../../services/attributionSlo"
      );
      const result = evaluateAttributionSlo(
        { totalSheets: 100, unattributedSheets: 3 },
        { minSheetsRequired: 50, maxUnattributedRate: 0.05 }
      );
      expect(result.status).toBe("pass");
      expect(result.metrics.unattributedRate).toBe(0.03);
      expect(result.blockers).toEqual([]);
    });

    it("fails when unattributed rate exceeds target", async () => {
      const { evaluateAttributionSlo } = await import(
        "../../services/attributionSlo"
      );
      const result = evaluateAttributionSlo(
        { totalSheets: 100, unattributedSheets: 12 },
        { minSheetsRequired: 50, maxUnattributedRate: 0.05 }
      );
      expect(result.status).toBe("fail");
      expect(result.metrics.unattributedRate).toBe(0.12);
      expect(result.blockers[0]).toMatch(/exceeds max/i);
    });
  });
});
