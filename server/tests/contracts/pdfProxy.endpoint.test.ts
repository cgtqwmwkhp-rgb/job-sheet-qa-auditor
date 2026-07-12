/**
 * PDF Proxy Endpoint Contract Tests
 *
 * Verifies that the PDF proxy endpoint:
 * 1. Requires authentication (returns 401 without auth header)
 * 2. Returns proper content type headers
 * 3. Supports HTTP Range requests
 * 4. Handles download mode
 */

import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs";
import path from "path";

/** Collapse whitespace so Prettier line-breaks don't break source contracts. */
function compact(src: string): string {
  return src.replace(/\s+/g, " ");
}

describe("PDF Proxy Endpoint Contract", () => {
  const pdfProxyPath = path.resolve(__dirname, "../../_core/pdfProxy.ts");
  let pdfProxyContent: string;
  let compactContent: string;

  beforeAll(() => {
    pdfProxyContent = fs.readFileSync(pdfProxyPath, "utf-8");
    compactContent = compact(pdfProxyContent);
  });

  describe("Authentication", () => {
    it("should have requireAuth middleware defined", () => {
      expect(pdfProxyContent).toContain("function requireAuth");
    });

    it("should check for x-ms-client-principal header", () => {
      expect(pdfProxyContent).toContain("x-ms-client-principal");
    });

    it("should return 401 when no principal header", () => {
      expect(compactContent).toMatch(/res\s*\.\s*status\s*\(\s*401\s*\)/);
      expect(pdfProxyContent).toMatch(/['"]Unauthorized['"]/);
    });

    it("should apply requireAuth to GET endpoint", () => {
      expect(compactContent).toMatch(
        /router\.get\(\s*['"]\/:jobSheetId\/pdf['"]\s*,\s*requireAuth/
      );
    });

    it("should apply requireAuth to HEAD endpoint", () => {
      expect(compactContent).toMatch(
        /router\.head\(\s*['"]\/:jobSheetId\/pdf['"]\s*,\s*requireAuth/
      );
    });
  });

  describe("Content Headers", () => {
    it("should set Content-Type to application/pdf", () => {
      expect(pdfProxyContent).toMatch(/['"]application\/pdf['"]/);
      expect(pdfProxyContent).toContain("Content-Type");
    });

    it("should set Content-Disposition header", () => {
      expect(pdfProxyContent).toContain("Content-Disposition");
    });

    it("should support inline disposition for viewing", () => {
      expect(pdfProxyContent).toMatch(/['"]inline['"]/);
    });

    it("should support attachment disposition for download", () => {
      expect(pdfProxyContent).toMatch(/['"]attachment['"]/);
      expect(pdfProxyContent).toContain("download");
    });
  });

  describe("Range Request Support", () => {
    it("should check for Range header", () => {
      expect(pdfProxyContent).toContain("req.headers.range");
    });

    it("should forward Range header to storage", () => {
      expect(pdfProxyContent).toMatch(/['"]Range['"]/);
    });

    it("should set Accept-Ranges header", () => {
      expect(pdfProxyContent).toContain("Accept-Ranges");
      expect(pdfProxyContent).toMatch(/['"]bytes['"]/);
    });

    it("should handle 206 Partial Content response", () => {
      expect(pdfProxyContent).toContain("206");
      expect(pdfProxyContent).toContain("Content-Range");
    });
  });

  describe("Error Handling", () => {
    it("should return 400 for invalid job sheet ID", () => {
      expect(compactContent).toMatch(/res\s*\.\s*status\s*\(\s*400\s*\)/);
      expect(pdfProxyContent).toContain("Invalid job sheet ID");
    });

    it("should return 404 for missing job sheet", () => {
      expect(compactContent).toMatch(/res\s*\.\s*status\s*\(\s*404\s*\)/);
      expect(pdfProxyContent).toContain("Job sheet not found");
    });

    it("should return 502 for storage fetch failures", () => {
      expect(compactContent).toMatch(/res\s*\.\s*status\s*\(\s*502\s*\)/);
    });

    it("should handle stream errors gracefully", () => {
      expect(pdfProxyContent).toContain("Stream error");
    });
  });

  describe("Caching", () => {
    it("should set Cache-Control header", () => {
      expect(pdfProxyContent).toContain("Cache-Control");
    });

    it("should use private caching for authenticated content", () => {
      expect(pdfProxyContent).toMatch(/['"]private/);
    });
  });
});
