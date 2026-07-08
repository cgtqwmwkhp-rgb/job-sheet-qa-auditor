/**
 * Unit tests for parseAzureDiResponse (PR-4).
 * Fixture-driven — no live Azure HTTP.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { parseAzureDiResponse } from "./parseAzureDiResponse";
import { DEFAULT_AZURE_DI_MODEL } from "./types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(
    join(__dirname, "../../tests/fixtures/azure-di-read-v4-response.json"),
    "utf8"
  )
);

describe("parseAzureDiResponse", () => {
  it("maps fixture JSON to OCRPage[] with pageNumber + markdown", () => {
    const parsed = parseAzureDiResponse(fixture);

    expect(parsed.pages).toHaveLength(1);
    expect(parsed.model).toBe("prebuilt-read");
    expect(parsed.pages[0].pageNumber).toBe(1);
    expect(parsed.pages[0].markdown).toContain("Job Sheet");
    expect(parsed.pages[0].markdown).toContain("JS-2024-001");
    expect(parsed.pages[0].dimensions?.width).toBe(612); // 8.5in * 72dpi
    expect(parsed.usageInfo?.pagesProcessed).toBe(1);
  });

  it("handles empty / invalid input without throwing", () => {
    expect(parseAzureDiResponse(null).pages).toEqual([]);
    expect(parseAzureDiResponse({}).pages).toEqual([]);
    expect(parseAzureDiResponse({ analyzeResult: { pages: [] } }).model).toBe(
      DEFAULT_AZURE_DI_MODEL
    );
  });

  it("falls back to content when pages have no lines", () => {
    const parsed = parseAzureDiResponse({
      analyzeResult: {
        modelId: "prebuilt-read",
        content: "Whole document text",
        pages: [
          { pageNumber: 1, width: 1, height: 1, unit: "inch", words: [] },
        ],
      },
    });
    expect(parsed.pages[0].markdown).toBe("Whole document text");
  });
});
