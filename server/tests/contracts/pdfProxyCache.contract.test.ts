import { afterEach, describe, expect, it } from "vitest";
import { handleMetrics } from "../../_core/metrics";
import {
  cachePdfRangeResponse,
  getCachedPdfRangeResponse,
  getPdfProxyMetrics,
  resetPdfProxyCacheForTests,
} from "../../_core/pdfProxy";

function createMockResponse() {
  let body = "";

  return {
    setHeader: () => undefined,
    status: () => ({
      send: (value: string) => {
        body = value;
      },
    }),
    getBody: () => body,
  };
}

describe("PDF proxy range cache", () => {
  afterEach(() => {
    resetPdfProxyCacheForTests();
  });

  it("returns a cached range and records the cache hit", () => {
    cachePdfRangeResponse("document-key\nbytes=0-1023", {
      body: Buffer.from("pdf range"),
      contentType: "application/pdf",
      contentRange: "bytes 0-8/9",
      acceptRanges: "bytes",
      status: 206,
    });

    const cached = getCachedPdfRangeResponse("document-key\nbytes=0-1023");

    expect(cached?.body.toString()).toBe("pdf range");
    expect(getPdfProxyMetrics().cacheHitCount).toBe(1);
  });

  it("exposes PDF cache hits at the Prometheus metrics endpoint", () => {
    cachePdfRangeResponse("document-key\nbytes=0-1023", {
      body: Buffer.from("pdf range"),
      contentType: "application/pdf",
      contentRange: "bytes 0-8/9",
      acceptRanges: "bytes",
      status: 206,
    });
    getCachedPdfRangeResponse("document-key\nbytes=0-1023");

    const res = createMockResponse();
    handleMetrics({} as never, res as never);

    expect(res.getBody()).toContain(
      "# TYPE pdf_proxy_cache_hits_total counter"
    );
    expect(res.getBody()).toContain("pdf_proxy_cache_hits_total 1");
  });
});
