/**
 * Embedded PDF text enrichment + thin-text guard + multi-signal wiring.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  shouldPreferEmbeddedText,
  isThinExtractedText,
  usableTextLength,
  THIN_TEXT_CHAR_THRESHOLD,
  extractEmbeddedPdfText,
  enrichWithEmbeddedPdfText,
  decideEmbeddedEnrichment,
} from "../../services/embeddedPdfText";

const MINIMAL_TEXT_PDF = `%PDF-1.1
1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj
2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj
3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj
4 0 obj<< /Length 68 >>stream
BT /F1 12 Tf 72 720 Td (Job Summary Report Asset BN21ACO Technician) Tj ET
endstream
endobj
5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000266 00000 n 
0000000360 00000 n 
trailer<< /Size 6 /Root 1 0 R >>
startxref
433
%%EOF`;

describe("embeddedPdfText enrichment", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("prefers embedded when meaningfully richer than OCR", () => {
    const ocr = "short ocr";
    const embedded = "x".repeat(500);
    expect(shouldPreferEmbeddedText(ocr, embedded)).toBe(true);
  });

  it("keeps OCR when embedded is not richer", () => {
    const ocr = "y".repeat(400);
    const embedded = "z".repeat(450);
    expect(shouldPreferEmbeddedText(ocr, embedded)).toBe(false);
  });

  it("flags thin extracted text below threshold", () => {
    expect(isThinExtractedText("abc")).toBe(true);
    expect(isThinExtractedText("w".repeat(THIN_TEXT_CHAR_THRESHOLD))).toBe(
      false
    );
    expect(usableTextLength("  a  b  ")).toBe(3);
  });

  it("extracts embedded text from a text-layer PDF", async () => {
    const result = await extractEmbeddedPdfText(Buffer.from(MINIMAL_TEXT_PDF));
    expect(result.success).toBe(true);
    expect(result.fullText.toLowerCase()).toContain("job summary");
    expect(result.pageCount).toBe(1);
  });

  it("decideEmbeddedEnrichment prefers richer embedded text", () => {
    const rich = "Job Summary Report ".repeat(40);
    const decision = decideEmbeddedEnrichment(["thin"], {
      success: true,
      fullText: rich,
      pages: [rich],
      pageCount: 1,
    });
    expect(decision.usedEmbedded).toBe(true);
    expect(decision.stageStatus).toBe("success");
    expect(decision.extractedText.toLowerCase()).toContain("job summary");
  });

  it("enrichWithEmbeddedPdfText fails soft when fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 404,
        headers: { get: () => null },
      }))
    );

    const decision = await enrichWithEmbeddedPdfText(
      "https://example.test/missing.pdf",
      ["ocr page text that is still thin"]
    );
    expect(decision.usedEmbedded).toBe(false);
    expect(decision.stageStatus).toBe("skipped");
    expect(decision.extractedText).toContain("ocr page text");
  });
});

describe("documentProcessor quality-slice wiring", () => {
  const dpPath = path.resolve(__dirname, "../../services/documentProcessor.ts");
  const dp = fs.readFileSync(dpPath, "utf-8");

  it("wires embedded enrichment before template selection", () => {
    expect(dp).toContain("enrichWithEmbeddedPdfText");
    expect(dp).toContain("Embedded Text Enrichment");
  });

  it("guards thin text with hybrid THIN_OCR_TEXT path (no Gemini)", () => {
    expect(dp).toContain("isThinExtractedText");
    expect(dp).toContain("THIN_OCR_TEXT");
    expect(dp).toContain("Thin Text Guard");
    expect(dp).toContain("performHybridAssessment(");
    const thinIdx = dp.indexOf("Thin Text Guard");
    const multiCallIdx = dp.indexOf("selectTemplateMultiSignal({");
    expect(thinIdx).toBeGreaterThan(-1);
    expect(multiCallIdx).toBeGreaterThan(thinIdx);
  });

  it("uses selectTemplateMultiSignal for live auto-select", () => {
    expect(dp).toContain("selectTemplateMultiSignal({");
    expect(dp).toContain("pageTexts: pageTextsForPipeline");
    expect(dp).toContain("pageCount: ocrResult.totalPages");
    expect(dp).not.toMatch(/selectionResult\s*=\s*selectTemplate\(/);
  });
});
