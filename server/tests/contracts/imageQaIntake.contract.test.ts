/**
 * Image QA Intake Gate Contract Tests
 *
 * Verifies upload-time quality scoring + retake feedback.
 * Uses fixture markdown proxies only — no OCR adapter / live API calls.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
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

describe("Image QA Intake Gate Contract Tests", () => {
  const prevFlag = process.env.FEATURE_IMAGE_QA_INTAKE;

  beforeEach(() => {
    process.env.FEATURE_IMAGE_QA_INTAKE = "true";
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

  describe("markdown proxy (no OCR)", () => {
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
    });
  });

  describe("runIntakeGate", () => {
    it("passes good fixture with score >= threshold and empty retakeFeedback", () => {
      const buffer = loadFixture("good-scan.md");
      const result = runIntakeGate({
        buffer,
        fileName: "good-scan.pdf",
        mimeType: "application/pdf",
      });

      const threshold = getDefaultImageQaConfig().reviewQualityThreshold;
      expect(result.skipped).toBe(false);
      expect(result.passed).toBe(true);
      expect(result.qualityScore).not.toBeNull();
      expect(result.qualityScore!).toBeGreaterThanOrEqual(threshold);
      expect(result.retakeFeedback).toEqual([]);
      expect(result.grade).toMatch(/^[ABCDF]$/);
    });

    it("rejects blurry fixture with score < threshold and actionable retakeFeedback", () => {
      const buffer = loadFixture("blurry-scan.md");
      const result = runIntakeGate({
        buffer,
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

    it("fail-opens on empty buffer (skipped:true, passed:true)", () => {
      const result = runIntakeGate({
        buffer: Buffer.alloc(0),
        fileName: "empty.pdf",
      });

      expect(result.passed).toBe(true);
      expect(result.skipped).toBe(true);
      expect(result.qualityScore).toBeNull();
      expect(result.retakeFeedback).toEqual([]);
      expect(result.error).toBeDefined();
    });

    it("is deterministic for the same input", () => {
      const buffer = loadFixture("blurry-scan.md");
      const input = {
        buffer,
        fileName: "blurry-scan.png",
        mimeType: "image/png",
      };

      const a = runIntakeGate(input);
      const b = runIntakeGate(input);

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
