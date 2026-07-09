/**
 * Promotion Score Contract Tests (Phase 3.x)
 *
 * Fixtures only — no CI, deploy hooks, or network I/O.
 * Verifies feature flag default-off, scoring penalties, and ready threshold.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { PromotionSignals } from "../../services/promotionScore/types";

const PERFECT_SIGNALS: PromotionSignals = {
  ece: 0.05,
  overturnRate: 0.1,
  shadowAgreementRate: 0.95,
  smokePassRate: 1,
};

describe("Promotion Score Contract (Phase 3.x)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    delete process.env.FEATURE_PROMOTION_SCORE;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
    vi.resetModules();
  });

  describe("feature flag", () => {
    it("is disabled by default when FEATURE_PROMOTION_SCORE unset", async () => {
      const { isPromotionScoreEnabled } = await import(
        "../../services/promotionScore"
      );
      expect(isPromotionScoreEnabled()).toBe(false);
    });

    it("is enabled when FEATURE_PROMOTION_SCORE=true", async () => {
      process.env.FEATURE_PROMOTION_SCORE = "true";
      const { isPromotionScoreEnabled } = await import(
        "../../services/promotionScore"
      );
      expect(isPromotionScoreEnabled()).toBe(true);
    });

    it("remains disabled for non-true values", async () => {
      process.env.FEATURE_PROMOTION_SCORE = "1";
      const { isPromotionScoreEnabled } = await import(
        "../../services/promotionScore"
      );
      expect(isPromotionScoreEnabled()).toBe(false);
      process.env.FEATURE_PROMOTION_SCORE = "false";
      expect(isPromotionScoreEnabled()).toBe(false);
    });
  });

  describe("scorePromotion", () => {
    it("is ready with score 100 for perfect signals", async () => {
      const { scorePromotion } = await import("../../services/promotionScore");

      const result = scorePromotion(PERFECT_SIGNALS);

      expect(result.score).toBe(100);
      expect(result.ready).toBe(true);
      expect(result.reasons).toEqual([]);
    });

    it("is ready with score 100 when no signals are provided", async () => {
      const { scorePromotion } = await import("../../services/promotionScore");

      const result = scorePromotion({});

      expect(result.score).toBe(100);
      expect(result.ready).toBe(true);
      expect(result.reasons).toEqual([]);
    });

    it("applies ECE penalty when ece exceeds 0.1", async () => {
      const { scorePromotion } = await import("../../services/promotionScore");

      const result = scorePromotion({ ece: 0.15 });

      expect(result.score).toBe(80);
      expect(result.reasons).toContain("ECE 0.15 exceeds threshold 0.1 (-20)");
    });

    it("applies overturn rate penalty when rate exceeds 0.15", async () => {
      const { scorePromotion } = await import("../../services/promotionScore");

      const result = scorePromotion({ overturnRate: 0.2 });

      expect(result.score).toBe(75);
      expect(result.reasons).toContain(
        "Overturn rate 0.2 exceeds threshold 0.15 (-25)"
      );
    });

    it("applies shadow agreement penalty when rate is below 0.9", async () => {
      const { scorePromotion } = await import("../../services/promotionScore");

      const result = scorePromotion({ shadowAgreementRate: 0.85 });

      expect(result.score).toBe(85);
      expect(result.reasons).toContain(
        "Shadow agreement rate 0.85 below threshold 0.9 (-15)"
      );
    });

    it("applies smoke pass rate penalty when rate is below 1", async () => {
      const { scorePromotion } = await import("../../services/promotionScore");

      const result = scorePromotion({ smokePassRate: 0.9 });

      expect(result.score).toBe(70);
      expect(result.reasons).toContain(
        "Smoke pass rate 0.9 below threshold 1 (-30)"
      );
    });

    it("accumulates all penalties for failing signals", async () => {
      const { scorePromotion } = await import("../../services/promotionScore");

      const result = scorePromotion({
        ece: 0.2,
        overturnRate: 0.25,
        shadowAgreementRate: 0.8,
        smokePassRate: 0.5,
      });

      expect(result.score).toBe(10);
      expect(result.ready).toBe(false);
      expect(result.reasons).toHaveLength(4);
    });

    it("does not apply penalties at exact threshold boundaries", async () => {
      const { scorePromotion } = await import("../../services/promotionScore");

      const result = scorePromotion({
        ece: 0.1,
        overturnRate: 0.15,
        shadowAgreementRate: 0.9,
        smokePassRate: 1,
      });

      expect(result.score).toBe(100);
      expect(result.ready).toBe(true);
      expect(result.reasons).toEqual([]);
    });

    it("respects custom readyThreshold", async () => {
      const { scorePromotion } = await import("../../services/promotionScore");

      const borderline = scorePromotion({ smokePassRate: 0.9 });
      expect(borderline.score).toBe(70);
      expect(borderline.ready).toBe(true);

      const strict = scorePromotion(
        { smokePassRate: 0.9 },
        { readyThreshold: 75 }
      );
      expect(strict.score).toBe(70);
      expect(strict.ready).toBe(false);

      const lenient = scorePromotion(
        { smokePassRate: 0.9 },
        { readyThreshold: 65 }
      );
      expect(lenient.score).toBe(70);
      expect(lenient.ready).toBe(true);
    });
  });
});
