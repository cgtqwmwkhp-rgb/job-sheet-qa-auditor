/**
 * Crop OCR Adapter Contract Tests (PR-AI-05 / CropVision)
 */

import { describe, it, expect, vi } from "vitest";
import {
  valueFromCropOcrText,
  reOcrRoiCrop,
  isRoiCropReocrEnabled,
  FEATURE_ROI_CROP_REOCR,
  type CropOcrResult,
  type RoiCropImage,
} from "../../services/ocrAdapter/cropOcrAdapter";
import type { RoiRegion } from "../../services/templateRegistry/types";
import type { OCRAdapter, OCRResult } from "../../services/ocrAdapter/types";

const sampleRoi: RoiRegion = {
  name: "jobReference",
  page: 1,
  bounds: { x: 0.05, y: 0.1, width: 0.4, height: 0.05 },
};

function fakeCrop(overrides: Partial<RoiCropImage> = {}): RoiCropImage {
  return {
    dataBase64: Buffer.from("fake-png").toString("base64"),
    mediaType: "image/png",
    page: 1,
    bounds: sampleRoi.bounds,
    cropHash: "crop_testhash01",
    widthPx: 200,
    heightPx: 40,
    ...overrides,
  };
}

function fakeAdapter(markdown: string, success = true): OCRAdapter {
  const result: OCRResult = {
    success,
    pages: success
      ? [
          {
            pageNumber: 1,
            markdown,
            confidenceScores: { averagePageConfidence: 0.91 },
          },
        ]
      : [],
    totalPages: success ? 1 : 0,
    model: "mock-crop",
    error: success ? undefined : "OCR_FAILED",
  };
  return {
    providerName: "mock",
    modelId: "mock-crop",
    extractFromUrl: vi.fn(async () => result),
    extractFromBase64: vi.fn(async () => result),
    validateApiKey: vi.fn(async () => ({ valid: true })),
    getProviderArtifact: vi.fn(() => ({
      provider: "mock",
      model: "mock-crop",
      timestamp: new Date().toISOString(),
      requestMetadata: { documentType: "base64" as const },
      responseMetadata: {
        statusCode: 200,
        processingTimeMs: 1,
        pagesProcessed: 1,
      },
    })),
  };
}

describe("cropOcrAdapter — PR-AI-05", () => {
  describe("feature flag", () => {
    it("defaults disabled when unset", () => {
      const prev = process.env[FEATURE_ROI_CROP_REOCR];
      delete process.env[FEATURE_ROI_CROP_REOCR];
      expect(isRoiCropReocrEnabled()).toBe(false);
      if (prev === undefined) delete process.env[FEATURE_ROI_CROP_REOCR];
      else process.env[FEATURE_ROI_CROP_REOCR] = prev;
    });

    it("enables only when explicitly set", () => {
      const prev = process.env[FEATURE_ROI_CROP_REOCR];
      process.env[FEATURE_ROI_CROP_REOCR] = "true";
      expect(isRoiCropReocrEnabled()).toBe(true);
      if (prev === undefined) delete process.env[FEATURE_ROI_CROP_REOCR];
      else process.env[FEATURE_ROI_CROP_REOCR] = prev;
    });
  });

  describe("valueFromCropOcrText", () => {
    it("extracts job reference from cramped crop text", () => {
      expect(valueFromCropOcrText("Job Ref: JOB-88421", "jobReference")).toBe(
        "JOB-88421"
      );
    });

    it("extracts asset id", () => {
      expect(valueFromCropOcrText("Asset ID AB12 CDE", "assetId")).toBe("AB12");
    });

    it("returns null for empty OCR", () => {
      expect(valueFromCropOcrText("   \n", "date")).toBeNull();
    });
  });

  describe("reOcrRoiCrop", () => {
    it("re-OCRs a provided crop image (no mock field trap)", async () => {
      const adapter = fakeAdapter("Job Reference: JOB-CROP-77");
      const result = await reOcrRoiCrop(
        {
          fieldId: "jobReference",
          roi: sampleRoi,
          cropImage: fakeCrop(),
        },
        { adapter }
      );

      expect(result.method).toBe("crop_ocr");
      expect(result.success).toBe(true);
      expect(result.value).toBe("JOB-CROP-77");
      expect(result.confidence).toBeGreaterThan(0.8);
      expect(result.value).not.toMatch(/JOB-ROI-001/);
      expect(adapter.extractFromBase64).toHaveBeenCalled();
    });

    it("returns unavailable when no crop/PDF can be rendered", async () => {
      const result: CropOcrResult = await reOcrRoiCrop(
        {
          fieldId: "jobReference",
          roi: sampleRoi,
        },
        {
          render: async () => null,
          adapter: fakeAdapter("should-not-run"),
        }
      );
      expect(result.method).toBe("unavailable");
      expect(result.success).toBe(false);
      expect(result.value).toBeNull();
    });

    it("uses render callback then OCRs crop", async () => {
      const adapter = fakeAdapter("Date: 14/07/2026");
      const result = await reOcrRoiCrop(
        {
          fieldId: "date",
          roi: { ...sampleRoi, name: "date" },
          pdfBuffer: Buffer.from("%PDF-fake"),
        },
        {
          adapter,
          render: async () => fakeCrop({ cropHash: "crop_rendered01" }),
        }
      );
      expect(result.success).toBe(true);
      expect(result.value).toBe("14/07/2026");
      expect(result.crop?.cropHash).toBe("crop_rendered01");
    });
  });
});
