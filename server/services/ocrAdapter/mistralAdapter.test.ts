import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MistralOCRAdapter,
  resetOCRCircuitBreaker,
} from "./mistralAdapter";
import { TIMEOUT_CONFIG } from "../../utils/timeout";

describe("MistralOCRAdapter request timeout", () => {
  afterEach(() => {
    resetOCRCircuitBreaker();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("actively aborts a stalled Mistral fetch when the OCR timeout expires", async () => {
    vi.useFakeTimers();

    let requestSignal: AbortSignal | undefined;
    const fetchMock = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          requestSignal = init?.signal ?? undefined;
          requestSignal?.addEventListener(
            "abort",
            () => reject(requestSignal?.reason),
            { once: true }
          );
        })
    );
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new MistralOCRAdapter({
      apiKey: "test-api-key",
      maxRetries: 0,
    });
    const extraction = adapter.extractFromUrl("https://example.test/jobsheet.pdf", {
      skipRetry: true,
    });

    await vi.advanceTimersByTimeAsync(TIMEOUT_CONFIG.OCR_EXTRACTION);

    const result = await extraction;
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(requestSignal).toBeDefined();
    expect(requestSignal?.aborted).toBe(true);
    expect(result).toMatchObject({
      success: false,
      errorCode: "PROCESSING_ERROR",
      error: `Mistral OCR request exceeded timeout of ${TIMEOUT_CONFIG.OCR_EXTRACTION}ms`,
    });
  });
});
