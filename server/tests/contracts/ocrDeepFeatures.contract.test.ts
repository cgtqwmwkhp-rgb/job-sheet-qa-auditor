/**
 * Contract: OCR-4 deep features via mock adapter only (PR-2).
 * No live Mistral calls.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import {
  getMockAdapter,
  resetMockAdapter,
  parseMistralOcrResponse,
  summarizeDeepFeatures,
} from "../../services/ocrAdapter";
import {
  enrichFindingsWithOcrEvidence,
  computePageConfidencePrior,
} from "../../services/ocrFindingEnrichment";
import { checkLoggingSafety } from "../../utils/safeLogger";
import type { Finding } from "../../services/analyzer";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(
    join(__dirname, "../fixtures/mistral-ocr4-deep-response.json"),
    "utf8"
  )
);

describe("OCR Deep Features Contract (mock only)", () => {
  beforeEach(() => {
    resetMockAdapter();
  });

  it("mock deep preset returns blocks, signatures, and confidence", async () => {
    const adapter = getMockAdapter();
    adapter.setMockResponse("deep");

    const result = await adapter.extractFromUrl("mock://deep.pdf");

    expect(result.success).toBe(true);
    expect(result.pages[0].blocks?.length).toBeGreaterThan(0);
    expect(result.pages[0].signatures?.length).toBeGreaterThan(0);
    expect(
      result.pages[0].confidenceScores?.averagePageConfidence
    ).toBeGreaterThan(0);
    expect(result.deepFeatures?.enabled).toBe(true);
    expect(result.deepFeatures?.signatureBlocksDetected).toBeGreaterThan(0);
  });

  it("shallow mock remains backward compatible (no deep fields)", async () => {
    const adapter = getMockAdapter();
    const result = await adapter.extractFromUrl("mock://default.pdf");

    expect(result.success).toBe(true);
    expect(result.pages[0].blocks).toBeUndefined();
    expect(result.pages[0].confidenceScores).toBeUndefined();
  });

  it("enrichment produces percent bboxes for signature findings", async () => {
    const adapter = getMockAdapter();
    adapter.setMockResponse("deep");
    const ocr = await adapter.extractFromUrl("mock://deep.pdf");

    const findings: Finding[] = [
      {
        ruleId: "R-SIG",
        fieldName: "Customer Signature",
        severity: "S1",
        reasonCode: "MISSING_FIELD",
        rawSnippet: "",
        normalisedSnippet: "",
        confidence: 60,
        pageNumber: 1,
        whyItMatters: "Signature required",
        suggestedFix: "Obtain signature",
      },
    ];

    const enriched = enrichFindingsWithOcrEvidence(findings, ocr);
    expect(enriched[0].boundingBox).toBeDefined();
    expect((enriched[0].boundingBox as any).coordinateSpace).toBe("percent");
    expect(typeof enriched[0].confidence).toBe("number");
  });

  it("computePageConfidencePrior differs from hardcoded 0.7 on deep fixture", async () => {
    const adapter = getMockAdapter();
    adapter.setMockResponse("deep");
    const ocr = await adapter.extractFromUrl("mock://deep.pdf");

    const prior = computePageConfidencePrior(ocr);
    expect(prior).toBeDefined();
    expect(prior).not.toBe(0.7);
    expect(prior).toBeCloseTo(0.91);
  });

  it("fixture parser + summarizeDeepFeatures stay PII-safe for reportJson", () => {
    const parsed = parseMistralOcrResponse(fixture);
    const summary = summarizeDeepFeatures(parsed.pages, true);

    expect(summary).not.toHaveProperty("blocks");
    expect(summary).not.toHaveProperty("markdown");
    expect(summary.pagesWithBlocks).toBe(1);
    expect(summary.signatureBlocksDetected).toBe(1);

    const unsafe = checkLoggingSafety(
      summary as unknown as Record<string, unknown>
    );
    expect(unsafe).toEqual([]);
  });

  it("safeLogger forbids blocks / word_confidence_scores / content", () => {
    const unsafe = checkLoggingSafety({
      blocks: [{ type: "text", content: "secret" }],
      word_confidence_scores: [{ text: "x", confidence: 1 }],
      content: "block text",
      pageCount: 1,
    });
    expect(unsafe).toContain("blocks");
    expect(unsafe).toContain("word_confidence_scores");
    expect(unsafe).toContain("content");
  });
});
