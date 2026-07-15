/**
 * Wave-7 Template Memory contract tests (no live DB).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  applyValueMemoryToFields,
  filterFindingsWithRuleMemory,
  memoryKindForReason,
  canAutoShadow,
  TEMPLATE_MEMORY_AGREE_THRESHOLD,
  isTemplateMemoryCaptureEnabled,
  isTemplateMemoryApplyEnabled,
} from "../../services/templateMemory";
import { cohortForIndex } from "../../services/templateMemory/learningCurve";

describe("templateMemory types / product rules", () => {
  it("maps TrainLoop taxonomy to memory kinds (hybrid-by-type)", () => {
    expect(memoryKindForReason("ocr_misread", "field_correction")).toBe(
      "value_alias"
    );
    expect(memoryKindForReason("rule_wrong", "override")).toBe("suppress_rule");
    expect(memoryKindForReason("roi_misaligned", "override")).toBe("roi_adjust");
    expect(memoryKindForReason("template_mismatch", "override")).toBe(
      "spec_gap"
    );
    expect(memoryKindForReason("true_defect", "override")).toBeNull();
  });

  it("only auto-shadows OCR/rule kinds — never ROI/template/true_defect", () => {
    expect(canAutoShadow("suppress_rule")).toBe(true);
    expect(canAutoShadow("value_alias")).toBe(true);
    expect(canAutoShadow("ocr_hint")).toBe(true);
    expect(canAutoShadow("roi_adjust")).toBe(false);
    expect(canAutoShadow("spec_gap")).toBe(false);
  });

  it("agree threshold is 3", () => {
    expect(TEMPLATE_MEMORY_AGREE_THRESHOLD).toBe(3);
  });
});

describe("templateMemory flags", () => {
  const prevCapture = process.env.FEATURE_TEMPLATE_MEMORY_CAPTURE;
  const prevApply = process.env.FEATURE_TEMPLATE_MEMORY_APPLY;

  afterEach(() => {
    if (prevCapture === undefined) {
      delete process.env.FEATURE_TEMPLATE_MEMORY_CAPTURE;
    } else {
      process.env.FEATURE_TEMPLATE_MEMORY_CAPTURE = prevCapture;
    }
    if (prevApply === undefined) {
      delete process.env.FEATURE_TEMPLATE_MEMORY_APPLY;
    } else {
      process.env.FEATURE_TEMPLATE_MEMORY_APPLY = prevApply;
    }
  });

  it("defaults off when unset", () => {
    delete process.env.FEATURE_TEMPLATE_MEMORY_CAPTURE;
    delete process.env.FEATURE_TEMPLATE_MEMORY_APPLY;
    expect(isTemplateMemoryCaptureEnabled()).toBe(false);
    expect(isTemplateMemoryApplyEnabled()).toBe(false);
  });

  it("enables only when env === true", () => {
    process.env.FEATURE_TEMPLATE_MEMORY_CAPTURE = "true";
    process.env.FEATURE_TEMPLATE_MEMORY_APPLY = "true";
    expect(isTemplateMemoryCaptureEnabled()).toBe(true);
    expect(isTemplateMemoryApplyEnabled()).toBe(true);
  });
});

describe("templateMemory apply hooks", () => {
  const memory = [
    {
      id: 1,
      templateId: 9,
      templateVersionId: 12,
      memoryKind: "value_alias" as const,
      fieldKey: "site_name",
      ruleId: "",
      payloadJson: { from: "Acme", to: "ACME Ltd" },
      payloadHash: "h1",
      evidenceCount: 3,
      agreeCount: 3,
      disagreeCount: 0,
      promotionStatus: "shadow" as const,
      promotedToVersionId: null,
      createdFromCorrectionId: 1,
      lastEvidenceAt: null,
      createdBy: 1,
      approvedBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 2,
      templateId: 9,
      templateVersionId: 12,
      memoryKind: "suppress_rule" as const,
      fieldKey: "date",
      ruleId: "JSR-C060",
      payloadJson: { ruleId: "JSR-C060", action: "soft_suppress" },
      payloadHash: "h2",
      evidenceCount: 3,
      agreeCount: 3,
      disagreeCount: 0,
      promotionStatus: "approved" as const,
      promotedToVersionId: null,
      createdFromCorrectionId: 2,
      lastEvidenceAt: null,
      createdBy: 1,
      approvedBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  it("H2 aliases matching extracted field values", () => {
    const { fields, applied } = applyValueMemoryToFields(
      [
        { field: "site_name", value: "Acme" },
        { field: "other", value: "x" },
      ],
      memory
    );
    expect(fields[0].value).toBe("ACME Ltd");
    expect(applied).toHaveLength(1);
    expect(applied[0].effect).toContain("alias:");
  });

  it("H4 soft-suppresses non-S0 findings by ruleId", () => {
    const { findings, applied } = filterFindingsWithRuleMemory(
      [
        { ruleId: "JSR-C060", severity: "S2" },
        { ruleId: "JSR-C060", severity: "S0" },
        { ruleId: "OTHER", severity: "S2" },
      ],
      memory
    );
    expect(findings).toHaveLength(2);
    expect(findings.some(f => f.severity === "S0")).toBe(true);
    expect(applied).toHaveLength(1);
    expect(applied[0].effect).toBe("soft_suppress_finding");
  });
});

describe("learning curve cohorts", () => {
  it("buckets audits into 1-50 / 51-100 / 101-200 / 201+", () => {
    expect(cohortForIndex(1)).toBe("1-50");
    expect(cohortForIndex(50)).toBe("1-50");
    expect(cohortForIndex(51)).toBe("51-100");
    expect(cohortForIndex(100)).toBe("51-100");
    expect(cohortForIndex(101)).toBe("101-200");
    expect(cohortForIndex(200)).toBe("101-200");
    expect(cohortForIndex(201)).toBe("201+");
  });
});

describe("anti-theater copy invariants", () => {
  beforeEach(() => {
    // ensure pane source does not claim taught without artifact
  });

  it("ReviewWorkstationPane never toasts bare 'taught' / 'saved to template memory'", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const pane = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../../client/src/components/review/ReviewWorkstationPane.tsx"
      ),
      "utf8"
    );
    expect(pane.toLowerCase()).not.toMatch(/taught the template/);
    expect(pane.toLowerCase()).not.toMatch(/saved to template memory/);
    expect(pane).toContain("Value updated on this finding");
    expect(pane).toContain("Fix displayed value");
  });
});
