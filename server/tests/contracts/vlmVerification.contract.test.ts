/**
 * VLM Verification Contract Tests — Phase 2.5 / PR-7
 * Mock provider only; no network.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getMockVlmAdapter,
  getVlmAdapter,
  getVlmConfig,
  isVlmVerificationEnabled,
} from "../../services/vlmAdapter";
import { runImageQa } from "../../services/roiProcessor";
import type { RoiRegion } from "../../services/templateRegistry/types";

const roi: RoiRegion = {
  name: "signatureBlock",
  page: 1,
  bounds: { x: 0, y: 0.85, width: 1, height: 0.15 },
};

const tinyPngBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("VLM Verification — Phase 2.5", () => {
  const envKeys = [
    "FEATURE_VLM_VERIFICATION",
    "VLM_PROVIDER",
    "ANTHROPIC_API_KEY",
    "VLM_CONFIDENCE_THRESHOLD",
  ] as const;
  const prev: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of envKeys) {
      prev[k] = process.env[k];
    }
    process.env.FEATURE_VLM_VERIFICATION = "true";
    process.env.VLM_PROVIDER = "mock";
    delete process.env.ANTHROPIC_API_KEY;
    getMockVlmAdapter().setShouldFail(false);
  });

  afterEach(() => {
    for (const k of envKeys) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
    getMockVlmAdapter().setShouldFail(false);
  });

  it("is disabled by default when flag unset", () => {
    delete process.env.FEATURE_VLM_VERIFICATION;
    expect(isVlmVerificationEnabled()).toBe(false);
  });

  it("uses mock adapter when VLM_PROVIDER=mock", async () => {
    const adapter = getVlmAdapter();
    expect(adapter.providerName).toBe("mock");
    const result = await adapter.verify({
      fieldId: "signatureBlock",
      checkType: "signature_present",
      cropImage: {
        data: tinyPngBase64,
        mediaType: "image/png",
        encoding: "base64",
      },
    });
    expect(result.success).toBe(true);
    expect(result.present).toBe(true);
    expect(result.provider).toBe("mock");
  });

  it("runImageQa returns unavailable (not fake 0.88) when flag off and not disputed", async () => {
    process.env.FEATURE_VLM_VERIFICATION = "false";
    const result = await runImageQa(roi, "signatureBlock", {
      cropImage: {
        data: tinyPngBase64,
        mediaType: "image/png",
      },
    });
    expect(result.vlmUsed).toBe(false);
    expect(result.available).toBe(false);
    expect(result.passed).toBe(false);
    expect(result.confidence).toBe(0);
    expect(result.confidence).not.toBe(0.88);
    expect(result.details).toMatch(/unavailable/i);
  });

  it("runImageQa fail-closed: disputed + VLM off → passed:false", async () => {
    process.env.FEATURE_VLM_VERIFICATION = "false";
    const result = await runImageQa(roi, "signatureBlock", {
      cropImage: {
        data: tinyPngBase64,
        mediaType: "image/png",
      },
      disputed: true,
    });
    expect(result.vlmUsed).toBe(false);
    expect(result.available).toBe(true);
    expect(result.passed).toBe(false);
    expect(result.confidence).toBe(0);
    expect(result.details).toMatch(/disputed.*VLM.*off/i);
  });

  it("runImageQa uses VLM for disputed crop when enabled", async () => {
    const result = await runImageQa(roi, "signatureBlock", {
      cropImage: {
        data: tinyPngBase64,
        mediaType: "image/png",
      },
      disputed: true,
    });
    expect(result.vlmUsed).toBe(true);
    expect(result.available).toBe(true);
    expect(result.vlmProvider).toBe("mock");
    expect(result.passed).toBe(true);
  });

  it("runImageQa uses VLM with PDF document when crop missing", async () => {
    const result = await runImageQa(roi, "signatureBlock", {
      documentPdf: {
        data: Buffer.from("%PDF-1.4 mock").toString("base64"),
        mediaType: "application/pdf",
        encoding: "base64",
      },
      disputed: true,
      disputeReason: "ink not in OCR",
    });
    expect(result.vlmUsed).toBe(true);
    expect(result.available).toBe(true);
    expect(result.vlmProvider).toBe("mock");
    expect(result.passed).toBe(true);
  });

  it("fail-soft: VLM failure returns unavailable (not stub pass)", async () => {
    getMockVlmAdapter().setShouldFail(true);
    const result = await runImageQa(roi, "tickboxBlock", {
      cropImage: {
        data: tinyPngBase64,
        mediaType: "image/png",
      },
      disputed: true,
      disputeReason: "conflict",
    });
    expect(result.vlmUsed).toBe(false);
    expect(result.available).toBe(false);
    expect(result.passed).toBe(false);
    expect(result.confidence).toBe(0);
    expect(result.confidence).not.toBe(0.88);
    expect(result.details).toMatch(/unavailable.*fail-soft/i);
  });

  it("respects max crops config default", () => {
    expect(getVlmConfig().maxCropsPerDoc).toBeGreaterThanOrEqual(1);
  });
});
