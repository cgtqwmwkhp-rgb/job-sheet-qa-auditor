/**
 * Finding hygiene + ensemble→Gemini wiring contracts.
 */

import { describe, it, expect, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  applyFindingHygiene,
  MAX_MISSING_FIELD_FINDINGS,
  isFindingHygieneEnabled,
  hasSignatureLabelEvidence,
} from "../../services/findingHygiene";
import type { Finding } from "../../services/analyzer";
import {
  formatPreExtractedHints,
  ENSEMBLE_TO_GOLDSPEC,
} from "../../services/ensembleExtraction";
import {
  ensembleExtract,
  isAssetIdShaped,
  normalizeSignatureExtractionValue,
  FIELD_DEFINITIONS,
} from "../../services/advancedExtraction";

function finding(
  partial: Partial<Finding> & Pick<Finding, "fieldName" | "reasonCode">
): Finding {
  return {
    ruleId: partial.ruleId ?? "T",
    fieldName: partial.fieldName,
    severity: partial.severity ?? "S2",
    reasonCode: partial.reasonCode,
    rawSnippet: partial.rawSnippet ?? "",
    normalisedSnippet: partial.normalisedSnippet ?? "",
    confidence: partial.confidence ?? 50,
    pageNumber: partial.pageNumber ?? 1,
    whyItMatters: partial.whyItMatters ?? "test",
    suggestedFix: partial.suggestedFix ?? "test",
  };
}

describe("findingHygiene", () => {
  afterEach(() => {
    delete process.env.FEATURE_FINDING_HYGIENE;
  });

  it("is enabled by default", () => {
    expect(isFindingHygieneEnabled()).toBe(true);
  });

  it("suppresses MISSING_FIELD when ensemble pre-extract is confident", () => {
    const findings = [
      finding({ fieldName: "jobNumber", reasonCode: "MISSING_FIELD" }),
      finding({ fieldName: "customerName", reasonCode: "MISSING_FIELD" }),
    ];
    const cleaned = applyFindingHygiene(findings, {
      preExtractedFields: {
        jobNumber: { value: "JOB-1", confidence: 85, pageNumber: 1 },
      },
      confidenceThreshold: 70,
    });
    expect(cleaned.some(f => f.fieldName === "jobNumber")).toBe(false);
    expect(cleaned.some(f => f.fieldName === "customerName")).toBe(true);
  });

  it("caps MISSING_FIELD storms", () => {
    const findings = Array.from({ length: 12 }, (_, i) =>
      finding({ fieldName: `field${i}`, reasonCode: "MISSING_FIELD" })
    );
    const cleaned = applyFindingHygiene(findings);
    const missing = cleaned.filter(f => f.reasonCode === "MISSING_FIELD");
    expect(missing.length).toBeLessThanOrEqual(MAX_MISSING_FIELD_FINDINGS);
    expect(
      cleaned.some(
        f =>
          f.fieldName === "Multiple Fields" && f.reasonCode === "LOW_CONFIDENCE"
      )
    ).toBe(true);
  });

  it("downgrades Present|assetId signature conflicts", () => {
    const findings = [
      finding({
        fieldName: "Technician Signature",
        reasonCode: "CONFLICT",
        normalisedSnippet: "Present | BN21ACO_TL",
        confidence: 60,
      }),
    ];
    const cleaned = applyFindingHygiene(findings);
    expect(cleaned).toHaveLength(1);
    expect(cleaned[0].reasonCode).toBe("LOW_CONFIDENCE");
    expect(cleaned[0].normalisedSnippet).toBe("Present");
  });

  it("downgrades Date|asset Make/Model conflicts", () => {
    const findings = [
      finding({
        fieldName: "Date",
        reasonCode: "CONFLICT",
        normalisedSnippet: "2024-09-02 | BN21ACO_TL Make/Model",
        confidence: 69,
      }),
    ];
    const cleaned = applyFindingHygiene(findings);
    expect(cleaned).toHaveLength(1);
    expect(cleaned[0].reasonCode).toBe("LOW_CONFIDENCE");
    expect(cleaned[0].normalisedSnippet).toBe("2024-09-02");
  });

  it("suppresses false Absent signature when label evidence exists", () => {
    const findings = [
      finding({
        fieldName: "customerSignature",
        reasonCode: "MISSING_FIELD",
        normalisedSnippet: "Absent",
        confidence: 100,
        severity: "S0",
      }),
    ];
    const cleaned = applyFindingHygiene(findings, {
      signatureLabelPresent: true,
    });
    expect(cleaned).toHaveLength(0);
  });

  it("detects signature labels in document text", () => {
    expect(
      hasSignatureLabelEvidence("Technician Signature\n[handwriting]")
    ).toBe(true);
    expect(hasSignatureLabelEvidence("No sign-off section here")).toBe(false);
  });

  it("drops mileage noise on serialNumber findings", () => {
    const findings = [
      finding({
        fieldName: "serialNumber",
        reasonCode: "INVALID_FORMAT",
        rawSnippet: "Serial No: Asset Mileage/Hours: 74685",
      }),
    ];
    const cleaned = applyFindingHygiene(findings);
    expect(cleaned).toHaveLength(0);
  });
});

