/**
 * FieldAuthority contract tests (Wave A PR-A / PX-111, closes PX-106).
 *
 * buildFieldAuthority is the single ranked field map documentProcessor now
 * feeds to finding hygiene, deterministic validation, ATTR, and persist.
 * These tests pin the rank order and the two contracts called out in the
 * PR-A ticket: a wrong-but-confident Gemini value never survives over
 * grounded text-layer evidence, and a Pump-class assetId sourced only from
 * roiSpatial (never Gemini/ensemble/text-layer) is enough to satisfy a
 * required-field deterministic rule — the JSR-R002-style contract that
 * previously only respected Gemini ∪ ensemble ∪ text-layer, not roiSpatial.
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  buildFieldAuthority,
  FIELD_AUTHORITY_RANK_LOW_TO_HIGH,
  type FieldAuthorityFieldMap,
} from "../../services/fieldAuthority";
import { runDeterministicValidation } from "../../services/validation/goldSpecBridge";
import type { GoldSpec } from "../../services/analyzer";

function field(
  value: string,
  confidence = 90,
  pageNumber = 1
): { value: string; confidence: number; pageNumber: number } {
  return { value, confidence, pageNumber };
}

describe("buildFieldAuthority rank order (PX-111)", () => {
  it("ranks nonempty text-layer > roiSpatial/field-vote > ensemble > Gemini", () => {
    expect(FIELD_AUTHORITY_RANK_LOW_TO_HIGH).toEqual([
      "gemini",
      "ensemble",
      "roiSpatial",
      "textLayer",
    ]);
  });

  it("text-layer wins over every other nonempty source for the same field", () => {
    const authority = buildFieldAuthority({
      gemini: { assetId: field("GEMINI-GUESS") },
      ensemble: { assetId: field("ENSEMBLE-GUESS") },
      roiSpatial: { assetId: field("ROI-GUESS") },
      textLayer: { assetId: field("TEXTLAYER-TRUTH") },
    });
    expect(authority.fields.assetId.value).toBe("TEXTLAYER-TRUTH");
  });

  it("roiSpatial/field-vote wins over ensemble/Gemini when text-layer is silent", () => {
    const authority = buildFieldAuthority({
      gemini: { assetId: field("GEMINI-GUESS") },
      ensemble: { assetId: field("ENSEMBLE-GUESS") },
      roiSpatial: { assetId: field("ROI-TRUTH") },
    });
    expect(authority.fields.assetId.value).toBe("ROI-TRUTH");
  });

  it("ensemble wins over Gemini when text-layer/roiSpatial are silent", () => {
    const authority = buildFieldAuthority({
      gemini: { assetId: field("GEMINI-GUESS") },
      ensemble: { assetId: field("ENSEMBLE-TRUTH") },
    });
    expect(authority.fields.assetId.value).toBe("ENSEMBLE-TRUTH");
  });

  it("falls back to Gemini as last resort when no other source has a value", () => {
    const authority = buildFieldAuthority({
      gemini: { assetId: field("GEMINI-ONLY") },
    });
    expect(authority.fields.assetId.value).toBe("GEMINI-ONLY");
  });

  it("a high-confidence-but-wrong Gemini value never survives a nonempty text-layer value — this is a ranked override, not a confidence tie-break", () => {
    const authority = buildFieldAuthority({
      gemini: { assetId: field("WRONG-BUT-CONFIDENT", 100) },
      textLayer: { assetId: field("JT99XYZ", 60) },
    });
    expect(authority.fields.assetId.value).toBe("JT99XYZ");
  });
});

describe("buildFieldAuthority empty-stripping and aliasing (PX-111)", () => {
  it("strips empty-string values per source before ranking, so a blank higher-rank field never masks a real lower-rank one", () => {
    const authority = buildFieldAuthority({
      gemini: { assetId: field("GEMINI-VALUE") },
      textLayer: { assetId: field("") },
    });
    expect(authority.fields.assetId.value).toBe("GEMINI-VALUE");
  });

  it("drops a field entirely when every source is empty or absent", () => {
    const authority = buildFieldAuthority({
      gemini: { assetId: field("   ") },
      ensemble: {},
    });
    expect(authority.fields.assetId).toBeUndefined();
  });

  it("applies canonical aliasing (jobNumber↔jobReference, assetId↔serialNumber, date↔dateOfService) exactly once on the merged result", () => {
    const authority = buildFieldAuthority({
      textLayer: {
        assetId: field("ASSET-1"),
        jobNumber: field("JOB-1"),
        date: field("21/07/2026"),
      },
    });
    expect(authority.fields.serialNumber?.value).toBe("ASSET-1");
    expect(authority.fields.jobReference?.value).toBe("JOB-1");
    expect(authority.fields.dateOfService?.value).toBe("21/07/2026");
  });

  it("builds the map from independently-missing sources without throwing", () => {
    const authority = buildFieldAuthority({});
    expect(authority.fields).toEqual({});
  });
});

describe("Pump-class contract: authority assetId satisfies a required-field rule even when only roiSpatial has it (PX-112)", () => {
  const pumpSpec: GoldSpec = {
    name: "pump-job-summary",
    version: "1.0.0",
    rules: [
      {
        id: "R002",
        field: "assetId",
        type: "presence",
        required: true,
        description: "Asset ID is required on a Pump Job Summary.",
      },
    ],
  };

  it("emits a missing-required finding when NO source (incl. roiSpatial) has assetId", () => {
    const authority = buildFieldAuthority({
      gemini: {},
      ensemble: {},
      roiSpatial: {},
      textLayer: {},
    });
    const result = runDeterministicValidation({
      spec: pumpSpec,
      extractedFields: authority.fields,
    });
    expect(result.passed).toBe(false);
    expect(result.findings.some(f => f.ruleId === "R002")).toBe(true);
  });

  it("does NOT emit R002 when only roiSpatial (UI-visible ROI box extraction) has assetId — validation must see what the UI shows", () => {
    const authority = buildFieldAuthority({
      gemini: {},
      ensemble: {},
      roiSpatial: { assetId: field("PUMP-4471", 72) },
      textLayer: {},
    });
    const result = runDeterministicValidation({
      spec: pumpSpec,
      extractedFields: authority.fields,
    });
    expect(result.passed).toBe(true);
    expect(result.findings.some(f => f.ruleId === "R002")).toBe(false);
  });
});

describe("documentProcessor wiring (source contract)", () => {
  const dpPath = path.resolve(
    __dirname,
    "../../services/documentProcessor.ts"
  );
  const dp = fs.readFileSync(dpPath, "utf-8");

  it("imports buildFieldAuthority from the fieldAuthority module", () => {
    expect(dp).toContain(
      'import { buildFieldAuthority, type FieldAuthority } from "./fieldAuthority";'
    );
  });

  it("builds fieldAuthority once and feeds finding hygiene, ATTR, deterministic validation, and persist from it", () => {
    const authorityIdx = dp.indexOf("fieldAuthority = buildFieldAuthority({");
    const hygieneIdx = dp.indexOf("...fieldAuthority.fields,");
    const attrIdx = dp.indexOf("const attrExtractedFields = fieldAuthority.fields;");
    const validationIdx = dp.indexOf(
      "const extractedForValidation = fieldAuthority.fields;"
    );
    const persistIdx = dp.indexOf("let finalExtractedFields = fieldAuthority.fields;");

    expect(authorityIdx).toBeGreaterThan(-1);
    expect(hygieneIdx).toBeGreaterThan(authorityIdx);
    expect(attrIdx).toBeGreaterThan(hygieneIdx);
    expect(validationIdx).toBeGreaterThan(attrIdx);
    expect(persistIdx).toBeGreaterThan(validationIdx);
  });

  it("never re-derives a bespoke Gemini ∪ ensemble ∪ text-layer merge outside FieldAuthority", () => {
    expect(dp).not.toContain("mergeExtractedFields(");
    expect(dp).not.toContain("stripEmptyExtractedFields(");
    expect(dp).not.toContain("backfillAuthoritativeExtractedFields(");
  });
});

// Compile-time shape check only — asserts FieldAuthorityFieldMap is the
// same shape produced by every ranked source (no runtime assertions needed).
const _typeCheck: FieldAuthorityFieldMap = { assetId: field("x") };
void _typeCheck;
