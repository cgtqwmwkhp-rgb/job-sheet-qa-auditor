/**
 * Pure Azure Document Intelligence response parser (PR-4).
 *
 * Converts Analyze Result JSON (prebuilt-read / layout) into typed OCRPage[].
 * No HTTP / side effects — safe for unit tests and mock fixtures.
 */

import type { OCRPage } from "./types";
import { DEFAULT_AZURE_DI_MODEL } from "./types";

export interface ParsedAzureDiResult {
  pages: OCRPage[];
  model: string;
  usageInfo?: {
    pagesProcessed: number;
    tokensGenerated: number;
  };
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/**
 * Build page markdown from Azure DI page lines (content + optional polygon).
 */
function linesToMarkdown(lines: unknown[]): string {
  const parts: string[] = [];
  for (const line of lines) {
    if (!line || typeof line !== "object") continue;
    const content = asString((line as Record<string, unknown>).content);
    if (content) parts.push(content);
  }
  return parts.join("\n");
}

/**
 * Parse Azure Document Intelligence analyzeResult (or full analyze response).
 */
export function parseAzureDiResponse(raw: unknown): ParsedAzureDiResult {
  if (!raw || typeof raw !== "object") {
    return { pages: [], model: DEFAULT_AZURE_DI_MODEL };
  }

  const root = raw as Record<string, unknown>;
  const analyzeResult =
    root.analyzeResult && typeof root.analyzeResult === "object"
      ? (root.analyzeResult as Record<string, unknown>)
      : root;

  const modelId =
    asString(analyzeResult.modelId) ||
    asString(root.modelId) ||
    DEFAULT_AZURE_DI_MODEL;

  const content = asString(analyzeResult.content) ?? "";
  const rawPages = Array.isArray(analyzeResult.pages)
    ? analyzeResult.pages
    : [];

  const pages: OCRPage[] = [];

  if (rawPages.length === 0 && content) {
    pages.push({
      pageNumber: 1,
      markdown: content,
    });
  } else {
    for (let i = 0; i < rawPages.length; i++) {
      const pageRaw = rawPages[i];
      if (!pageRaw || typeof pageRaw !== "object") continue;
      const pageObj = pageRaw as Record<string, unknown>;
      const pageNumber = asNumber(pageObj.pageNumber) ?? i + 1;
      const width = asNumber(pageObj.width);
      const height = asNumber(pageObj.height);
      const unit = asString(pageObj.unit);
      // Azure DI uses inches by default; approximate dpi for dimensions stamp.
      const dpi = unit === "inch" ? 72 : 72;

      const lines = Array.isArray(pageObj.lines) ? pageObj.lines : [];
      let markdown = linesToMarkdown(lines);

      // Prefer page-scoped spans from document content when available
      if (!markdown && content && Array.isArray(pageObj.spans)) {
        const spanParts: string[] = [];
        for (const span of pageObj.spans) {
          if (!span || typeof span !== "object") continue;
          const s = span as Record<string, unknown>;
          const offset = asNumber(s.offset);
          const length = asNumber(s.length);
          if (offset === undefined || length === undefined) continue;
          spanParts.push(content.slice(offset, offset + length));
        }
        markdown = spanParts.join("\n").trim();
      }

      if (!markdown && content && rawPages.length === 1) {
        markdown = content;
      }

      const page: OCRPage = {
        pageNumber,
        markdown: markdown || "",
      };

      if (width !== undefined && height !== undefined) {
        // Convert inches → approximate pixels at 72 dpi for consistency
        const pxW =
          unit === "inch" ? Math.round(width * 72) : Math.round(width);
        const pxH =
          unit === "inch" ? Math.round(height * 72) : Math.round(height);
        page.dimensions = { width: pxW, height: pxH, dpi };
      }

      // Optional word-level confidence → page aggregates (advisory)
      const words = Array.isArray(pageObj.words) ? pageObj.words : [];
      const confidences: number[] = [];
      for (const word of words) {
        if (!word || typeof word !== "object") continue;
        const c = asNumber((word as Record<string, unknown>).confidence);
        if (c !== undefined) confidences.push(c);
      }
      if (confidences.length > 0) {
        const sum = confidences.reduce((a, b) => a + b, 0);
        page.confidenceScores = {
          averagePageConfidence: sum / confidences.length,
          minimumPageConfidence: Math.min(...confidences),
        };
      }

      pages.push(page);
    }
  }

  return {
    pages,
    model: modelId,
    usageInfo: {
      pagesProcessed: pages.length,
      tokensGenerated: 0,
    },
  };
}
