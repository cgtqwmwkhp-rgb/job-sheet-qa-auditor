/**
 * Phase 2.2 Contract Tests - parity actuals use real pipeline fixtures.
 */

import { describe, expect, it, vi } from "vitest";
import {
  ParityRunSkippedError,
  convertProcessingResultToGoldenDocument,
  resolveActualResults,
  shouldUseMockActualResults,
  type GoldenDocument,
} from "../../../parity/runner";

const baseGoldenDoc: GoldenDocument = {
  id: "doc-real-001",
  name: "Real Pipeline Fixture",
  description: "Fixture with runtime pipeline metadata",
  expectedResult: "pass",
  pipeline: {
    jobSheetId: 101,
    documentUrl: "file:///fixtures/doc-real-001.pdf",
    templateVersionId: 202,
    userId: 303,
  },
  extractedFields: {
    jobNumber: "JS-REAL-001",
    customerSignature: true,
  },
  validatedFields: [
    {
      ruleId: "R001",
      field: "jobNumber",
      status: "passed",
      value: "JS-REAL-001",
      confidence: 0.98,
      severity: "S0",
    },
    {
      ruleId: "R006",
      field: "customerSignature",
      status: "passed",
      value: true,
      confidence: 0.99,
      severity: "S0",
    },
  ],
  findings: [],
};

describe("Phase 2.2: parity real pipeline actuals", () => {
  it("keeps explicit offline mock fallback via flag or env", () => {
    expect(shouldUseMockActualResults(["--mock"], {})).toBe(true);
    expect(shouldUseMockActualResults([], { PARITY_MOCK: "1" })).toBe(true);
    expect(shouldUseMockActualResults([], {})).toBe(false);
  });

  it("skips real parity when fixtures lack pipeline runtime metadata", async () => {
    const { pipeline: _pipeline, ...docWithoutRuntime } = baseGoldenDoc;

    await expect(resolveActualResults([docWithoutRuntime])).rejects.toThrow(
      ParityRunSkippedError
    );
  });

  it("runs fixture documents through the provided pipeline executor", async () => {
    const executor = vi.fn().mockResolvedValue({
      success: true,
      analysisResult: {
        overallResult: "PASS",
        score: 99,
        findings: [],
        extractedFields: {
          jobNumber: { value: "JS-REAL-001", confidence: 98, pageNumber: 1 },
          customerSignature: { value: true, confidence: 99, pageNumber: 2 },
        },
      },
    });

    const actuals = await resolveActualResults([baseGoldenDoc], { executor });

    expect(executor).toHaveBeenCalledTimes(1);
    expect(executor).toHaveBeenCalledWith(
      baseGoldenDoc,
      baseGoldenDoc.pipeline
    );
    expect(actuals[0].id).toBe(baseGoldenDoc.id);
    expect(actuals[0].expectedResult).toBe("pass");
    expect(actuals[0].validatedFields.map(field => field.status)).toEqual([
      "passed",
      "passed",
    ]);
  });

  it("maps pipeline findings into parity validated fields and findings", () => {
    const actual = convertProcessingResultToGoldenDocument(baseGoldenDoc, {
      success: true,
      analysisResult: {
        overallResult: "FAIL",
        score: 72,
        extractedFields: {
          jobNumber: { value: "JS-REAL-001", confidence: 97, pageNumber: 1 },
        },
        findings: [
          {
            ruleId: "R006",
            fieldName: "customerSignature",
            severity: "S0",
            reasonCode: "MISSING_FIELD",
            confidence: 65,
            pageNumber: 2,
            rawSnippet: "Customer signature: blank",
            whyItMatters: "Customer signature is required.",
          },
        ],
      },
    });

    const failedField = actual.validatedFields.find(
      field => field.ruleId === "R006"
    );

    expect(actual.expectedResult).toBe("fail");
    expect(failedField?.status).toBe("failed");
    expect(failedField?.reasonCode).toBe("MISSING_FIELD");
    expect(failedField?.confidence).toBe(0.65);
    expect(actual.findings).toHaveLength(1);
    expect(actual.findings[0].field).toBe("customerSignature");
  });

  it("attempts a real pipeline document once before skipping", async () => {
    const executor = vi.fn().mockRejectedValue(new Error("OCR unavailable"));

    await expect(
      resolveActualResults([baseGoldenDoc], { executor })
    ).rejects.toThrow(ParityRunSkippedError);

    expect(executor).toHaveBeenCalledTimes(1);
  });

  it("returns mock actuals without pipeline metadata when requested", async () => {
    const { pipeline: _pipeline, ...docWithoutRuntime } = baseGoldenDoc;

    const actuals = await resolveActualResults([docWithoutRuntime], {
      mock: true,
    });

    expect(actuals[0].validatedFields).toEqual(
      docWithoutRuntime.validatedFields
    );
  });
});
