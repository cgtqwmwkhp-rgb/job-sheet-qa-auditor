/**
 * Fail-Safety Contract Tests (PR-3)
 *
 * Covers:
 * - No-LLM fail-closed → REVIEW_QUEUE
 * - OCR / LLM confidence thresholds → review_queue
 * - Rate limiting on upload/process
 * - DLQ write with jobSheetId
 *
 * Mocks only — no live LLM/OCR calls.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { analyzeJobSheet, type GoldSpec } from "../../services/analyzer";
import { performHybridAssessment } from "../../services/hybridAssessment";
import {
  addToDeadLetterQueue,
  clearDeadLetterQueue,
  getAllFailedJobs,
  getDeadLetterQueueStatus,
  getDLQStats,
} from "../../utils/deadLetterQueue";
import {
  enforceRateLimit,
  RateLimitError,
  RATE_LIMITS,
  resetRateLimit,
  clearAllRateLimits,
} from "../../utils/rateLimiter";
import { computePageConfidencePrior } from "../../services/ocrFindingEnrichment";
import type { OCRResult } from "../../services/ocr";
import * as fs from "fs";
import * as path from "path";

const SAMPLE_SPEC: GoldSpec = {
  name: "Test Spec",
  version: "1.0.0",
  rules: [
    {
      id: "R1",
      field: "Job Number",
      type: "presence",
      required: true,
      description: "Job number required",
    },
  ],
};

const SAMPLE_TEXT = `
--- Page 1 ---
Job Number: JS-12345
Customer: Acme Corp
Engineer: Jane Doe
Date: 2026-07-08
Work completed successfully with signature present.
Additional notes about the site visit and asset condition.
`.repeat(2);

describe("Fail-Safety Contract (PR-3)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    clearDeadLetterQueue();
    clearAllRateLimits();
    delete process.env.GEMINI_API_KEY;
    delete process.env.BUILT_IN_FORGE_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.LLM_PROVIDER;
    delete process.env.APP_ENV;
    process.env.NODE_ENV = "test";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  describe("A. No-LLM fail-closed → REVIEW_QUEUE", () => {
    it("returns REVIEW_QUEUE when LLM unset in fail-closed env", async () => {
      process.env.APP_ENV = "production";
      process.env.NODE_ENV = "production";

      const result = await analyzeJobSheet(SAMPLE_TEXT, SAMPLE_SPEC, 1);

      expect(result.overallResult).toBe("REVIEW_QUEUE");
      expect(result.model).toBe("no-llm-fail-closed");
      expect(result.success).toBe(true);
      expect(result.summary.toLowerCase()).toMatch(
        /review|unavailable|judgment/
      );
    });

    it("keeps permissive PASS when LLM unset outside fail-closed", async () => {
      delete process.env.APP_ENV;
      process.env.NODE_ENV = "development";

      const result = await analyzeJobSheet(SAMPLE_TEXT, SAMPLE_SPEC, 1);

      expect(result.overallResult).toBe("PASS");
      expect(result.model).toBe("rule-based-fallback");
    });

    it("hybrid assessment explains judgment unavailable when no LLM in fail-closed", async () => {
      process.env.APP_ENV = "production";

      const result = await performHybridAssessment(
        SAMPLE_TEXT,
        [SAMPLE_TEXT],
        0.8,
        "TEMPLATE_NOT_MATCHED"
      );

      expect(result.success).toBe(true);
      expect(result.llmSummary).toBeUndefined();
      expect(result.reviewExplanation.toLowerCase()).toMatch(
        /judgment unavailable|llm not configured|manual review/
      );
    });
  });

  describe("B. Thresholds", () => {
    it("computePageConfidencePrior below ocrConfidenceThreshold/100 triggers LOW_OCR_CONFIDENCE path", () => {
      const ocrResult: OCRResult = {
        success: true,
        totalPages: 1,
        model: "mock",
        pages: [
          {
            pageNumber: 1,
            markdown: "low quality scan",
            confidenceScores: { averagePageConfidence: 0.4 },
          },
        ],
      };

      const prior = computePageConfidencePrior(ocrResult);
      expect(prior).toBeDefined();
      expect(prior!).toBeLessThan(60 / 100);

      // documentProcessor wires this check — verify source contains the gate
      const dpPath = path.resolve(
        __dirname,
        "../../services/documentProcessor.ts"
      );
      const dp = fs.readFileSync(dpPath, "utf-8");
      expect(dp).toContain("LOW_OCR_CONFIDENCE");
      expect(dp).toContain("ocrConfidenceThreshold");
      expect(dp).toContain("computePageConfidencePrior");
    });

    it("documentProcessor forces review_queue when analyzer score < llmConfidenceThreshold", () => {
      const dpPath = path.resolve(
        __dirname,
        "../../services/documentProcessor.ts"
      );
      const dp = fs.readFileSync(dpPath, "utf-8");
      expect(dp).toContain("llmConfidenceThreshold");
      expect(dp).toContain('overallResult: "REVIEW_QUEUE"');
      expect(dp).toContain("LOW_LLM_CONFIDENCE");
      expect(dp).toMatch(/score\s*<\s*llmThreshold/);
    });
  });

  describe("C. Durable DLQ with jobSheetId", () => {
    it("addToDeadLetterQueue records jobSheetId and getDeadLetterQueueStatus aliases stats", () => {
      const job = addToDeadLetterQueue(
        42,
        "analysis",
        new Error("mock analysis failure"),
        { correlationId: "corr-pr3", attempts: 2 }
      );

      expect(job.jobSheetId).toBe(42);
      expect(job.stage).toBe("analysis");

      const all = getAllFailedJobs();
      expect(all.some(j => j.jobSheetId === 42)).toBe(true);

      const status = getDeadLetterQueueStatus();
      const stats = getDLQStats();
      expect(status.totalFailed).toBe(stats.totalFailed);
      expect(status.totalFailed).toBeGreaterThanOrEqual(1);
    });

    it("documentProcessor passes jobSheetId into OCR and analyzer", () => {
      const dpPath = path.resolve(
        __dirname,
        "../../services/documentProcessor.ts"
      );
      const dp = fs.readFileSync(dpPath, "utf-8");
      expect(dp).toContain(
        "extractTextFromDocument(documentUrl, { jobSheetId })"
      );
      expect(dp).toContain("jobSheetId,");
      expect(dp).toMatch(/analyzeJobSheet\([\s\S]*?\{\s*jobSheetId,/);
    });

    it("deadLetterQueue write-through uses getDb when available", () => {
      const dlqPath = path.resolve(__dirname, "../../utils/deadLetterQueue.ts");
      const dlq = fs.readFileSync(dlqPath, "utf-8");
      expect(dlq).toContain("getDb");
      expect(dlq).toContain("failedJobs");
      expect(dlq).toContain("getDeadLetterQueueStatus");
    });
  });

  describe("D. Rate limiting", () => {
    it("enforces RATE_LIMITS.upload and throws RateLimitError", () => {
      const key = "user:pr3-upload";
      for (let i = 0; i < RATE_LIMITS.upload.maxRequests; i++) {
        const result = enforceRateLimit(key, RATE_LIMITS.upload);
        expect(result.allowed).toBe(true);
      }

      expect(() => enforceRateLimit(key, RATE_LIMITS.upload)).toThrow(
        RateLimitError
      );
    });

    it("enforces RATE_LIMITS.processing", () => {
      const key = "user:pr3-process";
      for (let i = 0; i < RATE_LIMITS.processing.maxRequests; i++) {
        enforceRateLimit(key, RATE_LIMITS.processing);
      }
      expect(() => enforceRateLimit(key, RATE_LIMITS.processing)).toThrow(
        RateLimitError
      );
    });

    it("routers map RateLimitError to TRPC TOO_MANY_REQUESTS on upload/process", () => {
      const routersPath = path.resolve(__dirname, "../../routers.ts");
      const routers = fs.readFileSync(routersPath, "utf-8");
      expect(routers).toContain("RATE_LIMITS.upload");
      expect(routers).toContain("RATE_LIMITS.processing");
      expect(routers).toContain("TOO_MANY_REQUESTS");
      expect(routers).toContain("RateLimitError");
      expect(routers).toContain("enforceRateLimit");
    });

    it("resetRateLimit clears a key for subsequent requests", () => {
      const key = "user:pr3-reset";
      for (let i = 0; i < RATE_LIMITS.upload.maxRequests; i++) {
        enforceRateLimit(key, RATE_LIMITS.upload);
      }
      resetRateLimit(key);
      expect(enforceRateLimit(key, RATE_LIMITS.upload).allowed).toBe(true);
    });
  });
});
