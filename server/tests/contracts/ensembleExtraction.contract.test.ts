/**
 * Ensemble Extraction Contract Tests (PR-8)
 *
 * Mocks only — LLM_PROVIDER=mock, no live Gemini/Mistral.
 * Verifies consensus voting, CONFLICT disagreement, fail-soft wiring,
 * and documentProcessor Stage 1.75 integration.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import {
  ensembleExtract,
  processDocument,
  FIELD_DEFINITIONS,
  ENGINE_VERSION,
  type FieldDefinition,
} from "../../services/advancedExtraction";
import {
  runEnsembleExtraction,
  isEnsembleExtractionEnabled,
  mergeExtractedFields,
  buildEnsembleReviewFindings,
  ENSEMBLE_TO_GOLDSPEC,
} from "../../services/ensembleExtraction";
import {
  getMockLlmResponse,
  isFieldExtractionPrompt,
  resetMockLlm,
} from "../../_core/mockLlm";
import type { InvokeParams } from "../../_core/llm";
import { clearApiCostLedger, summarizeApiCosts } from "../../services/finOps";

const CONSENSUS_OCR = `
--- Page 1 ---
Job Number: 12345
Job No: 12345
Asset Number: ASSET-99
Asset No: ASSET-99
Customer Name: Acme Corp
Customer: Acme Corp
Date: 08/07/2026
Engineer Name: Jane Doe
Engineer: Jane Doe
Safe to Use: Yes
Engineer Comments: Routine service completed
Technician Signature: Present
Make/Model: Toyota Forklift
`;

describe("Ensemble Extraction Contract Tests", () => {
  const prevFlag = process.env.FEATURE_ENSEMBLE_EXTRACTION;
  const prevProvider = process.env.LLM_PROVIDER;

  beforeEach(() => {
    process.env.LLM_PROVIDER = "mock";
    delete process.env.GEMINI_API_KEY;
    process.env.FEATURE_ENSEMBLE_EXTRACTION = "true";
    resetMockLlm();
    clearApiCostLedger();
  });

  afterEach(() => {
    if (prevFlag === undefined) {
      delete process.env.FEATURE_ENSEMBLE_EXTRACTION;
    } else {
      process.env.FEATURE_ENSEMBLE_EXTRACTION = prevFlag;
    }
    if (prevProvider === undefined) {
      delete process.env.LLM_PROVIDER;
    } else {
      process.env.LLM_PROVIDER = prevProvider;
    }
    resetMockLlm();
    clearApiCostLedger();
    vi.restoreAllMocks();
  });

  describe("feature flag", () => {
    it("defaults to disabled when FEATURE_ENSEMBLE_EXTRACTION is unset", () => {
      delete process.env.FEATURE_ENSEMBLE_EXTRACTION;
      expect(isEnsembleExtractionEnabled()).toBe(false);
    });

    it("enables only when FEATURE_ENSEMBLE_EXTRACTION=true", () => {
      process.env.FEATURE_ENSEMBLE_EXTRACTION = "true";
      expect(isEnsembleExtractionEnabled()).toBe(true);
    });

    it("disables when FEATURE_ENSEMBLE_EXTRACTION=false", () => {
      process.env.FEATURE_ENSEMBLE_EXTRACTION = "false";
      expect(isEnsembleExtractionEnabled()).toBe(false);
    });
  });

  describe("mock LLM field-extraction routing", () => {
    it("routes field-extraction prompts to field-extraction-pass fixture", () => {
      const params: InvokeParams = {
        messages: [
          {
            role: "user",
            content:
              'Extract the following field from this job sheet text.\nRespond with ONLY a JSON object:\n{"value": "extracted value or null", "confidence": 0-100, "evidence": "relevant text snippet"}',
          },
        ],
      };
      expect(isFieldExtractionPrompt(params)).toBe(true);
      const result = getMockLlmResponse(params);
      const content = result.choices[0]?.message?.content;
      expect(typeof content).toBe("string");
      const parsed = JSON.parse(content as string);
      expect(parsed).toHaveProperty("value");
      expect(parsed).toHaveProperty("confidence");
      expect(parsed).toHaveProperty("evidence");
      expect(parsed).not.toHaveProperty("overallResult");
      expect(result.id).toBe("mock-llm-field-extraction");
    });

    it("keeps judgment fixture for non-field prompts", () => {
      const params: InvokeParams = {
        messages: [
          {
            role: "user",
            content: "Analyze this job sheet against the gold standard.",
          },
        ],
      };
      expect(isFieldExtractionPrompt(params)).toBe(false);
      const result = getMockLlmResponse(params);
      const parsed = JSON.parse(result.choices[0]?.message?.content as string);
      expect(parsed).toHaveProperty("overallResult");
      expect(result.id).toBe("mock-llm-judgment");
    });
  });

  describe("consensus voting", () => {
    it("boosts confidence when consensusCount >= 2", async () => {
      const jobField = FIELD_DEFINITIONS.find(f => f.name === "job_no")!;
      const result = await ensembleExtract(CONSENSUS_OCR, jobField, {
        useLlm: false,
        llmConfidenceThreshold: 70,
        fuzzyMatchingEnabled: true,
      });

      expect(result.value).toBe("12345");
      expect(result.consensusCount).toBeGreaterThanOrEqual(2);
      expect(result.strategy).toMatch(/ensemble\(\d+ agree\)/);
      // Single-strategy regex max is 85; consensus boost should exceed that
      expect(result.confidence).toBeGreaterThan(85);
      expect(result.reasonCode).toBeNull();
    });

    it("honors fuzzyMatchingEnabled=false by skipping fuzzy strategy", async () => {
      const jobField = FIELD_DEFINITIONS.find(f => f.name === "job_no")!;
      const withFuzzy = await ensembleExtract(CONSENSUS_OCR, jobField, {
        useLlm: false,
        fuzzyMatchingEnabled: true,
      });
      const withoutFuzzy = await ensembleExtract(CONSENSUS_OCR, jobField, {
        useLlm: false,
        fuzzyMatchingEnabled: false,
      });

      expect(withFuzzy.value).toBeTruthy();
      expect(withoutFuzzy.value).toBeTruthy();
      // With fuzzy disabled, fewer strategies may agree
      expect(withoutFuzzy.consensusCount ?? 0).toBeLessThanOrEqual(
        withFuzzy.consensusCount ?? 0
      );
    });
  });

  describe("FinOps cost attribution", () => {
    it("records Gemini fallback spend against the ensemble stage", async () => {
      const assetField = FIELD_DEFINITIONS.find(f => f.name === "asset_no")!;

      await ensembleExtract(
        "This free-form note contains no asset number or matching field label.",
        assetField,
        { useLlm: true, fuzzyMatchingEnabled: false }
      );
      // Cost recording is a fail-safe lazy import, so allow it to settle.
      await new Promise(resolve => setImmediate(resolve));

      const summary = summarizeApiCosts({ windowHours: null });
      expect(summary.byStage).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ key: "ensemble", count: 1 }),
        ])
      );
      expect(summary.byTool).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ key: "gemini_ensemble_extraction" }),
        ])
      );
    });
  });

  describe("CONFLICT disagreement", () => {
    it("flags CONFLICT when high-confidence strategies disagree", async () => {
      // Regex → Work Order value; fuzzy → typo'd "Refrence" label (context misses exact label)
      const conflictField: FieldDefinition = {
        name: "job_no",
        displayName: "Job Number",
        required: true,
        severity: "S0",
        regexPatterns: [/Work\s*Order[:\s]*(\d+)/i],
        fuzzyLabels: ["Reference"],
        llmPrompt: "Extract job number",
      };

      const conflictText = `
Work Order: 99999
Refrence: 11111
Customer Name: Acme Corp
`;

      const result = await ensembleExtract(conflictText, conflictField, {
        useLlm: false,
        llmConfidenceThreshold: 70,
        fuzzyMatchingEnabled: true,
      });

      expect(result.strategy).toBe("ensemble(CONFLICT)");
      expect(result.reasonCode).toBe("CONFLICT");
      expect(result.conflictValues?.length).toBeGreaterThanOrEqual(2);
      expect(result.confidence).toBeLessThan(70);
    });
  });

  describe("adapter mapping + fail-soft", () => {
    it("maps advancedExtraction fields to GoldSpec keys", async () => {
      const adapter = await runEnsembleExtraction(CONSENSUS_OCR, {
        filename: "consensus.pdf",
        useLlm: false,
        settings: {
          llmFallbackEnabled: false,
          llmConfidenceThreshold: 70,
          ocrEnabled: true,
          ocrConfidenceThreshold: 60,
          fuzzyMatchingEnabled: true,
          fuzzyMatchThreshold: 80,
          maxRetries: 3,
          processingTimeoutMs: 60000,
        },
      });

      expect(adapter).not.toBeNull();
      expect(adapter!.artifact.engineVersion).toBe(ENGINE_VERSION);
      expect(adapter!.ensembleExtractedFields.jobReference?.value).toBe(
        "12345"
      );
      expect(adapter!.ensembleExtractedFields.customerName?.value).toMatch(
        /Acme/i
      );
      expect(adapter!.ensembleExtractedFields.technicianName?.value).toMatch(
        /Jane/i
      );
      expect(ENSEMBLE_TO_GOLDSPEC.job_no).toBe("jobReference");
      expect(ENSEMBLE_TO_GOLDSPEC.asset_no).toBe("assetId");
    });

    it("returns null when feature flag disabled", async () => {
      process.env.FEATURE_ENSEMBLE_EXTRACTION = "false";
      const adapter = await runEnsembleExtraction(CONSENSUS_OCR, {
        useLlm: false,
      });
      expect(adapter).toBeNull();
    });

    it("fail-soft: adapter returns null when processDocument throws", async () => {
      const advanced = await import("../../services/advancedExtraction");
      vi.spyOn(advanced, "processDocument").mockRejectedValueOnce(
        new Error("boom")
      );

      const adapter = await runEnsembleExtraction(CONSENSUS_OCR, {
        useLlm: false,
      });
      expect(adapter).toBeNull();
    });

    it("skips LLM leg when llmFallbackEnabled is false", async () => {
      const result = await processDocument(CONSENSUS_OCR, "test.pdf", {
        useLlm: false,
        settings: {
          llmFallbackEnabled: false,
          llmConfidenceThreshold: 70,
          ocrEnabled: true,
          ocrConfidenceThreshold: 60,
          fuzzyMatchingEnabled: true,
          fuzzyMatchThreshold: 80,
          maxRetries: 3,
          processingTimeoutMs: 60000,
        },
      });

      const strategies = Object.values(result.fieldDetails).map(
        d => d.strategy
      );
      expect(strategies.every(s => !s.includes("llm"))).toBe(true);
    });
  });

  describe("review findings + merge", () => {
    it("buildEnsembleReviewFindings emits CONFLICT findings", () => {
      const findings = buildEnsembleReviewFindings(
        {
          lowConfidenceFields: [],
          missingRequired: [],
          conflictFields: ["jobNumber"],
          averageConfidence: 50,
          reviewRequired: true,
        },
        {
          jobNumber: {
            value: "JS-1",
            confidence: 60,
            pageNumber: 1,
            strategy: "ensemble(CONFLICT)",
            evidence: "a | b",
            sourceName: "job_no",
            displayName: "Job Number",
            required: true,
            reasonCode: "CONFLICT",
            conflictValues: ["JS-1", "99999"],
          },
        },
        70
      );

      expect(findings).toHaveLength(1);
      expect(findings[0]!.ruleId).toBe("ENSEMBLE");
      expect(findings[0]!.reasonCode).toBe("CONFLICT");
    });

    it("mergeExtractedFields prefers higher ensemble confidence", () => {
      const merged = mergeExtractedFields(
        { jobNumber: { value: "OLD", confidence: 50, pageNumber: 1 } },
        { jobNumber: { value: "NEW", confidence: 90, pageNumber: 1 } }
      );
      expect(merged.jobNumber.value).toBe("NEW");
    });
  });

  describe("documentProcessor wiring (source contract)", () => {
    const dpPath = path.resolve(
      __dirname,
      "../../services/documentProcessor.ts"
    );
    const dp = fs.readFileSync(dpPath, "utf-8");

    it("includes Ensemble Extraction stage on FULL path", () => {
      expect(dp).toContain('stage: "Ensemble Extraction"');
      expect(dp).toContain("runEnsembleExtraction");
      expect(dp).toContain("ensembleExtraction");
      expect(dp).toContain('PIPELINE_VERSION = "2.1.0"');
    });

    it("routes CONFLICT/low consensus to review_queue without promoting PASS", () => {
      expect(dp).toContain("buildEnsembleReviewFindings");
      expect(dp).toContain("ENSEMBLE");
      expect(dp).toContain("reviewSignals.reviewRequired");
      // Must not set PASS from ensemble alone
      expect(dp).not.toMatch(
        /ensembleResult[\s\S]{0,200}overallResult:\s*"PASS"/
      );
    });

    it("gates pipelineIntegration behind master flag and keeps it fail-soft", () => {
      expect(dp).toContain("processWithIntegration");
      expect(dp).toContain("getFeatureFlagsFromEnv");
      expect(dp).toContain(
        'process.env.FEATURE_PIPELINE_INTEGRATION === "true"'
      );
      expect(dp).toContain('stage: "Pipeline Integration"');
      expect(dp).toContain("Pipeline integration failed (non-fatal)");
      expect(dp).toContain("pipelineIntegrationResult");
      expect(dp).not.toContain("criticalFieldExtractor");
    });

    it("preserves PR-3 fail-closed gates", () => {
      expect(dp).toContain("LOW_OCR_CONFIDENCE");
      expect(dp).toContain("LOW_LLM_CONFIDENCE");
      expect(dp).toContain("llmConfidenceThreshold");
    });
  });
});

describe("signature role separation", () => {
  const prevFlag = process.env.FEATURE_ENSEMBLE_EXTRACTION;

  beforeEach(() => {
    process.env.FEATURE_ENSEMBLE_EXTRACTION = "true";
    process.env.LLM_PROVIDER = "mock";
    delete process.env.GEMINI_API_KEY;
  });

  afterEach(() => {
    if (prevFlag === undefined) delete process.env.FEATURE_ENSEMBLE_EXTRACTION;
    else process.env.FEATURE_ENSEMBLE_EXTRACTION = prevFlag;
  });

  it("maps technician signature Present to engineerSignOff only", async () => {
    const text = `
Technician Name: harry.barrett
Technician Signature
Signature:
`;
    const result = await runEnsembleExtraction(text, {
      useLlm: false,
      llmConfidenceThreshold: 70,
    });
    expect(result).not.toBeNull();
    expect(result!.ensembleExtractedFields.engineerSignOff?.value).toBe(
      "Present"
    );
    expect(result!.ensembleExtractedFields.customerSignature).toBeUndefined();
    expect(result!.ensembleExtractedFields.technicianName?.value).toMatch(
      /harry\.barrett/i
    );
  });

  it("maps customer signature Present without claiming technician ink", async () => {
    const text = `
Customer Signature
Client Signature:
`;
    const result = await runEnsembleExtraction(text, {
      useLlm: false,
      llmConfidenceThreshold: 70,
    });
    expect(result).not.toBeNull();
    expect(result!.ensembleExtractedFields.customerSignature?.value).toBe(
      "Present"
    );
    expect(result!.ensembleExtractedFields.engineerSignOff).toBeUndefined();
  });
});
