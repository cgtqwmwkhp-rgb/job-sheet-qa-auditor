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
  hasTechnicianSignatureLabelEvidence,
  hasCustomerSignatureLabelEvidence,
  hasVorBannerEvidence,
  hasOnlyInformationalFindings,
  injectPresentFieldFindings,
  extractMakeModelFromText,
  sanitizeMakeModelValue,
  MAX_MAKE_MODEL_LENGTH,
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

  it("records Present instead of dropping false Absent signature", () => {
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
    expect(cleaned).toHaveLength(1);
    expect(cleaned[0].normalisedSnippet).toBe("Present");
    expect(cleaned[0].severity).toBe("S3");
    expect(cleaned[0].reasonCode).toBe("LOW_CONFIDENCE");
  });

  it("injects Present signature finding when label evidence and Gemini omitted it", () => {
    const findings = [
      finding({
        fieldName: "jobNumber",
        reasonCode: "LOW_CONFIDENCE",
        normalisedSnippet: "793",
        confidence: 100,
        severity: "S3",
      }),
    ];
    const cleaned = applyFindingHygiene(findings, {
      signatureLabelPresent: true,
    });
    expect(cleaned.some(f => f.fieldName === "customerSignature")).toBe(true);
    const sig = cleaned.find(f => f.fieldName === "customerSignature")!;
    expect(sig.normalisedSnippet).toBe("Present");
    expect(sig.severity).toBe("S3");
  });

  it("detects signature labels in document text", () => {
    expect(
      hasSignatureLabelEvidence("Technician Signature\n[handwriting]")
    ).toBe(true);
    expect(hasSignatureLabelEvidence("No sign-off section here")).toBe(false);
  });

  it("separates technician vs customer signature labels", () => {
    expect(
      hasTechnicianSignatureLabelEvidence("Technician Signature\nink")
    ).toBe(true);
    expect(hasCustomerSignatureLabelEvidence("Technician Signature\nink")).toBe(
      false
    );
    expect(hasCustomerSignatureLabelEvidence("Customer Signature")).toBe(true);
    expect(hasTechnicianSignatureLabelEvidence("Customer Signature")).toBe(
      false
    );
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

describe("Job Summary judgment hygiene", () => {
  afterEach(() => {
    delete process.env.FEATURE_FINDING_HYGIENE;
  });

  it("suppresses Engineer Comments MISSING when workDescription is optional", () => {
    const findings = [
      finding({
        fieldName: "Engineer Comments",
        reasonCode: "MISSING_FIELD",
        confidence: 0,
        severity: "S1",
      }),
      finding({
        fieldName: "assetId",
        reasonCode: "MISSING_FIELD",
        confidence: 0,
        severity: "S1",
      }),
    ];
    const cleaned = applyFindingHygiene(findings, {
      optionalTemplateFields: new Set(["workDescription"]),
      optionalFieldAliases: ["Engineer Comments", "Work Notes"],
    });
    expect(cleaned.some(f => /engineer comments/i.test(f.fieldName))).toBe(
      false
    );
    expect(cleaned.some(f => f.fieldName === "assetId")).toBe(true);
  });

  it("detects VOR banner evidence", () => {
    expect(
      hasVorBannerEvidence(
        "This Vehicle is marked as VOR\nAsset No: BN21ACO_TL"
      )
    ).toBe(true);
    expect(hasVorBannerEvidence("Routine service completed")).toBe(false);
  });

  it("injects vorStatus, assetId, makeModel, mileageHours Present findings", () => {
    const text = `
Job Summary Report
This Vehicle is marked as VOR
Asset No: BN21ACO_TL
Make/Model: TAILLIFT
Asset Mileage/Hours: 74685
Technician Signature
`;
    const injected = injectPresentFieldFindings([], text);
    expect(injected.some(f => f.fieldName === "vorStatus")).toBe(true);
    expect(injected.some(f => f.fieldName === "assetId")).toBe(true);
    expect(
      injected.find(f => f.fieldName === "assetId")?.normalisedSnippet
    ).toBe("BN21ACO_TL");
    expect(injected.some(f => f.fieldName === "makeModel")).toBe(true);
    expect(
      injected.find(f => f.fieldName === "makeModel")?.normalisedSnippet
    ).toBe("TAILLIFT");
    expect(injected.some(f => f.fieldName === "mileageHours")).toBe(true);
    expect(
      injected.find(f => f.fieldName === "mileageHours")?.normalisedSnippet
    ).toBe("74685");
  });

  it("truncates flat OCR makeModel before Customer and other job-summary fields", () => {
    const flatOcr =
      "Make/Model: TOWMATE TRAILERS FLATBED TRAILER Customer: Openreach Site Address / Contact: Ipswich Telephone Exchange Miles/Hours: 0 Serial No: null Completion Details Date: 02/07/2026 Job ID : 87";
    expect(extractMakeModelFromText(flatOcr)).toBe(
      "TOWMATE TRAILERS FLATBED TRAILER"
    );
    expect(
      sanitizeMakeModelValue(
        "TOWMATE TRAILERS FLATBED TRAILER Customer: Openreach Site Address"
      )
    ).toBe("TOWMATE TRAILERS FLATBED TRAILER");
    const injected = injectPresentFieldFindings([], flatOcr);
    expect(
      injected.find(f => f.fieldName === "makeModel")?.normalisedSnippet
    ).toBe("TOWMATE TRAILERS FLATBED TRAILER");
  });

  it("sanitizes bloated preExtracted makeModel from failed ensemble bleed", () => {
    const bloated =
      "Make/Model: TOWMATE TRAILERS FLATBED TRAILER Customer: Openreach Miles/Hours: 0";
    const injected = injectPresentFieldFindings([], "", {
      makeModel: { value: bloated, confidence: 75, pageNumber: 1 },
    });
    expect(
      injected.find(f => f.fieldName === "makeModel")?.normalisedSnippet
    ).toBe("TOWMATE TRAILERS FLATBED TRAILER");
  });

  it("rejects makeModel values that exceed max length after boundary trim", () => {
    const tooLong = `${"A".repeat(MAX_MAKE_MODEL_LENGTH + 5)} Customer: X`;
    expect(sanitizeMakeModelValue(tooLong)).toBeUndefined();
  });

  it("applyFindingHygiene injects Present fields from documentText", () => {
    const cleaned = applyFindingHygiene([], {
      documentText: `
Job Summary Report
This Vehicle is marked as VOR
Asset No: BN21ACO_TL
Make/Model: TAILLIFT
Mileage/Hours: 74685
Technician Signature
`,
      signatureLabelPresent: true,
      optionalTemplateFields: ["workDescription"],
    });
    expect(cleaned.some(f => /signature/i.test(f.fieldName))).toBe(true);
    expect(cleaned.some(f => f.fieldName === "vorStatus")).toBe(true);
    expect(cleaned.some(f => f.fieldName === "assetId")).toBe(true);
    expect(hasOnlyInformationalFindings(cleaned)).toBe(true);
  });

  it("hasOnlyInformationalFindings is false when S2 LOW_CONFIDENCE remains", () => {
    expect(
      hasOnlyInformationalFindings([
        finding({
          fieldName: "OCR Confidence",
          reasonCode: "LOW_CONFIDENCE",
          severity: "S2",
        }),
      ])
    ).toBe(false);
  });

  it("hasOnlyInformationalFindings is false when S1 MISSING remains", () => {
    expect(
      hasOnlyInformationalFindings([
        finding({
          fieldName: "Engineer Comments",
          reasonCode: "MISSING_FIELD",
          severity: "S1",
        }),
      ])
    ).toBe(false);
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

  it("maps technician_signature to engineerSignOff, not customerSignature", () => {
    expect(ENSEMBLE_TO_GOLDSPEC.technician_signature).toBe("engineerSignOff");
    expect(ENSEMBLE_TO_GOLDSPEC.customer_signature).toBe("customerSignature");
    expect(ENSEMBLE_TO_GOLDSPEC.technician_signature).not.toBe(
      "customerSignature"
    );
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
    expect(dp).toContain("hasTechnicianSignatureLabelEvidence");
    expect(dp).toContain("hasCustomerSignatureLabelEvidence");
    expect(dp).toContain("hasVorBannerEvidence");
    expect(dp).toContain("hasOnlyInformationalFindings");
    expect(dp).toContain("sanitizeExtractedFieldsForSignatures");
    expect(dp).toContain("optionalTemplateFields");
    expect(dp).toContain("canPromoteAutoPass");
    expect(dp).toContain("runDeterministicValidation");
    expect(dp).toContain("[AUTO_PASS]");
    expect(dp).toContain("[DETERMINISTIC_VALIDATION]");
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