describe("ensemble signature conflict normalization", () => {
  it("detects asset-ID shaped tokens", () => {
    expect(isAssetIdShaped("BN21ACO_TL")).toBe(true);
    expect(isAssetIdShaped("Present")).toBe(false);
  });

  it("normalizes signature values and rejects asset IDs", () => {
    expect(normalizeSignatureExtractionValue("Present")).toBe("Present");
    expect(normalizeSignatureExtractionValue("BN21ACO_TL")).toBeNull();
    expect(normalizeSignatureExtractionValue("Jane Doe")).toBe("Present");
  });

  it("does not emit Present|assetId CONFLICT for technician_signature", async () => {
    const field = FIELD_DEFINITIONS.find(
      f => f.name === "technician_signature"
    )!;
    const text = `
Job Summary Report
Asset No: BN21ACO_TL
Make/Model: TAILLIFT
Technician Signature
BN21ACO_TL Make/Model
`;
    const result = await ensembleExtract(text, field, {
      useLlm: false,
      llmConfidenceThreshold: 70,
    });
    expect(result.reasonCode).not.toBe("CONFLICT");
    if (result.conflictValues) {
      expect(result.conflictValues.some(isAssetIdShaped)).toBe(false);
    }
    if (result.value) {
      expect(isAssetIdShaped(result.value)).toBe(false);
    }
  });

  it("does not treat BN21ACO_TL Make/Model as a Date value", async () => {
    const field = FIELD_DEFINITIONS.find(f => f.name === "date")!;
    const text = `
Job Summary Report
Asset No: BN21ACO_TL
Make/Model: TAILLIFT
Date
BN21ACO_TL Make/Model
02/09/2024
`;
    const result = await ensembleExtract(text, field, {
      useLlm: false,
      llmConfidenceThreshold: 70,
    });
    expect(result.reasonCode).not.toBe("CONFLICT");
    if (result.value) {
      expect(isAssetIdShaped(result.value)).toBe(false);
      expect(result.value).not.toMatch(/Make\/Model/i);
    }
  });

  it("does not map technician_signature to customerSignature", () => {
    expect(ENSEMBLE_TO_GOLDSPEC.technician_signature).toBeUndefined();
  });
});

describe("ensemble→Gemini wiring", () => {
  it("formatPreExtractedHints builds advisory block", () => {
    const block = formatPreExtractedHints({
      jobNumber: { value: "JOB-1", confidence: 90, pageNumber: 1 },
    });
    expect(block).toContain("Pre-extracted Fields");
    expect(block).toContain("jobNumber");
    expect(block).toContain("JOB-1");
    expect(block).toContain("MISSING_FIELD");
  });

  it("documentProcessor passes preExtractedFields and applies hygiene", () => {
    const dp = fs.readFileSync(
      path.resolve(__dirname, "../../services/documentProcessor.ts"),
      "utf-8"
    );
    expect(dp).toContain("preExtractedFields:");
    expect(dp).toContain("formatPreExtractedHints");
    expect(dp).toContain("applyFindingHygiene");
    expect(dp).toContain("Finding Hygiene");
    expect(dp).toContain("hasSignatureLabelEvidence");
    expect(dp).toContain("sanitizeExtractedFieldsForSignatures");
  });

  it("analyzer prompt path accepts preExtractedHintsBlock", () => {
    const analyzer = fs.readFileSync(
      path.resolve(__dirname, "../../services/analyzer.ts"),
      "utf-8"
    );
    expect(analyzer).toContain("preExtractedHintsBlock");
    expect(analyzer).toContain("preExtractedFields");
    expect(analyzer).toContain("Pre-extracted Fields");
    expect(analyzer).toContain(
      "Handwritten signatures usually produce NO OCR text"
    );
  });
});
