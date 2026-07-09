/**
 * Model Registry Contract Tests (PR-9)
 *
 * Verifies env-driven pinned models for ocr / judgment / interpreter /
 * fallback_ocr / vlm_verification roles, currency metadata, and that no live API calls occur.
 * Mocks only — no network.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("Model Registry Contract (PR-9)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    delete process.env.OCR_PROVIDER;
    delete process.env.MISTRAL_OCR_MODEL;
    delete process.env.JUDGMENT_MODEL;
    delete process.env.GEMINI_MODEL;
    delete process.env.OCR_FALLBACK_PROVIDER;
    delete process.env.AZURE_DI_MODEL;
    delete process.env.VLM_PROVIDER;
    delete process.env.ANTHROPIC_VLM_MODEL;
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
    vi.resetModules();
  });

  describe("source structure", () => {
    it("modelRegistry module exists with getModelRegistry export", () => {
      const indexPath = path.resolve(
        __dirname,
        "../../services/modelRegistry/index.ts"
      );
      const typesPath = path.resolve(
        __dirname,
        "../../services/modelRegistry/types.ts"
      );
      expect(fs.existsSync(indexPath)).toBe(true);
      expect(fs.existsSync(typesPath)).toBe(true);

      const content = fs.readFileSync(indexPath, "utf-8");
      expect(content).toContain("export function getModelRegistry");
      expect(content).not.toMatch(/fetch\s*\(/);
      expect(content).not.toContain("https://");
    });

    it("systemRouter exposes modelCurrency endpoint", () => {
      const routerPath = path.resolve(__dirname, "../../_core/systemRouter.ts");
      const content = fs.readFileSync(routerPath, "utf-8");
      expect(content).toContain("modelCurrency");
      expect(content).toContain("getModelRegistry");
    });
  });

  describe("getModelRegistry defaults", () => {
    it("returns pinned defaults when env unset", async () => {
      const { getModelRegistry } = await import("../../services/modelRegistry");
      const fixed = new Date("2026-07-09T00:00:00.000Z");
      const registry = getModelRegistry(fixed);

      expect(registry.roles.ocr.role).toBe("ocr");
      expect(registry.roles.ocr.provider).toBe("mistral");
      expect(registry.roles.ocr.model).toBe("mistral-ocr-4-0");

      expect(registry.roles.judgment.role).toBe("judgment");
      expect(registry.roles.judgment.provider).toBe("gemini");
      expect(registry.roles.judgment.model).toBe("gemini-3.1-pro");

      expect(registry.roles.interpreter.role).toBe("interpreter");
      expect(registry.roles.interpreter.provider).toBe("gemini");
      expect(registry.roles.interpreter.model).toBe("gemini-2.5-pro");

      expect(registry.roles.fallback_ocr).toBeDefined();
      expect(registry.roles.fallback_ocr?.provider).toBe("azure");
      expect(registry.roles.fallback_ocr?.model).toBe("prebuilt-read");

      expect(registry.roles.vlm_verification?.role).toBe("vlm_verification");
      expect(registry.roles.vlm_verification?.provider).toBe("mock");
      expect(registry.roles.vlm_verification?.model).toBe(
        "claude-3-5-sonnet-20241022"
      );

      expect(registry.currency.source).toBe("env");
      expect(registry.currency.lastChecked).toBe("2026-07-09T00:00:00.000Z");
    });

    it("does not include secrets in registry snapshot", async () => {
      process.env.MISTRAL_API_KEY = "sk-secret-mistral";
      process.env.GEMINI_API_KEY = "sk-secret-gemini";
      process.env.AZURE_DI_KEY = "sk-secret-azure";
      process.env.ANTHROPIC_API_KEY = "sk-secret-anthropic";

      const { getModelRegistry } = await import("../../services/modelRegistry");
      const registry = getModelRegistry();
      const json = JSON.stringify(registry);

      expect(json).not.toContain("sk-secret");
      expect(json).not.toContain("API_KEY");
      expect(json).not.toContain("apiKey");
    });
  });

  describe("env-driven overrides", () => {
    it("honours OCR_PROVIDER and MISTRAL_OCR_MODEL", async () => {
      process.env.OCR_PROVIDER = "mock";
      process.env.MISTRAL_OCR_MODEL = "mistral-ocr-2503";

      const { getModelRegistry } = await import("../../services/modelRegistry");
      const registry = getModelRegistry();

      expect(registry.roles.ocr.provider).toBe("mock");
      expect(registry.roles.ocr.model).toBe("mistral-ocr-2503");
    });

    it("honours JUDGMENT_MODEL", async () => {
      process.env.JUDGMENT_MODEL = "gemini-2.0-flash";

      const { getModelRegistry } = await import("../../services/modelRegistry");
      const registry = getModelRegistry();

      expect(registry.roles.judgment.model).toBe("gemini-2.0-flash");
    });

    it("honours GEMINI_MODEL for interpreter", async () => {
      process.env.GEMINI_MODEL = "gemini-2.0-flash-exp";

      const { getModelRegistry } = await import("../../services/modelRegistry");
      const registry = getModelRegistry();

      expect(registry.roles.interpreter.model).toBe("gemini-2.0-flash-exp");
    });

    it("honours OCR_FALLBACK_PROVIDER and AZURE_DI_MODEL", async () => {
      process.env.OCR_FALLBACK_PROVIDER = "azure";
      process.env.AZURE_DI_MODEL = "prebuilt-layout";

      const { getModelRegistry } = await import("../../services/modelRegistry");
      const registry = getModelRegistry();

      expect(registry.roles.fallback_ocr?.provider).toBe("azure");
      expect(registry.roles.fallback_ocr?.model).toBe("prebuilt-layout");
    });

    it("honours VLM_PROVIDER and ANTHROPIC_VLM_MODEL", async () => {
      process.env.VLM_PROVIDER = "anthropic";
      process.env.ANTHROPIC_VLM_MODEL = "claude-3-7-sonnet-20250219";

      const { getModelRegistry } = await import("../../services/modelRegistry");
      const registry = getModelRegistry();

      expect(registry.roles.vlm_verification?.provider).toBe("anthropic");
      expect(registry.roles.vlm_verification?.model).toBe(
        "claude-3-7-sonnet-20250219"
      );
    });
  });

  describe("modelRegistryStamp", () => {
    it("returns compact provider/model map", async () => {
      process.env.OCR_PROVIDER = "mistral";
      process.env.MISTRAL_OCR_MODEL = "mistral-ocr-4-0";
      process.env.JUDGMENT_MODEL = "gemini-3.1-pro";
      process.env.GEMINI_MODEL = "gemini-2.5-pro";

      const { getModelRegistry, modelRegistryStamp } = await import(
        "../../services/modelRegistry"
      );
      const stamp = modelRegistryStamp(getModelRegistry());

      expect(stamp.ocr).toBe("mistral/mistral-ocr-4-0");
      expect(stamp.judgment).toBe("gemini/gemini-3.1-pro");
      expect(stamp.interpreter).toBe("gemini/gemini-2.5-pro");
      expect(stamp.fallback_ocr).toMatch(/^azure\//);
      expect(stamp.vlm_verification).toBe("mock/claude-3-5-sonnet-20241022");
    });
  });

  describe("system.modelCurrency endpoint", () => {
    it("returns registry via tRPC caller without network", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      process.env.OCR_PROVIDER = "mock";
      process.env.MISTRAL_OCR_MODEL = "mock-ocr-v1";
      process.env.JUDGMENT_MODEL = "gemini-3.1-pro";
      process.env.GEMINI_MODEL = "gemini-2.5-pro";

      const { systemRouter } = await import("../../_core/systemRouter");
      const caller = systemRouter.createCaller({});
      const result = await caller.modelCurrency();

      expect(result.roles.ocr.provider).toBe("mock");
      expect(result.roles.ocr.model).toBe("mock-ocr-v1");
      expect(result.roles.judgment.model).toBe("gemini-3.1-pro");
      expect(result.currency.source).toBe("env");
      expect(typeof result.currency.lastChecked).toBe("string");
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe("no live API calls", () => {
    it("getModelRegistry never invokes fetch", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      const { getModelRegistry } = await import("../../services/modelRegistry");

      getModelRegistry();
      getModelRegistry(new Date());

      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});
