/**
 * Azure Document Intelligence fallback + cross-check (Phase 1.8).
 * Mocks only — no live Azure / Mistral HTTP.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import {
  createMockAdapter,
  createMockAzureDiAdapter,
  createResilientOcrAdapter,
  FEATURE_OCR_CROSS_CHECK,
  FEATURE_OCR_FAILOVER,
  getOCRConfig,
  getOCREngineVersion,
  ocrResilienceReportFields,
  parseAzureDiResponse,
  resetMockAdapter,
  resetMockAzureDiAdapter,
  type OCRConfig,
  type OCRResult,
} from "../../services/ocrAdapter";
import { checkLoggingSafety } from "../../utils/safeLogger";

const __dirname = dirname(fileURLToPath(import.meta.url));
const azureFixture = JSON.parse(
  readFileSync(
    join(__dirname, "../fixtures/azure-di-read-v4-response.json"),
    "utf8"
  )
);

function testConfig(overrides: Partial<OCRConfig> = {}): OCRConfig {
  return {
    provider: "mock",
    model: "mock-ocr-v1",
    maxRetries: 1,
    baseDelayMs: 1,
    maxDelayMs: 1,
    deepFeaturesEnabled: false,
    confidenceGranularity: "none",
    failoverEnabled: true,
    fallbackProvider: "azure",
    crossCheckSampleRate: 0,
    azureModel: "prebuilt-read",
    azureApiVersion: "2024-11-30",
    ...overrides,
  };
}

describe("Azure DI Fallback Contract (Phase 1.8, mocks only)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    resetMockAdapter();
    resetMockAzureDiAdapter();
    delete process.env[FEATURE_OCR_FAILOVER];
    delete process.env[FEATURE_OCR_CROSS_CHECK];
    delete process.env.OCR_CROSS_CHECK_PERCENT;
    delete process.env.OCR_PROVIDER;
    delete process.env.OCR_FALLBACK_PROVIDER;
    delete process.env.MISTRAL_API_KEY;
    delete process.env.AZURE_DI_KEY;
    delete process.env.AZURE_DI_ENDPOINT;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetMockAdapter();
    resetMockAzureDiAdapter();
  });

  it("defaults Phase 1.8 failover and cross-check flags to off", async () => {
    process.env.OCR_PROVIDER = "mock";

    const config = getOCRConfig();
    expect(config.failoverEnabled).toBe(false);
    expect(config.crossCheckSampleRate).toBe(0);

    const { getOCRAdapter } = await import("../../services/ocrAdapter");
    const adapter = getOCRAdapter();
    expect(adapter.providerName).toBe("mock");

    const result = await adapter.extractFromUrl("mock://doc.pdf");
    expect(result.success).toBe(true);
    expect(result.failover).toBeUndefined();
    expect(result.crossCheck).toBeUndefined();
  });

  it("uses 5 percent cross-check sample when FEATURE_OCR_CROSS_CHECK is enabled", () => {
    process.env[FEATURE_OCR_CROSS_CHECK] = "true";
    const config = getOCRConfig();
    expect(config.failoverEnabled).toBe(false);
    expect(config.crossCheckSampleRate).toBe(0.05);
  });

  it("honours OCR_CROSS_CHECK_PERCENT only behind FEATURE_OCR_CROSS_CHECK", () => {
    process.env.OCR_CROSS_CHECK_PERCENT = "25";
    expect(getOCRConfig().crossCheckSampleRate).toBe(0);

    process.env[FEATURE_OCR_CROSS_CHECK] = "true";
    expect(getOCRConfig().crossCheckSampleRate).toBe(0.25);
  });

  it("primary mock fails → fallback mock succeeds; engine version reflects fallback", async () => {
    const primary = createMockAdapter();
    primary.setShouldFail(true);
    const fallback = createMockAzureDiAdapter();
    fallback.setMockResponse("default");

    const adapter = createResilientOcrAdapter(primary, fallback, testConfig());
    const result = await adapter.extractFromUrl("mock://doc.pdf");

    expect(result.success).toBe(true);
    expect(result.provider).toBe("azure");
    expect(result.model).toBe("prebuilt-read");
    expect(result.failover?.used).toBe(true);
    expect(result.failover?.primaryProvider).toBe("mock");
    expect(result.failover?.fallbackProvider).toBe("azure");
    expect(result.pages[0].markdown).toContain("Job Sheet");

    const engine = getOCREngineVersion(
      result.model,
      testConfig(),
      result.provider
    );
    expect(engine).toBe("azure/prebuilt-read");
    expect(engine.length).toBeLessThanOrEqual(32);
  });

  it("both fail → success false, empty pages, structured errorCode", async () => {
    const primary = createMockAdapter();
    primary.setShouldFail(true);
    const fallback = createMockAzureDiAdapter();
    fallback.setShouldFail(true);

    const adapter = createResilientOcrAdapter(primary, fallback, testConfig());
    const result = await adapter.extractFromUrl("mock://doc.pdf");

    expect(result.success).toBe(false);
    expect(result.pages).toEqual([]);
    expect(result.totalPages).toBe(0);
    expect(result.errorCode).toBeDefined();
    expect(result.error).toBeDefined();
    expect(result.failover?.used).toBe(true);
  });

  it("cross-check sample rate 1.0 agreeing fixtures → agreement true", async () => {
    const primary = createMockAdapter();
    primary.setMockResponse("default");
    const fallback = createMockAzureDiAdapter();
    fallback.setMockResponse("default");

    const adapter = createResilientOcrAdapter(
      primary,
      fallback,
      testConfig({ crossCheckSampleRate: 1 })
    );
    const result = await adapter.extractFromUrl("mock://agree.pdf");

    expect(result.success).toBe(true);
    expect(result.provider).toBe("mock");
    expect(result.crossCheck?.sampled).toBe(true);
    expect(result.crossCheck?.agreement).toBe(true);
    expect(result.pages[0].markdown).toContain("JS-2024-001");
    // Canonical pages remain primary
    expect(result.model).toBe("mock-ocr-v1");
  });

  it("cross-check disagreeing fixtures → agreement false; canonical pages from primary", async () => {
    const primary = createMockAdapter();
    primary.setMockResponse("default");
    const fallback = createMockAzureDiAdapter();
    fallback.setMockResponse("disagree");

    const adapter = createResilientOcrAdapter(
      primary,
      fallback,
      testConfig({ crossCheckSampleRate: 1 })
    );
    const result = await adapter.extractFromUrl("mock://disagree.pdf");

    expect(result.success).toBe(true);
    expect(result.crossCheck?.sampled).toBe(true);
    expect(result.crossCheck?.agreement).toBe(false);
    expect(result.crossCheck?.disagreementReason).toBeDefined();
    expect(result.model).toBe("mock-ocr-v1");
    expect(result.pages[0].markdown).toContain("JS-2024-001");
    expect(result.pages[0].markdown).not.toContain("TOTALLY DIFFERENT");
  });

  it("parseAzureDiResponse maps fixture to valid OCRPage[]", () => {
    const parsed = parseAzureDiResponse(azureFixture);
    expect(parsed.pages.length).toBeGreaterThan(0);
    expect(parsed.pages[0].pageNumber).toBe(1);
    expect(typeof parsed.pages[0].markdown).toBe("string");
    expect(parsed.pages[0].markdown.length).toBeGreaterThan(0);
  });

  it("provider artifact is logging-safe (no raw OCR text)", async () => {
    const primary = createMockAdapter();
    const fallback = createMockAzureDiAdapter();
    const adapter = createResilientOcrAdapter(primary, fallback, testConfig());
    const result = await adapter.extractFromUrl("mock://doc.pdf");
    const artifact = adapter.getProviderArtifact(result);

    expect(
      checkLoggingSafety(artifact as unknown as Record<string, unknown>)
    ).toEqual([]);
    expect(artifact).not.toHaveProperty("markdown");
    expect(artifact).not.toHaveProperty("pages");
  });

  it("ocrResilienceReportFields only stamps when present", () => {
    const bare: OCRResult = {
      success: true,
      pages: [{ pageNumber: 1, markdown: "x" }],
      totalPages: 1,
      model: "mock-ocr-v1",
    };
    expect(ocrResilienceReportFields(bare)).toEqual({});

    const withMeta: OCRResult = {
      ...bare,
      crossCheck: {
        sampled: true,
        agreement: true,
        primaryProvider: "mock",
        fallbackProvider: "azure",
      },
      failover: {
        used: true,
        primaryProvider: "mock",
        fallbackProvider: "azure",
      },
    };
    const fields = ocrResilienceReportFields(withMeta);
    expect(fields.crossCheck).toBeDefined();
    expect(fields.failover).toBeDefined();
    expect(checkLoggingSafety(fields)).toEqual([]);
  });

  it("failover disabled leaves primary-only path (no wrap side effects)", async () => {
    process.env.OCR_PROVIDER = "mock";
    process.env[FEATURE_OCR_FAILOVER] = "false";
    const { getOCRAdapter } = await import("../../services/ocrAdapter");
    const adapter = getOCRAdapter();
    expect(adapter.providerName).toBe("mock");
    const result = await adapter.extractFromUrl("mock://doc.pdf");
    expect(result.success).toBe(true);
    expect(result.failover).toBeUndefined();
    expect(result.crossCheck).toBeUndefined();
  });

  it("does not use mock Azure for live primary when Azure is unconfigured", async () => {
    process.env.OCR_PROVIDER = "mistral";
    process.env[FEATURE_OCR_FAILOVER] = "true";
    delete process.env.MISTRAL_API_KEY;
    delete process.env.AZURE_DI_ENDPOINT;
    delete process.env.AZURE_DI_KEY;

    const { getOCRAdapter } = await import("../../services/ocrAdapter");
    const adapter = getOCRAdapter();
    const result = await adapter.extractFromUrl("https://example.com/doc.pdf", {
      skipRetry: true,
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("CONFIG_ERROR");
    expect(result.failover?.used).toBe(true);
    expect(result.failover?.fallbackErrorCode).toBe("AZURE_DI_NOT_CONFIGURED");
    expect(result.pages).toEqual([]);
  });
});
