/**
 * VLM ink verification helpers — fail-soft PDF path.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  isGeminiMultimodalEnabled,
  pdfBufferToVlmDocument,
  verifySignatureInk,
  VLM_PDF_MAX_BYTES,
} from "../../services/vlmInkVerification";
import { getMockVlmAdapter } from "../../services/vlmAdapter";

describe("vlmInkVerification", () => {
  const envKeys = [
    "FEATURE_VLM_VERIFICATION",
    "VLM_PROVIDER",
    "FEATURE_GEMINI_MULTIMODAL",
    "GEMINI_API_KEY",
  ] as const;
  const prev: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of envKeys) prev[k] = process.env[k];
    process.env.FEATURE_VLM_VERIFICATION = "true";
    process.env.VLM_PROVIDER = "mock";
    getMockVlmAdapter().setShouldFail(false);
  });

  afterEach(() => {
    for (const k of envKeys) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
    getMockVlmAdapter().setShouldFail(false);
  });

  it("skips when feature flag off", async () => {
    process.env.FEATURE_VLM_VERIFICATION = "false";
    const result = await verifySignatureInk({
      documentUrl: "https://example.com/doc.pdf",
      pdfBuffer: Buffer.from("%PDF-1.4"),
    });
    expect(result.ran).toBe(false);
    expect(result.skippedReason).toMatch(/off/i);
  });

  it("verifies ink from in-memory PDF buffer via mock VLM", async () => {
    const result = await verifySignatureInk({
      documentUrl: "https://example.com/doc.pdf",
      pdfBuffer: Buffer.from("%PDF-1.4 mock job sheet"),
      disputed: true,
    });
    expect(result.ran).toBe(true);
    expect(result.imageQa?.vlmUsed).toBe(true);
    expect(result.preExtractedHint?.value).toBe("Present");
    expect(result.artifact.vlmUsed).toBe(true);
  });

  it("pdfBufferToVlmDocument rejects oversized buffers", () => {
    const huge = Buffer.alloc(VLM_PDF_MAX_BYTES + 1);
    expect(pdfBufferToVlmDocument(huge)).toBeNull();
    expect(pdfBufferToVlmDocument(Buffer.from("%PDF"))).not.toBeNull();
  });

  it("isGeminiMultimodalEnabled defaults on when Gemini key present", () => {
    delete process.env.FEATURE_GEMINI_MULTIMODAL;
    process.env.GEMINI_API_KEY = "test-key";
    expect(isGeminiMultimodalEnabled()).toBe(true);
    process.env.FEATURE_GEMINI_MULTIMODAL = "false";
    expect(isGeminiMultimodalEnabled()).toBe(false);
  });
});
