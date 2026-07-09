/**
 * Field Correction Diff Contract Tests (Phase 3.x)
 *
 * Fixtures only — no DB, documentProcessor, or live AI.
 * Verifies feature flag default-off and pure field diff rules.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  FEATURE_FLAG,
  isFieldDiffEnabled,
  diffFields,
  type FieldDiff,
} from "../../services/fieldDiff";

describe("Field Diff Contract (Phase 3.x)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env[FEATURE_FLAG];
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("feature flag", () => {
    it("is disabled by default when FEATURE_FIELD_DIFF unset", () => {
      expect(isFieldDiffEnabled()).toBe(false);
    });

    it("is enabled only when FEATURE_FIELD_DIFF=true", () => {
      process.env[FEATURE_FLAG] = "true";
      expect(isFieldDiffEnabled()).toBe(true);
    });

    it("remains disabled for non-true values", () => {
      process.env[FEATURE_FLAG] = "1";
      expect(isFieldDiffEnabled()).toBe(false);
      process.env[FEATURE_FLAG] = "false";
      expect(isFieldDiffEnabled()).toBe(false);
    });
  });

  describe("diffFields", () => {
    it("returns empty array for two empty maps", () => {
      expect(diffFields({}, {})).toEqual([]);
    });

    it("reports unchanged fields when trimmed values match", () => {
      const result = diffFields(
        { assetTag: "GEN-001", site: "North Yard" },
        { assetTag: "  GEN-001  ", site: "North Yard" }
      );

      expect(result).toEqual<FieldDiff[]>([
        {
          fieldKey: "assetTag",
          before: "GEN-001",
          after: "  GEN-001  ",
          changed: false,
        },
        {
          fieldKey: "site",
          before: "North Yard",
          after: "North Yard",
          changed: false,
        },
      ]);
    });

    it("reports changed fields when trimmed values differ", () => {
      const result = diffFields(
        { assetTag: "GEN-001", status: "pass" },
        { assetTag: "GEN-002", status: "pass" }
      );

      expect(result).toEqual<FieldDiff[]>([
        {
          fieldKey: "assetTag",
          before: "GEN-001",
          after: "GEN-002",
          changed: true,
        },
        {
          fieldKey: "status",
          before: "pass",
          after: "pass",
          changed: false,
        },
      ]);
    });

    it("includes keys present only in before map", () => {
      const result = diffFields({ removed: "old value" }, {});

      expect(result).toEqual<FieldDiff[]>([
        {
          fieldKey: "removed",
          before: "old value",
          after: "",
          changed: true,
        },
      ]);
    });

    it("includes keys present only in after map", () => {
      const result = diffFields({}, { added: "new value" });

      expect(result).toEqual<FieldDiff[]>([
        {
          fieldKey: "added",
          before: "",
          after: "new value",
          changed: true,
        },
      ]);
    });

    it("treats whitespace-only values as empty after trim", () => {
      const result = diffFields({ notes: "   " }, { notes: "" });

      expect(result).toEqual<FieldDiff[]>([
        {
          fieldKey: "notes",
          before: "   ",
          after: "",
          changed: false,
        },
      ]);
    });

    it("unions keys from both maps in sorted order", () => {
      const result = diffFields({ zebra: "z", alpha: "a" }, { beta: "b" });

      expect(result.map(d => d.fieldKey)).toEqual(["alpha", "beta", "zebra"]);
    });
  });
});
