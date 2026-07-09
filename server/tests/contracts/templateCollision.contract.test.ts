/**
 * Template Collision Governance Contract Tests (Phase 3.4)
 *
 * Fixtures only — no DB, templateRegistry, or live AI.
 * Verifies feature flag default-off and pure fingerprint collision rules.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  FEATURE_FLAG,
  isTemplateCollisionEnabled,
  checkCollision,
  type TemplateFingerprint,
} from "../../services/templateCollision";

describe("Template Collision Contract (Phase 3.4)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env[FEATURE_FLAG];
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("feature flag", () => {
    it("is disabled by default when FEATURE_TEMPLATE_COLLISION unset", () => {
      expect(isTemplateCollisionEnabled()).toBe(false);
    });

    it("is enabled only when FEATURE_TEMPLATE_COLLISION=true", () => {
      process.env[FEATURE_FLAG] = "true";
      expect(isTemplateCollisionEnabled()).toBe(true);
    });

    it("remains disabled for non-true values", () => {
      process.env[FEATURE_FLAG] = "1";
      expect(isTemplateCollisionEnabled()).toBe(false);
      process.env[FEATURE_FLAG] = "false";
      expect(isTemplateCollisionEnabled()).toBe(false);
    });
  });

  describe("checkCollision", () => {
    const existing: TemplateFingerprint[] = [
      {
        templateId: "tmpl-a",
        fingerprint: "fp-generator-service-v1",
        version: "1.0.0",
      },
      {
        templateId: "tmpl-b",
        fingerprint: "fp-fire-alarm-panel",
        version: "2.1.0",
      },
    ];

    it("does not collide when fingerprint is unique", () => {
      const result = checkCollision(
        {
          templateId: "tmpl-c",
          fingerprint: "fp-lift-inspection",
        },
        existing
      );

      expect(result).toEqual({ collides: false });
    });

    it("collides when fingerprint matches a different templateId", () => {
      const result = checkCollision(
        {
          templateId: "tmpl-c",
          fingerprint: "fp-generator-service-v1",
        },
        existing
      );

      expect(result.collides).toBe(true);
      expect(result.existingTemplateId).toBe("tmpl-a");
      expect(result.reason).toContain("tmpl-a");
    });

    it("does not collide when same templateId reuses its fingerprint", () => {
      const result = checkCollision(
        {
          templateId: "tmpl-a",
          fingerprint: "fp-generator-service-v1",
          version: "1.1.0",
        },
        existing
      );

      expect(result).toEqual({ collides: false });
    });

    it("collides for empty fingerprint with reason", () => {
      const result = checkCollision(
        {
          templateId: "tmpl-c",
          fingerprint: "",
        },
        existing
      );

      expect(result.collides).toBe(true);
      expect(result.existingTemplateId).toBeUndefined();
      expect(result.reason).toMatch(/invalid fingerprint/i);
    });

    it("collides for whitespace-only fingerprint", () => {
      const result = checkCollision(
        {
          templateId: "tmpl-c",
          fingerprint: "   ",
        },
        existing
      );

      expect(result.collides).toBe(true);
      expect(result.reason).toMatch(/invalid fingerprint/i);
    });

    it("treats trimmed fingerprints as equal", () => {
      const result = checkCollision(
        {
          templateId: "tmpl-c",
          fingerprint: "  fp-fire-alarm-panel  ",
        },
        existing
      );

      expect(result.collides).toBe(true);
      expect(result.existingTemplateId).toBe("tmpl-b");
    });

    it("does not collide against empty existing catalog", () => {
      const result = checkCollision(
        {
          templateId: "tmpl-new",
          fingerprint: "fp-unique",
        },
        []
      );

      expect(result).toEqual({ collides: false });
    });
  });
});
