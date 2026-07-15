/**
 * Image QA Intake Gate Contract Tests
 *
 * Verifies upload-time pixel blur/skew scoring + retake feedback.
 * Production path analyzes JPEG/PNG buffers directly — never OCRs for quality.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { PNG } from "pngjs";
import jpeg from "jpeg-js";

const { extractTextFromBase64Mock } = vi.hoisted(() => ({
  extractTextFromBase64Mock: vi.fn(),
}));

vi.mock("../../services/ocr", async importOriginal => {
  const actual = await importOriginal<typeof import("../../services/ocr")>();
  return {
    ...actual,
    extractTextFromBase64: extractTextFromBase64Mock,
  };
});

import {
  runIntakeGate,
  resolveIntakeMarkdownProxy,
  isImageQaIntakeEnabled,
  buildRetakeFeedback,
  getDefaultImageQaConfig,
  analyzeImageBuffer,
  type PageQualityMetrics,
} from "../../services/imageQa";

const FIXTURE_DIR = join(process.cwd(), "server/tests/fixtures/imageQa");

function loadFixture(name: string): Buffer {
  return readFileSync(join(FIXTURE_DIR, name));
}

/** Sharp text-like scan: dark ink strokes on white — high Laplacian energy. */
function makeSharpScanPng(width = 240, height = 320): Buffer {
  const png = new PNG({ width, height });
  png.data.fill(255);
  for (let row = 24; row < height - 24; row += 14) {
    for (let x = 16; x < width - 16; x++) {
      if ((x + row) % 3 === 0) {
        const i = (row * width + x) * 4;
        png.data[i] = png.data[i + 1] = png.data[i + 2] = 18;
        png.data[i + 3] = 255;
      }
    }
  }
  return PNG.sync.write(png);
}

