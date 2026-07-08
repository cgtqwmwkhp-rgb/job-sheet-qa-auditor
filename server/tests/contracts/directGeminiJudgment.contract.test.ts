/**
 * Direct Gemini Judgment Contract Tests (PR-6)
 *
 * Verifies:
 * - LLM_PROVIDER=mock returns fixture without network
 * - Zero fetch calls under mock
 * - No forge.manus.im in llm.ts
 * - Default judgment model is gemini-3.1-pro
 *
 * Mocks only — no live Gemini API calls.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import type { GoldSpec } from "../../services/analyzer";
import { resetMockLlm } from "../../_core/mockLlm";

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

describe("Direct Gemini Judgment Contract (PR-6)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    resetMockLlm();
    process.env.LLM_PROVIDER = "mock";
    process.env.GEMINI_API_KEY = "test-mock-key";
    process.env.JUDGMENT_MODEL = "gemini-3.1-pro";
    delete process.env.BUILT_IN_FORGE_API_KEY;
    delete process.env.APP_ENV;
    process.env.NODE_ENV = "test";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetMockLlm();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  describe("source structure", () => {
    it("llm.ts has no Forge proxy references", () => {
      const llmPath = path.resolve(__dirname, "../../_core/llm.ts");
      const llmContent = fs.readFileSync(llmPath, "utf-8");

      expect(llmContent).not.toContain("forge.manus.im");
      expect(llmContent).not.toContain("/v1/chat/completions");
      expect(llmContent).toContain("generativelanguage.googleapis.com");
      expect(llmContent).toContain("generateContent");
      expect(llmContent).toContain('LLM_PROVIDER === "mock"');
    });

    it("env.ts exposes geminiApiKey and judgmentModel default", () => {
      const envPath = path.resolve(__dirname, "../../_core/env.ts");
      const envContent = fs.readFileSync(envPath, "utf-8");

      expect(envContent).toContain("geminiApiKey");
      expect(envContent).toContain("judgmentModel");
      expect(envContent).toContain("gemini-3.1-pro");
    });

    it("judgment-pass fixture matches analyzer schema shape", () => {
      const fixturePath = path.resolve(
        __dirname,
        "../fixtures/gemini/judgment-pass.json"
      );
      const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));

      expect(fixture.overallResult).toBe("PASS");
      expect(typeof fixture.score).toBe("number");
      expect(Array.isArray(fixture.findings)).toBe(true);
      expect(fixture.extractedFields).toBeTypeOf("object");
      expect(typeof fixture.summary).toBe("string");
    });
  });

  describe("mock provider (zero network)", () => {
    it("invokeLLM under mock makes zero fetch calls", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      // Re-import after env is set so ENV picks up GEMINI_API_KEY
      vi.resetModules();
      const { invokeLLM } = await import("../../_core/llm");

      const result = await invokeLLM({
        messages: [{ role: "user", content: "Analyze this job sheet" }],
        responseFormat: {
          type: "json_schema",
          json_schema: {
            name: "job_sheet_analysis",
            schema: {
              type: "object",
              properties: {
                overallResult: { type: "string" },
                score: { type: "number" },
              },
            },
          },
        },
      });

      expect(fetchSpy).toHaveBeenCalledTimes(0);
      expect(result.choices[0]?.message?.content).toBeTruthy();
      const content = result.choices[0]!.message!.content as string;
      const parsed = JSON.parse(content);
      expect(parsed.overallResult).toBe("PASS");
      expect(parsed.score).toBe(92);
    });

    it("analyzeJobSheet with mock returns fixture PASS without fetch", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      vi.resetModules();
      const { analyzeJobSheet: analyze } = await import(
        "../../services/analyzer"
      );

      const result = await analyze(SAMPLE_TEXT, SAMPLE_SPEC, 1);

      expect(fetchSpy).toHaveBeenCalledTimes(0);
      expect(result.success).toBe(true);
      expect(result.overallResult).toBe("PASS");
      expect(result.score).toBe(92);
      expect(result.model).toBe("gemini-3.1-pro");
    });

    it("isLLMConfigured uses GEMINI_API_KEY not Forge", async () => {
      vi.resetModules();
      const { isLLMConfigured } = await import("../../_core/llm");
      expect(isLLMConfigured()).toBe(true);

      delete process.env.GEMINI_API_KEY;
      vi.resetModules();
      const { isLLMConfigured: isConfiguredNoKey } = await import(
        "../../_core/llm"
      );
      expect(isConfiguredNoKey()).toBe(false);
    });
  });
});
