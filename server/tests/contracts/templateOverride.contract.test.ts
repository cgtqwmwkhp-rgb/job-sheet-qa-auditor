/**
 * Template Override Contract Tests
 *
 * PR-G: Tests for template override mechanism.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  setTemplateOverride,
  getTemplateOverride,
  hasTemplateOverride,
  clearTemplateOverride,
  listOverrides,
  getOverrideCount,
  getOverridesByConfidence,
  resetOverrideStore,
} from "../../services/templateOverride";
import {
  createTemplate,
  uploadTemplateVersion,
  activateVersion,
  resetRegistry,
} from "../../services/templateRegistry";
import { createStudioStarterSpec } from "../../services/templateStudio/starterDraft";
import { createStudioStarterSelection } from "../../services/templateStudio/starterDraft";
import { createStudioStarterRoi } from "../../services/templateStudio/starterDraft";

function seedActiveVersion(slug: string, name: string) {
  const template = createTemplate({
    templateId: slug,
    name,
    createdBy: 1,
  });
  const version = uploadTemplateVersion({
    templateId: template.id,
    version: "1.0.0",
    specJson: createStudioStarterSpec(name),
    selectionConfigJson: createStudioStarterSelection([slug]),
    roiJson: createStudioStarterRoi(),
    createdBy: 1,
  });
  activateVersion(version.id, { skipFixtures: true, skipCollisionCheck: true });
  return { template, version };
}

describe("Template Override - PR-G Contract Tests", () => {
  beforeEach(() => {
    resetOverrideStore();
    resetRegistry();
  });

  describe("Override Creation", () => {
    it("should create a template override", () => {
      const { template, version } = seedActiveVersion("ov-a", "Override A");
      const result = setTemplateOverride(
        1,
        template.id,
        version.id,
        "LOW",
        0.35,
        "Document matched multiple templates",
        1
      );

      expect(result.success).toBe(true);
      expect(result.override).toBeDefined();
      expect(result.override!.jobSheetId).toBe(1);
      expect(result.override!.templateId).toBe(template.id);
      expect(result.override!.versionId).toBe(version.id);
    });

    it("should require a reason of at least 5 characters", () => {
      const { template, version } = seedActiveVersion("ov-b", "Override B");
      const result = setTemplateOverride(
        1,
        template.id,
        version.id,
        "LOW",
        0.35,
        "abc",
        1
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("reason");
    });

    it("should reject non-existent template/version", () => {
      const result = setTemplateOverride(
        1,
        9999,
        9999,
        "LOW",
        0.35,
        "Valid reason text",
        1
      );
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/not found/i);
    });

    it("should store original confidence and score", () => {
      const { template, version } = seedActiveVersion("ov-c", "Override C");
      const result = setTemplateOverride(
        1,
        template.id,
        version.id,
        "MEDIUM",
        0.65,
        "Ambiguous selection resolved",
        1
      );

      expect(result.override!.originalConfidence).toBe("MEDIUM");
      expect(result.override!.originalTopScore).toBe(0.65);
    });

    it("should update existing override for same job sheet", () => {
      const a = seedActiveVersion("ov-d1", "Override D1");
      const b = seedActiveVersion("ov-d2", "Override D2");
      setTemplateOverride(
        1,
        a.template.id,
        a.version.id,
        "LOW",
        0.35,
        "First override",
        1
      );
      setTemplateOverride(
        1,
        b.template.id,
        b.version.id,
        "MEDIUM",
        0.55,
        "Updated override",
        2
      );

      const override = getTemplateOverride(1);

      expect(override!.templateId).toBe(b.template.id);
      expect(override!.versionId).toBe(b.version.id);
      expect(override!.createdBy).toBe(2);
    });
  });

  describe("Override Retrieval", () => {
    it("should retrieve override by job sheet ID", () => {
      const { template, version } = seedActiveVersion("ov-e", "Override E");
      setTemplateOverride(
        1,
        template.id,
        version.id,
        "LOW",
        0.35,
        "Test override",
        1
      );

      const override = getTemplateOverride(1);

      expect(override).not.toBeNull();
      expect(override!.templateId).toBe(template.id);
    });

    it("should return null for non-existent override", () => {
      const override = getTemplateOverride(999);

      expect(override).toBeNull();
    });

    it("should check if override exists", () => {
      const { template, version } = seedActiveVersion("ov-f", "Override F");
      expect(hasTemplateOverride(1)).toBe(false);

      setTemplateOverride(
        1,
        template.id,
        version.id,
        "LOW",
        0.35,
        "Test override",
        1
      );

      expect(hasTemplateOverride(1)).toBe(true);
    });
  });

  describe("Override Removal", () => {
    it("should clear override", () => {
      const { template, version } = seedActiveVersion("ov-g", "Override G");
      setTemplateOverride(
        1,
        template.id,
        version.id,
        "LOW",
        0.35,
        "Test override",
        1
      );
      expect(hasTemplateOverride(1)).toBe(true);

      clearTemplateOverride(1);

      expect(hasTemplateOverride(1)).toBe(false);
    });
  });

  describe("Override Listing", () => {
    it("should list overrides", () => {
      const a = seedActiveVersion("ov-h1", "H1");
      const b = seedActiveVersion("ov-h2", "H2");
      setTemplateOverride(
        1,
        a.template.id,
        a.version.id,
        "LOW",
        0.3,
        "Reason one",
        1
      );
      setTemplateOverride(
        2,
        b.template.id,
        b.version.id,
        "HIGH",
        0.9,
        "Reason two",
        1
      );

      expect(listOverrides()).toHaveLength(2);
      expect(getOverrideCount()).toBe(2);
    });

    it("should group by confidence", () => {
      const a = seedActiveVersion("ov-i1", "I1");
      const b = seedActiveVersion("ov-i2", "I2");
      const c = seedActiveVersion("ov-i3", "I3");
      const d = seedActiveVersion("ov-i4", "I4");
      setTemplateOverride(
        1,
        a.template.id,
        a.version.id,
        "LOW",
        0.2,
        "Reason aaa",
        1
      );
      setTemplateOverride(
        2,
        b.template.id,
        b.version.id,
        "LOW",
        0.3,
        "Reason bbb",
        1
      );
      setTemplateOverride(
        3,
        c.template.id,
        c.version.id,
        "MEDIUM",
        0.5,
        "Reason ccc",
        1
      );
      setTemplateOverride(
        4,
        d.template.id,
        d.version.id,
        "HIGH",
        0.9,
        "Reason ddd",
        1
      );

      const byConfidence = getOverridesByConfidence();

      expect(byConfidence.LOW).toBe(2);
      expect(byConfidence.MEDIUM).toBe(1);
      expect(byConfidence.HIGH).toBe(1);
    });
  });

  describe("Override for LOW/Ambiguous Selection", () => {
    it("should be used when selection confidence is LOW", () => {
      const { template, version } = seedActiveVersion("ov-j", "J");
      const overrideResult = setTemplateOverride(
        1,
        template.id,
        version.id,
        "LOW",
        0.25,
        "Forced after LOW confidence",
        1
      );

      expect(overrideResult.success).toBe(true);
      expect(hasTemplateOverride(1)).toBe(true);
    });

    it("should be used when selection is ambiguous (MEDIUM with close runner-up)", () => {
      const { template, version } = seedActiveVersion("ov-k", "K");
      const overrideResult = setTemplateOverride(
        1,
        template.id,
        version.id,
        "MEDIUM",
        0.55,
        "Ambiguous MEDIUM selection",
        1
      );

      expect(overrideResult.success).toBe(true);
    });
  });
});
