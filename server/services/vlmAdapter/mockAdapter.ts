/**
 * Deterministic mock VLM for CI / local (no network, no secrets).
 */

import type {
  VlmAdapter,
  VlmVerifyInput,
  VlmVerificationResult,
} from "./types";

export class MockVlmAdapter implements VlmAdapter {
  readonly providerName = "mock" as const;
  readonly modelId = "mock-vlm-v1";

  private shouldFail = false;

  setShouldFail(fail: boolean): void {
    this.shouldFail = fail;
  }

  async verify(input: VlmVerifyInput): Promise<VlmVerificationResult> {
    const start = Date.now();
    if (this.shouldFail) {
      return {
        success: false,
        present: false,
        confidence: 0,
        reasoning: "mock failure",
        provider: "mock",
        model: this.modelId,
        processingTimeMs: Date.now() - start,
        error: "MOCK_VLM_FAILURE",
      };
    }

    // Deterministic: signature fields pass; tickboxes pass unless dispute says missing
    const dispute = (input.disputeReason || "").toLowerCase();
    const forcedMissing =
      dispute.includes("missing") || dispute.includes("absent");
    const present = !forcedMissing;
    const confidence = present ? 0.91 : 0.22;

    return {
      success: true,
      present,
      confidence,
      reasoning: `mock ${input.checkType} for ${input.fieldId}: present=${present}`,
      provider: "mock",
      model: this.modelId,
      processingTimeMs: Date.now() - start,
    };
  }
}

let singleton: MockVlmAdapter | null = null;

export function getMockVlmAdapter(): MockVlmAdapter {
  if (!singleton) singleton = new MockVlmAdapter();
  return singleton;
}
