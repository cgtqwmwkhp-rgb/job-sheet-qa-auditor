/**
 * Golden-set growth Contract Tests (Phase 2.8)
 *
 * Fixtures only — no live DB, OCR, or network.
 * Verifies feature flag default-off, deterministic fixture ids,
 * field mapping, and empty snippet rejection.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { CorrectionInput } from "../../services/goldenGrowth/types";

describe("Golden Growth Contract (Phase 2.8)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    delete process.env.FEATURE_GOLDEN_GROWTH;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
    vi.resetModules();
  });

  const baseCorrection: CorrectionInput = {
    jobSheetId: "js-48291",
    fieldKey: "Job Number",
    normalisedSnippet: "Job Number: JS-48291",
    correctedValue: "JS-48291",
    severity: "S1",
  };

  describe("feature flag", () => {
    it("is disabled by default when FEATURE_GOLDEN_GROWTH unset", async () => {
      const { isGoldenGrowthEnabled } = await import(
        "../../services/goldenGrowth"
      );
      expect(isGoldenGrowthEnabled()).toBe(false);
    });

    it("is enabled when FEATURE_GOLDEN_GROWTH=true", async () => {
      process.env.FEATURE_GOLDEN_GROWTH = "true";
      const { isGoldenGrowthEnabled } = await import(
        "../../services/goldenGrowth"
      );
      expect(isGoldenGrowthEnabled()).toBe(true);
    });
  });

  describe("toGoldenFixture", () => {
    it("maps correction fields to golden fixture candidate", async () => {
      const { toGoldenFixture } = await import("../../services/goldenGrowth");

      const fixture = toGoldenFixture(baseCorrection);

      expect(fixture.sourceJobSheetId).toBe("js-48291");
      expect(fixture.fieldKey).toBe("Job Number");
      expect(fixture.expectedValue).toBe("JS-48291");
      expect(fixture.snippet).toBe("Job Number: JS-48291");
      expect(fixture.id).toMatch(/^golden-[a-f0-9]{16}$/);
      expect(fixture.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it("produces deterministic id for same jobSheetId, fieldKey, and snippet", async () => {
      const { toGoldenFixture } = await import("../../services/goldenGrowth");

      const first = toGoldenFixture(baseCorrection);
      const second = toGoldenFixture({
        ...baseCorrection,
        correctedValue: "DIFFERENT",
        severity: "S0",
      });

      expect(first.id).toBe(second.id);
      expect(first.createdAt).toBe(second.createdAt);
    });

    it("produces different ids when snippet differs", async () => {
      const { toGoldenFixture } = await import("../../services/goldenGrowth");

      const first = toGoldenFixture(baseCorrection);
      const second = toGoldenFixture({
        ...baseCorrection,
        normalisedSnippet: "Job Number: JS-99999",
      });

      expect(first.id).not.toBe(second.id);
    });

    it("rejects empty normalisedSnippet", async () => {
      const { toGoldenFixture, GoldenGrowthValidationError } = await import(
        "../../services/goldenGrowth"
      );

      expect(() =>
        toGoldenFixture({ ...baseCorrection, normalisedSnippet: "" })
      ).toThrow(GoldenGrowthValidationError);

      expect(() =>
        toGoldenFixture({ ...baseCorrection, normalisedSnippet: "   " })
      ).toThrow(/non-empty/);
    });
  });
});
