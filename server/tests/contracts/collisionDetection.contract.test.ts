/**
 * Template Collision Detector Contract Tests (PR-16)
 *
 * Fixtures/mocks only — no live OCR/LLM.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  compareFingerprints,
  detectTemplateCollisions,
  detectAllTemplateCollisions,
  fingerprintFromSelectionConfig,
  jaccardSimilarity,
  normalizeTokens,
  isTokenSubset,
  formatCollisionError,
  createTemplate,
  uploadTemplateVersion,
  activateVersion,
  resetRegistry,
  listTemplateFingerprints,
  type SpecJson,
  type SelectionConfig,
} from "../../services/templateRegistry";

const baseSpec: SpecJson = {
  name: "Spec",
  version: "1.0.0",
  fields: [
    { field: "jobReference", label: "Job", type: "string", required: true },
    { field: "assetId", label: "Asset", type: "string", required: true },
    { field: "date", label: "Date", type: "date", required: true },
    {
      field: "engineerSignOff",
      label: "Sign",
      type: "boolean",
      required: true,
    },
  ],
  rules: [],
};

describe("Collision Detector - PR-16 Contract Tests", () => {
  beforeEach(() => {
    resetRegistry();
  });

  describe("token helpers", () => {
    it("normalizes and dedupes tokens", () => {
      expect(normalizeTokens([" Job ", "JOB", "sheet"])).toEqual([
        "job",
        "sheet",
      ]);
    });

    it("computes Jaccard similarity", () => {
      expect(jaccardSimilarity(["a", "b"], ["b", "c"])).toBeCloseTo(1 / 3);
      expect(jaccardSimilarity(["a", "b"], ["a", "b"])).toBe(1);
    });

    it("detects token subsets", () => {
      expect(isTokenSubset(["a", "b"], ["a", "b", "c"])).toBe(true);
      expect(isTokenSubset(["a", "x"], ["a", "b"])).toBe(false);
    });
  });

  describe("fingerprint comparison", () => {
    it("flags exact requiredTokensAll collisions", () => {
      const a = fingerprintFromSelectionConfig("tmpl-a", {
        requiredTokensAll: ["generator", "service"],
        requiredTokensAny: [],
        optionalTokens: [],
      });
      const b = fingerprintFromSelectionConfig("tmpl-b", {
        requiredTokensAll: ["service", "generator"],
        requiredTokensAny: [],
        optionalTokens: [],
      });
      const match = compareFingerprints(a, b);
      expect(match?.severity).toBe("exact");
    });

    it("flags high overlap / subset collisions", () => {
      const a = fingerprintFromSelectionConfig("tmpl-a", {
        requiredTokensAll: ["cctv", "camera", "dvr"],
        requiredTokensAny: [],
        optionalTokens: [],
      });
      const b = fingerprintFromSelectionConfig("tmpl-b", {
        requiredTokensAll: ["cctv", "camera"],
        requiredTokensAny: [],
        optionalTokens: [],
      });
      const match = compareFingerprints(a, b);
      expect(match?.severity).toBe("high");
    });

    it("returns null for distinct fingerprints", () => {
      const a = fingerprintFromSelectionConfig("tmpl-a", {
        requiredTokensAll: ["boiler", "service"],
        requiredTokensAny: ["gas"],
        optionalTokens: [],
      });
      const b = fingerprintFromSelectionConfig("tmpl-b", {
        requiredTokensAll: ["lift", "inspection"],
        requiredTokensAny: ["elevator"],
        optionalTokens: [],
      });
      expect(compareFingerprints(a, b)).toBeNull();
    });
  });

  describe("detectTemplateCollisions", () => {
    it("blocks activation when colliding with catalog", () => {
      const existing = [
        fingerprintFromSelectionConfig("existing", {
          requiredTokensAll: ["water", "treatment"],
          requiredTokensAny: [],
          optionalTokens: [],
        }),
      ];
      const candidate = fingerprintFromSelectionConfig("candidate", {
        requiredTokensAll: ["treatment", "water"],
        requiredTokensAny: [],
        optionalTokens: [],
      });
      const report = detectTemplateCollisions(candidate, existing);
      expect(report.allowed).toBe(false);
      expect(report.blocking.length).toBe(1);
      expect(formatCollisionError(report)).toContain("TEMPLATE_COLLISION");
    });

    it("allows distinct candidate", () => {
      const existing = [
        fingerprintFromSelectionConfig("existing", {
          requiredTokensAll: ["water", "treatment"],
          requiredTokensAny: [],
          optionalTokens: [],
        }),
      ];
      const candidate = fingerprintFromSelectionConfig("candidate", {
        requiredTokensAll: ["fire", "alarm"],
        requiredTokensAny: ["panel"],
        optionalTokens: [],
      });
      const report = detectTemplateCollisions(candidate, existing);
      expect(report.allowed).toBe(true);
      expect(report.blocking).toHaveLength(0);
    });
  });

  describe("catalog scan + activation gate", () => {
    it("detectAllTemplateCollisions finds pairwise blockers", () => {
      const fps = [
        fingerprintFromSelectionConfig("a", {
          requiredTokensAll: ["x", "y"],
          requiredTokensAny: [],
          optionalTokens: [],
        }),
        fingerprintFromSelectionConfig("b", {
          requiredTokensAll: ["y", "x"],
          requiredTokensAny: [],
          optionalTokens: [],
        }),
        fingerprintFromSelectionConfig("c", {
          requiredTokensAll: ["unique", "tokens"],
          requiredTokensAny: [],
          optionalTokens: [],
        }),
      ];
      const report = detectAllTemplateCollisions(fps);
      expect(report.allowed).toBe(false);
      expect(report.blocking.some(m => m.templateA === "a")).toBe(true);
    });

    it("activateVersion blocks colliding fingerprints", () => {
      const t1 = createTemplate({
        templateId: "collision-a",
        name: "A",
        createdBy: 1,
      });
      const v1 = uploadTemplateVersion({
        templateId: t1.id,
        version: "1.0.0",
        specJson: baseSpec,
        selectionConfigJson: {
          requiredTokensAll: ["shared", "fingerprint"],
          requiredTokensAny: [],
          optionalTokens: [],
        } as SelectionConfig,
        createdBy: 1,
      });
      activateVersion(v1.id, {
        skipPreconditions: true,
        skipFixtures: true,
        skipCollisionCheck: true,
      });

      const t2 = createTemplate({
        templateId: "collision-b",
        name: "B",
        createdBy: 1,
      });
      const v2 = uploadTemplateVersion({
        templateId: t2.id,
        version: "1.0.0",
        specJson: baseSpec,
        selectionConfigJson: {
          requiredTokensAll: ["fingerprint", "shared"],
          requiredTokensAny: [],
          optionalTokens: [],
        } as SelectionConfig,
        createdBy: 1,
      });

      expect(() =>
        activateVersion(v2.id, {
          skipPreconditions: true,
          skipFixtures: true,
          skipCollisionCheck: false,
        })
      ).toThrow(/TEMPLATE_COLLISION/);
    });

    it("listTemplateFingerprints returns registry fingerprints", () => {
      const t = createTemplate({
        templateId: "fp-one",
        name: "One",
        createdBy: 1,
      });
      uploadTemplateVersion({
        templateId: t.id,
        version: "1.0.0",
        specJson: baseSpec,
        selectionConfigJson: {
          requiredTokensAll: ["alpha"],
          requiredTokensAny: ["beta"],
          optionalTokens: [],
        } as SelectionConfig,
        createdBy: 1,
      });
      const fps = listTemplateFingerprints();
      expect(fps.some(f => f.templateSlug === "fp-one")).toBe(true);
    });
  });
});
