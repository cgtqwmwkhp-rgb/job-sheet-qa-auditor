import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getAiReadiness } from "./health";
import {
  geminiCircuitBreaker,
  mistralCircuitBreaker,
} from "../utils/resilience";

const healthEnvKeys = [
  "OCR_PROVIDER",
  "MISTRAL_API_KEY",
  "AZURE_DI_ENDPOINT",
  "AZURE_DI_KEY",
  "FEATURE_OCR_FAILOVER",
  "ENABLE_GEMINI_INSIGHTS",
  "GEMINI_API_KEY",
  "FEATURE_VLM_VERIFICATION",
  "ANTHROPIC_API_KEY",
] as const;

type HealthEnvKey = (typeof healthEnvKeys)[number];
let originalEnv: Partial<Record<HealthEnvKey, string | undefined>>;

function clearHealthEnv(): void {
  for (const key of healthEnvKeys) delete process.env[key];
}

describe("getAiReadiness", () => {
  beforeEach(() => {
    originalEnv = Object.fromEntries(
      healthEnvKeys.map(key => [key, process.env[key]])
    ) as Partial<Record<HealthEnvKey, string | undefined>>;
    clearHealthEnv();
    mistralCircuitBreaker.reset();
    geminiCircuitBreaker.reset();
  });

  afterEach(() => {
    clearHealthEnv();
    for (const key of healthEnvKeys) {
      const value = originalEnv[key];
      if (value !== undefined) process.env[key] = value;
    }
    mistralCircuitBreaker.reset();
    geminiCircuitBreaker.reset();
  });

  it("is degraded when the active OCR provider has no credentials", () => {
    process.env.OCR_PROVIDER = "mistral";

    const health = getAiReadiness();

    expect(health.status).toBe("degraded");
    expect(health.ocr).toMatchObject({
      provider: "mistral",
      status: "degraded",
      configured: false,
    });
    expect(health.ocr.reason).toContain("not configured");
  });

  it("reports mock OCR as ready and disabled optional providers", () => {
    process.env.OCR_PROVIDER = "mock";

    const health = getAiReadiness();

    expect(health.status).toBe("ready");
    expect(health.ocr).toMatchObject({
      provider: "mock",
      status: "ready",
      configured: true,
    });
    expect(health.gemini?.status).toBe("disabled");
    expect(health.vlm?.status).toBe("disabled");
  });

  it("is degraded when an enabled Gemini feature lacks credentials", () => {
    process.env.OCR_PROVIDER = "mock";
    process.env.ENABLE_GEMINI_INSIGHTS = "true";

    const health = getAiReadiness();

    expect(health.status).toBe("degraded");
    expect(health.gemini).toMatchObject({
      status: "degraded",
      configured: false,
    });
  });

  it("reports an open Mistral circuit as degraded", async () => {
    process.env.OCR_PROVIDER = "mistral";
    process.env.MISTRAL_API_KEY = "test-key";

    for (let attempt = 0; attempt < 3; attempt++) {
      await expect(
        mistralCircuitBreaker.execute(async () => {
          throw new Error("provider unavailable");
        })
      ).rejects.toThrow("provider unavailable");
    }

    const health = getAiReadiness();

    expect(health.status).toBe("degraded");
    expect(health.ocr).toMatchObject({
      status: "degraded",
      circuitBreaker: "OPEN",
    });
    expect(health.ocr.reason).toContain("circuit breaker is open");
  });
});