/** Soft gradient — near-zero edge energy (garbage blur). */
function makeBlurryScanPng(width = 200, height = 260): Buffer {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const v = (90 + (x / width) * 35 + (y / height) * 35) | 0;
      png.data[i] = png.data[i + 1] = png.data[i + 2] = v;
      png.data[i + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

/** Near-blank washout. */
function makeOverexposedPng(width = 160, height = 160): Buffer {
  const png = new PNG({ width, height });
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    png.data[o] = png.data[o + 1] = png.data[o + 2] = 252;
    png.data[o + 3] = 255;
  }
  return PNG.sync.write(png);
}

function makeSharpScanJpeg(): Buffer {
  const pngBuf = makeSharpScanPng(180, 220);
  const png = PNG.sync.read(pngBuf);
  const encoded = jpeg.encode(
    { data: png.data, width: png.width, height: png.height },
    90
  );
  return Buffer.from(encoded.data);
}

describe("Image QA Intake Gate Contract Tests", () => {
  const prevFlag = process.env.FEATURE_IMAGE_QA_INTAKE;

  beforeEach(() => {
    process.env.FEATURE_IMAGE_QA_INTAKE = "true";
    extractTextFromBase64Mock.mockReset();
    extractTextFromBase64Mock.mockRejectedValue(
      new Error("OCR must not be called from intake gate")
    );
  });

  afterEach(() => {
    if (prevFlag === undefined) {
      delete process.env.FEATURE_IMAGE_QA_INTAKE;
    } else {
      process.env.FEATURE_IMAGE_QA_INTAKE = prevFlag;
    }
  });

  describe("feature flag", () => {
    it("defaults to disabled when unset outside fail-closed envs", () => {
      delete process.env.FEATURE_IMAGE_QA_INTAKE;
      delete process.env.APP_ENV;
      const prevNode = process.env.NODE_ENV;
      process.env.NODE_ENV = "test";
      expect(isImageQaIntakeEnabled()).toBe(false);
      process.env.NODE_ENV = prevNode;
    });

    it("enables when FEATURE_IMAGE_QA_INTAKE=true", () => {
      process.env.FEATURE_IMAGE_QA_INTAKE = "true";
      expect(isImageQaIntakeEnabled()).toBe(true);
    });

    it("enables by default in fail-closed production unless explicitly false", () => {
      delete process.env.FEATURE_IMAGE_QA_INTAKE;
      const prevApp = process.env.APP_ENV;
      process.env.APP_ENV = "production";
      expect(isImageQaIntakeEnabled()).toBe(true);
      process.env.FEATURE_IMAGE_QA_INTAKE = "false";
      expect(isImageQaIntakeEnabled()).toBe(false);
      if (prevApp === undefined) delete process.env.APP_ENV;
      else process.env.APP_ENV = prevApp;
    });
  });

  describe("markdown proxy (test-only, no OCR)", () => {
    it("maps good-scan filename to good fixture", () => {
      const pages = resolveIntakeMarkdownProxy({
        buffer: Buffer.from("ignored"),
        fileName: "good-scan.pdf",
      });
      expect(pages).toHaveLength(1);
      expect(pages[0]!.markdown).toContain("JS-2024-001");
    });

    it("maps blurry-scan filename to blurry fixture", () => {
      const pages = resolveIntakeMarkdownProxy({
        buffer: Buffer.from("ignored"),
        fileName: "blurry-scan.jpg",
      });
      expect(pages).toHaveLength(1);
      expect(pages[0]!.markdown).toContain("|||ll11IIl|||");
    });

    it("maps buffer content markers without calling OCR", () => {
      const goodBuf = loadFixture("good-scan.md");
      const pages = resolveIntakeMarkdownProxy({
        buffer: goodBuf,
        fileName: "upload.bin",
      });
      expect(pages[0]!.markdown).toContain("ACME Corp");
      expect(extractTextFromBase64Mock).not.toHaveBeenCalled();
    });
  });

  describe("pixel detectors (pre-OCR)", () => {
    it("scores sharp scan high and blurry scan low", () => {
      const sharp = analyzeImageBuffer(makeSharpScanPng(), {
        mimeType: "image/png",
      });
      const blurry = analyzeImageBuffer(makeBlurryScanPng(), {
        mimeType: "image/png",
      });

      expect(sharp).not.toBeNull();
      expect(blurry).not.toBeNull();
      expect(sharp!.blurScore).toBeGreaterThan(blurry!.blurScore);
      expect(sharp!.overallScore).toBeGreaterThan(blurry!.overallScore);
      expect(blurry!.isBlurry).toBe(true);
      expect(sharp!.isBlurry).toBe(false);
    });

    it("returns null for PDF bytes (unsupported raster)", () => {
      const metrics = analyzeImageBuffer(Buffer.from("%PDF-1.4 fake"), {
        mimeType: "application/pdf",
      });
      expect(metrics).toBeNull();
    });

    it("is deterministic for the same PNG bytes", () => {
      const buf = makeSharpScanPng();
      const a = analyzeImageBuffer(buf, { mimeType: "image/png" });
      const b = analyzeImageBuffer(buf, { mimeType: "image/png" });
      expect(a).toEqual(b);
    });
  });

  describe("runIntakeGate (pixel path — no OCR)", () => {
    it("passes sharp PNG with score >= threshold and empty retakeFeedback", async () => {
      const buffer = makeSharpScanPng();
      const result = await runIntakeGate({
        buffer,
        fileName: "good-scan.png",
        mimeType: "image/png",
      });

      const threshold = getDefaultImageQaConfig().reviewQualityThreshold;
      expect(extractTextFromBase64Mock).not.toHaveBeenCalled();
      expect(result.ocrInvoked).toBe(false);
      expect(result.analysisMethod).toBe("pixel");
      expect(result.skipped).toBe(false);
      expect(result.passed).toBe(true);
      expect(result.qualityScore).not.toBeNull();
      expect(result.qualityScore!).toBeGreaterThanOrEqual(threshold);
      expect(result.retakeFeedback).toEqual([]);
      expect(result.grade).toMatch(/^[ABCDF]$/);
    });

    it("passes sharp JPEG without invoking OCR", async () => {
      const buffer = makeSharpScanJpeg();
      const result = await runIntakeGate({
        buffer,
        fileName: "good-scan.jpg",
        mimeType: "image/jpeg",
      });

      expect(extractTextFromBase64Mock).not.toHaveBeenCalled();
      expect(result.passed).toBe(true);
      expect(result.skipped).toBe(false);
      expect(result.analysisMethod).toBe("pixel");
      expect(result.ocrInvoked).toBe(false);
    });

    it("rejects blurry PNG with score < threshold and actionable retakeFeedback", async () => {
      const result = await runIntakeGate({
        buffer: makeBlurryScanPng(),
        fileName: "blurry-scan.png",
        mimeType: "image/png",
      });

      const threshold = getDefaultImageQaConfig().reviewQualityThreshold;
      expect(extractTextFromBase64Mock).not.toHaveBeenCalled();
      expect(result.ocrInvoked).toBe(false);
      expect(result.analysisMethod).toBe("pixel");
      expect(result.skipped).toBe(false);
      expect(result.passed).toBe(false);
      expect(result.qualityScore).not.toBeNull();
      expect(result.qualityScore!).toBeLessThan(threshold);
      expect(result.retakeFeedback.length).toBeGreaterThan(0);
      expect(
        result.retakeFeedback.some(m => /steady|focus|lighting|skew/i.test(m))
      ).toBe(true);
    });

    it("rejects overexposed washout without OCR", async () => {
      const result = await runIntakeGate({
        buffer: makeOverexposedPng(),
        fileName: "washout.png",
        mimeType: "image/png",
      });

      expect(extractTextFromBase64Mock).not.toHaveBeenCalled();
      expect(result.passed).toBe(false);
      expect(result.skipped).toBe(false);
      expect(result.retakeFeedback.length).toBeGreaterThan(0);
    });

    it("fail-opens on empty buffer (skipped:true, passed:true) without OCR outside fail-closed", async () => {
      const prevApp = process.env.APP_ENV;
      const prevNode = process.env.NODE_ENV;
      delete process.env.APP_ENV;
      process.env.NODE_ENV = "test";

      const result = await runIntakeGate({
        buffer: Buffer.alloc(0),
        fileName: "empty.pdf",
      });

      expect(result.passed).toBe(true);
      expect(result.skipped).toBe(true);
      expect(result.qualityScore).toBeNull();
      expect(result.retakeFeedback).toEqual([]);
      expect(result.error).toBeDefined();
      expect(result.ocrInvoked).toBe(false);
      expect(extractTextFromBase64Mock).not.toHaveBeenCalled();

      if (prevApp === undefined) delete process.env.APP_ENV;
      else process.env.APP_ENV = prevApp;
      process.env.NODE_ENV = prevNode;
    });

    it("fail-closes on empty buffer in production", async () => {
      const prevApp = process.env.APP_ENV;
      process.env.APP_ENV = "production";

      const result = await runIntakeGate({
        buffer: Buffer.alloc(0),
        fileName: "empty.pdf",
      });

      expect(result.passed).toBe(false);
      expect(result.skipped).toBe(false);
      expect(result.requiresReview).toBe(true);
      expect(result.retakeFeedback.length).toBeGreaterThan(0);
      expect(result.ocrInvoked).toBe(false);

      if (prevApp === undefined) delete process.env.APP_ENV;
      else process.env.APP_ENV = prevApp;
    });

    it("fail-opens on PDF without invoking OCR", async () => {
      const result = await runIntakeGate({
        buffer: Buffer.from("%PDF-1.4 binary-ish"),
        fileName: "sheet.pdf",
        mimeType: "application/pdf",
      });

      expect(extractTextFromBase64Mock).not.toHaveBeenCalled();
      expect(result.passed).toBe(true);
      expect(result.skipped).toBe(true);
      expect(result.analysisMethod).toBe("unsupported");
      expect(result.ocrInvoked).toBe(false);
      expect(result.error).toMatch(/no OCR|unsupported/i);
    });

    it("is deterministic for the same PNG buffer", async () => {
      const input = {
        buffer: makeBlurryScanPng(),
        fileName: "blurry-scan.png",
        mimeType: "image/png",
      };

      const a = await runIntakeGate(input);
      const b = await runIntakeGate(input);

      expect(a.qualityScore).toBe(b.qualityScore);
      expect(a.grade).toBe(b.grade);
      expect(a.passed).toBe(b.passed);
      expect(a.retakeFeedback).toEqual(b.retakeFeedback);
      expect(extractTextFromBase64Mock).not.toHaveBeenCalled();
    });
  });

  describe("buildRetakeFeedback", () => {
    it("maps quality flags to actionable messages in stable order", () => {
      const metrics: PageQualityMetrics[] = [
        {
          pageNumber: 1,
          overallScore: 20,
          blurScore: 10,
          contrastScore: 10,
          skewAngle: 12,
          brightnessScore: 15,
          isBlurry: true,
          isLowContrast: true,
          isSkewed: true,
          isOverexposed: false,
          isUnderexposed: true,
        },
      ];

      const feedback = buildRetakeFeedback(metrics);
      expect(feedback.length).toBe(4);
      expect(feedback[0]).toMatch(/steady|focus/i);
      expect(feedback[1]).toMatch(/lighting|glare/i);
      expect(feedback[2]).toMatch(/skew/i);
      expect(feedback[3]).toMatch(/Increase lighting/i);
    });

    it("returns empty array when no flags set", () => {
      const metrics: PageQualityMetrics[] = [
        {
          pageNumber: 1,
          overallScore: 90,
          blurScore: 90,
          contrastScore: 90,
          skewAngle: 0,
          brightnessScore: 70,
          isBlurry: false,
          isLowContrast: false,
          isSkewed: false,
          isOverexposed: false,
          isUnderexposed: false,
        },
      ];
      expect(buildRetakeFeedback(metrics)).toEqual([]);
    });
  });
});
