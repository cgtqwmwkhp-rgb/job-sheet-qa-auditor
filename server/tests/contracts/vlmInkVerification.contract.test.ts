/**
 * VLM ink verification helpers — fail-soft PDF + signature crop path (AI-09).
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  isGeminiMultimodalEnabled,
  pdfBufferToVlmDocument,
  resolveSignatureRois,
  verifySignatureInk,
  VLM_PDF_MAX_BYTES,
} from "../../services/vlmInkVerification";
import { getMockVlmAdapter } from "../../services/vlmAdapter";

const tinyPngBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

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
    // PX-116: skippedReason must land on reportJson artifact (UI honesty).
    expect(result.artifact.skippedReason).toMatch(/off/i);
    expect(result.artifact.enabled).toBe(false);
    expect(result.artifact.vlmUsed).toBe(false);
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

  it("prefers cropped signature ROI over full PDF when crop provided", async () => {
    const result = await verifySignatureInk({
      documentUrl: "https://example.com/doc.pdf",
      pdfBuffer: Buffer.from("%PDF-1.4 mock job sheet"),
      disputed: true,
      roiConfig: {
        regions: [
          {
            name: "signatureBlock",
            page: 1,
            bounds: { x: 0.1, y: 0.75, width: 0.8, height: 0.2 },
            fields: ["customerSignature"],
          },
        ],
      },
      cropImages: {
        signatureBlock: {
          data: tinyPngBase64,
          mediaType: "image/png",
          encoding: "base64",
        },
      },
    });
    expect(result.ran).toBe(true);
    expect(result.artifact.mediaMode).toBe("crop");
    expect(result.artifact.pixelCropped).toBe(true);
    expect(result.cropResults?.[0]?.media).toBe("crop");
    expect(result.cropResults?.[0]?.cropReference?.cropHash).toMatch(/^crop_/);
    expect(result.preExtractedHint?.value).toBe("Present");
  });

  it("resolveSignatureRois uses template signature regions", () => {
    const rois = resolveSignatureRois({
      regions: [
        {
          name: "jobReference",
          page: 1,
          bounds: { x: 0, y: 0, width: 0.5, height: 0.1 },
        },
        {
          name: "customerSignature",
          page: 1,
          bounds: { x: 0.1, y: 0.8, width: 0.4, height: 0.15 },
        },
        {
          name: "engineerSignOff",
          page: 1,
          bounds: { x: 0.55, y: 0.8, width: 0.4, height: 0.15 },
        },
      ],
    });
    expect(rois.map(r => r.name)).toEqual([
      "customerSignature",
      "engineerSignOff",
    ]);
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
