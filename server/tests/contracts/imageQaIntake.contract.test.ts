/**
 * Image QA Intake Gate Contract Tests
 *
 * Verifies upload-time quality scoring + retake feedback.
 * Production path OCRs the real buffer (mocked here); fixture proxy
 * remains covered as a test-only helper.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import type { OCRResult } from "../../services/ocr";

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
  type PageQualityMetrics,
} from "../../services/imageQa";

const FIXTURE_DIR = join(process.cwd(), "server/tests/fixtures/imageQa");

function loadFixture(name: string): Buffer {
  return readFileSync(join(FIXTURE_DIR, name));
}

function loadFixtureText(name: string): string {
  return readFileSync(join(FIXTURE_DIR, name), "utf8");
}

function mockOcrSuccess(markdown: string): OCRResult {
  return {
    success: true,
    pages: [{ pageNumber: 1, markdown }],
    totalPages: 1,
    model: "mock-ocr",
  };
}

describe("Image QA Intake Gate Contract Tests", () => {
  const prevFlag = process.env.FEATURE_IMAGE_QA_INTAKE;

  beforeEach(() => {
    process.env.FEATURE_IMAGE_QA_INTAKE = "true";
    extractTextFromBase64Mock.mockReset();
  });

  afterEach(() => {
    if (prevFlag === undefined) {
      delete process.env.FEATURE_IMAGE_QA_INTAKE;
    } else {
      process.env.FEATURE_IMAGE_QA_INTAKE = prevFlag;
    }
  });

  describe("feature flag", () => {
    it("defaults to disabled when unset", () => {
      delete process.env.FEATURE_IMAGE_QA_INTAKE;
      expect(isImageQaIntakeEnabled()).toBe(false);
    });

    it("enables when FEATURE_IMAGE_QA_INTAKE=true", () => {
      process.env.FEATURE_IMAGE_QA_INTAKE = "true";
      expect(isImageQaIntakeEnabled()).toBe(true);
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

  describe("runIntakeGate (OCR path)", () => {
    it("passes good OCR markdown with score >= threshold and empty retakeFeedback", async () => {
      const markdown = loadFixtureText("good-scan.md");
      extractTextFromBase64Mock.mockResolvedValue(mockOcrSuccess(markdown));

      const buffer = Buffer.from("fake-pdf-bytes");
      const result = await runIntakeGate({
        buffer,
        fileName: "good-scan.pdf",
        mimeType: "application/pdf",
      });

      expect(extractTextFromBase64Mock).toHaveBeenCalledWith(
        buffer.toString("base64"),
        "application/pdf"
      );

      const threshold = getDefaultImageQaConfig().reviewQualityThreshold;
      expect(result.skipped).toBe(false);
      expect(result.passed).toBe(true);
      expect(result.qualityScore).not.toBeNull();
      expect(result.qualityScore!).toBeGreaterThanOrEqual(threshold);
      expect(result.retakeFeedback).toEqual([]);
      expect(result.grade).toMatch(/^[ABCDF]$/);
    });

    it("rejects blurry OCR markdown with score < threshold and actionable retakeFeedback", async () => {
      const markdown = loadFixtureText("blurry-scan.md");
      extractTextFromBase64Mock.mockResolvedValue(mockOcrSuccess(markdown));

      const result = await runIntakeGate({
        buffer: Buffer.from("fake-image-bytes"),
        fileName: "blurry-scan.jpg",
        mimeType: "image/jpeg",
      });

      const threshold = getDefaultImageQaConfig().reviewQualityThreshold;
      expect(result.skipped).toBe(false);
      expect(result.passed).toBe(false);
      expect(result.qualityScore).not.toBeNull();
      expect(result.qualityScore!).toBeLessThan(threshold);
      expect(result.retakeFeedback.length).toBeGreaterThan(0);
      expect(
        result.retakeFeedback.some(m => /steady|focus|lighting|skew/i.test(m))
      ).toBe(true);
    });

    it("fail-opens on empty buffer (skipped:true, passed:true)", async () => {
      const result = await runIntakeGate({
        buffer: Buffer.alloc(0),
        fileName: "empty.pdf",
      });

      expect(result.passed).toBe(true);
      expect(result.skipped).toBe(true);
      expect(result.qualityScore).toBeNull();
      expect(result.retakeFeedback).toEqual([]);
      expect(result.error).toBeDefined();
      expect(extractTextFromBase64Mock).not.toHaveBeenCalled();
    });

    it("fail-opens when OCR throws", async () => {
      extractTextFromBase64Mock.mockRejectedValue(new Error("OCR unavailable"));

      const result = await runIntakeGate({
        buffer: Buffer.from("bytes"),
        fileName: "upload.pdf",
        mimeType: "application/pdf",
      });

      expect(result.passed).toBe(true);
      expect(result.skipped).toBe(true);
      expect(result.qualityScore).toBeNull();
      expect(result.error).toMatch(/OCR unavailable/);
    });

    it("fail-opens when OCR returns success:false", async () => {
      extractTextFromBase64Mock.mockResolvedValue({
        success: false,
        pages: [],
        totalPages: 0,
        model: "mock-ocr",
        error: "provider timeout",
      });

      const result = await runIntakeGate({
        buffer: Buffer.from("bytes"),
        fileName: "upload.pdf",
      });

      expect(result.passed).toBe(true);
      expect(result.skipped).toBe(true);
      expect(result.error).toMatch(/provider timeout|OCR extraction failed/);
    });

    it("is deterministic for the same OCR output", async () => {
      const markdown = loadFixtureText("blurry-scan.md");
      extractTextFromBase64Mock.mockResolvedValue(mockOcrSuccess(markdown));

      const input = {
        buffer: Buffer.from("same-bytes"),
        fileName: "blurry-scan.png",
        mimeType: "image/png",
      };

      const a = await runIntakeGate(input);
      const b = await runIntakeGate(input);

      expect(a.qualityScore).toBe(b.qualityScore);
      expect(a.grade).toBe(b.grade);
      expect(a.passed).toBe(b.passed);
      expect(a.retakeFeedback).toEqual(b.retakeFeedback);
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
