/**
 * Unit tests for OCR finding enrichment (PR-2).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import type { Finding } from "../analyzer";
import type { OCRResult } from "../ocrAdapter/types";
import {
  parseMistralOcrResponse,
  summarizeDeepFeatures,
} from "../ocrAdapter/parseMistralOcrResponse";
import {
  enrichFindingsWithOcrEvidence,
  computePageConfidencePrior,
  hasOcrSignatureEvidence,
} from "./enrichFindings";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(
    join(__dirname, "../../tests/fixtures/mistral-ocr4-deep-response.json"),
    "utf8"
  )
);

function fixtureOcrResult(): OCRResult {
  const parsed = parseMistralOcrResponse(fixture);
  return {
    success: true,
    pages: parsed.pages,
    totalPages: parsed.pages.length,
    model: parsed.model ?? "mistral-ocr-4-0",
    deepFeatures: summarizeDeepFeatures(parsed.pages, true),
  };
}

function baseFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    ruleId: "R-TEST",
    fieldName: "Job Number",
    severity: "S2",
    reasonCode: "MISSING_FIELD",
    rawSnippet: "",
    normalisedSnippet: "",
    confidence: 50,
    pageNumber: 1,
    whyItMatters: "test",
    suggestedFix: "test",
    ...overrides,
  };
}

describe("enrichFindingsWithOcrEvidence", () => {
  it("attaches signature bbox for signature findings", () => {
    const ocr = fixtureOcrResult();
    const findings = [
      baseFinding({
        fieldName: "Customer Signature",
        ruleId: "R-SIGNATURE",
        reasonCode: "MISSING_FIELD",
      }),
    ];

    const enriched = enrichFindingsWithOcrEvidence(findings, ocr);
    expect(enriched[0].boundingBox).toBeDefined();
    expect((enriched[0].boundingBox as any).source).toBe("ocr_signature_block");
    expect((enriched[0].boundingBox as any).coordinateSpace).toBe("percent");
    expect(enriched[0].pageNumber).toBe(1);
  });

  it("attaches text-block bbox when rawSnippet matches block content", () => {
    const ocr = fixtureOcrResult();
    const findings = [
      baseFinding({
        fieldName: "Job Number",
        rawSnippet: "JS-2024-001",
        normalisedSnippet: "JS-2024-001",
      }),
    ];

    const enriched = enrichFindingsWithOcrEvidence(findings, ocr);
    expect(enriched[0].boundingBox).toBeDefined();
    expect((enriched[0].boundingBox as any).source).toBe("ocr_block");
    expect(enriched[0].boundingBox!.x).toBeGreaterThan(0);
  });

  it("updates confidence from overlapping word scores", () => {
    const ocr = fixtureOcrResult();
    const findings = [
      baseFinding({
        fieldName: "Job Number",
        rawSnippet: "JS-2024-001",
        normalisedSnippet: "JS-2024-001",
        confidence: 40,
      }),
    ];

    const enriched = enrichFindingsWithOcrEvidence(findings, ocr);
    // Fixture word confidence for JS-2024-001 is 0.82 → 82
    expect(enriched[0].confidence).toBeCloseTo(82, 0);
  });

  it("is a no-op for empty findings", () => {
    const ocr = fixtureOcrResult();
    expect(enrichFindingsWithOcrEvidence([], ocr)).toEqual([]);
  });

  it("returns input unchanged when OCR has no deep fields", () => {
    const shallow: OCRResult = {
      success: true,
      pages: [{ pageNumber: 1, markdown: "hello" }],
      totalPages: 1,
      model: "mock",
    };
    const findings = [baseFinding({ rawSnippet: "hello" })];
    const enriched = enrichFindingsWithOcrEvidence(findings, shallow);
    expect(enriched).toEqual(findings);
    expect(enriched[0].boundingBox).toBeUndefined();
  });

  it("returns input unchanged when OCR failed", () => {
    const failed: OCRResult = {
      success: false,
      pages: [],
      totalPages: 0,
      model: "mock",
      error: "fail",
    };
    const findings = [baseFinding()];
    expect(enrichFindingsWithOcrEvidence(findings, failed)).toEqual(findings);
  });
});

describe("computePageConfidencePrior", () => {
  it("averages page confidence from deep OCR", () => {
    const ocr = fixtureOcrResult();
    const prior = computePageConfidencePrior(ocr);
    expect(prior).toBeCloseTo(0.91);
  });

  it("returns undefined when no confidence scores", () => {
    const shallow: OCRResult = {
      success: true,
      pages: [{ pageNumber: 1, markdown: "x" }],
      totalPages: 1,
      model: "mock",
    };
    expect(computePageConfidencePrior(shallow)).toBeUndefined();
  });
});

describe("hasOcrSignatureEvidence", () => {
  it("detects signature blocks in fixture", () => {
    expect(hasOcrSignatureEvidence(fixtureOcrResult())).toBe(true);
  });

  it("is false for shallow pages", () => {
    expect(
      hasOcrSignatureEvidence({
        success: true,
        pages: [{ pageNumber: 1, markdown: "sig text only" }],
        totalPages: 1,
        model: "mock",
      })
    ).toBe(false);
  });
});
