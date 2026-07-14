/**
 * Pure Azure Document Intelligence response parser (PR-4).
 *
 * Converts Analyze Result JSON (prebuilt-read / layout) into typed OCRPage[].
 * Also extracts selectionMarks when present (prebuilt-layout).
 * No HTTP / side effects — safe for unit tests and mock fixtures.
 */

import type { OCRPage } from "./types";
import { DEFAULT_AZURE_DI_MODEL } from "./types";

export interface AzureSelectionMarkBBox {
  x: number;
  y: number;
  width: number;
  height: number;
  coordinateSpace: "percent";
}

export interface AzureSelectionMark {
  pageNumber: number;
  state: "selected" | "unselected";
  confidence: number;
  bbox: AzureSelectionMarkBBox;
  /** Raw polygon in page units (inches/pixels) for debugging. */
  polygon?: number[];
}

export interface AzureTextLine {
  pageNumber: number;
  content: string;
  /** Approximate vertical center as % of page height (0–100). */
  yPercent: number;
  /** Left edge as % of page width (0–100). */
  xPercent: number;
  /** Line width as % of page width (0–100). */
  widthPercent?: number;
  /** Line height as % of page height (0–100). */
  heightPercent?: number;
}

export interface ParsedAzureDiResult {
  pages: OCRPage[];
  model: string;
  selectionMarks: AzureSelectionMark[];
  lines: AzureTextLine[];
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

function clampPercent(n: number): number {
  return Math.min(100, Math.max(0, n));
}

/**
 * Convert Azure DI polygon [x1,y1,...,x4,y4] + page size → percent bbox.
 */
export function polygonToPercentBBox(
  polygon: number[],
  pageWidth: number,
  pageHeight: number
): AzureSelectionMarkBBox | undefined {
  if (
    polygon.length < 8 ||
    !(pageWidth > 0) ||
    !(pageHeight > 0) ||
    !polygon.every(n => Number.isFinite(n))
  ) {
    return undefined;
  }
  const xs = [polygon[0], polygon[2], polygon[4], polygon[6]];
  const ys = [polygon[1], polygon[3], polygon[5], polygon[7]];
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    x: clampPercent((minX / pageWidth) * 100),
    y: clampPercent((minY / pageHeight) * 100),
    width: clampPercent(((maxX - minX) / pageWidth) * 100),
    height: clampPercent(((maxY - minY) / pageHeight) * 100),
    coordinateSpace: "percent",
  };
}

function parseSelectionState(
  raw: unknown
): "selected" | "unselected" | undefined {
  const s = asString(raw)?.toLowerCase();
  if (s === "selected") return "selected";
  if (s === "unselected") return "unselected";
  return undefined;
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

function parsePageSelectionMarks(
  pageObj: Record<string, unknown>,
  pageNumber: number,
  pageWidth: number | undefined,
  pageHeight: number | undefined
): AzureSelectionMark[] {
  const rawMarks = Array.isArray(pageObj.selectionMarks)
    ? pageObj.selectionMarks
    : [];
  const marks: AzureSelectionMark[] = [];

  for (const raw of rawMarks) {
    if (!raw || typeof raw !== "object") continue;
    const m = raw as Record<string, unknown>;
    const state = parseSelectionState(m.state);
    if (!state) continue;

    const confidence = asNumber(m.confidence) ?? 0;
    const polygon = Array.isArray(m.polygon)
      ? m.polygon.map(asNumber).filter((n): n is number => n !== undefined)
      : [];

    let bbox: AzureSelectionMarkBBox | undefined;
    if (
      pageWidth !== undefined &&
      pageHeight !== undefined &&
      polygon.length >= 8
    ) {
      bbox = polygonToPercentBBox(polygon, pageWidth, pageHeight);
    }
    if (!bbox) {
      // Fallback: place at origin with zero size so downstream can still count
      bbox = {
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        coordinateSpace: "percent",
      };
    }

    marks.push({
      pageNumber,
      state,
      confidence: confidence <= 1 ? confidence * 100 : confidence,
      bbox,
      polygon: polygon.length >= 8 ? polygon : undefined,
    });
  }

  return marks;
}

/**
 * Parse Azure Document Intelligence analyzeResult (or full analyze response).
 */
export function parseAzureDiResponse(raw: unknown): ParsedAzureDiResult {
  if (!raw || typeof raw !== "object") {
    return {
      pages: [],
      model: DEFAULT_AZURE_DI_MODEL,
      selectionMarks: [],
      lines: [],
    };
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
  const selectionMarks: AzureSelectionMark[] = [];
  const linesOut: AzureTextLine[] = [];

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

      // Capture line geometry for checklist row label association
      if (width && height) {
        let pageLineCount = 0;
        for (const line of lines) {
          if (!line || typeof line !== "object") continue;
          const lo = line as Record<string, unknown>;
          const lineContent = asString(lo.content);
          if (!lineContent?.trim()) continue;
          const poly = Array.isArray(lo.polygon)
            ? lo.polygon
                .map(asNumber)
                .filter((n): n is number => n !== undefined)
            : [];
          if (poly.length < 8) continue;
          const ys = [poly[1], poly[3], poly[5], poly[7]];
          const xs = [poly[0], poly[2], poly[4], poly[6]];
          const yMin = Math.min(...ys);
          const yMax = Math.max(...ys);
          const xMin = Math.min(...xs);
          const xMax = Math.max(...xs);
          const yMid = (yMin + yMax) / 2;
          linesOut.push({
            pageNumber,
            content: lineContent.trim(),
            yPercent: clampPercent((yMid / height) * 100),
            xPercent: clampPercent((xMin / width) * 100),
            widthPercent: clampPercent(((xMax - xMin) / width) * 100),
            heightPercent: clampPercent(((yMax - yMin) / height) * 100),
          });
          pageLineCount += 1;
        }

        // Fallback: word polygons when lines lack geometry (common on some DI responses)
        if (pageLineCount === 0) {
          const words = Array.isArray(pageObj.words) ? pageObj.words : [];
          for (const word of words) {
            if (!word || typeof word !== "object") continue;
            const wo = word as Record<string, unknown>;
            const wordContent = asString(wo.content);
            if (!wordContent?.trim()) continue;
            const poly = Array.isArray(wo.polygon)
              ? wo.polygon
                  .map(asNumber)
                  .filter((n): n is number => n !== undefined)
              : [];
            if (poly.length < 8) continue;
            const ys = [poly[1], poly[3], poly[5], poly[7]];
            const xs = [poly[0], poly[2], poly[4], poly[6]];
            const yMin = Math.min(...ys);
            const yMax = Math.max(...ys);
            const xMin = Math.min(...xs);
            const xMax = Math.max(...xs);
            const yMid = (yMin + yMax) / 2;
            linesOut.push({
              pageNumber,
              content: wordContent.trim(),
              yPercent: clampPercent((yMid / height) * 100),
              xPercent: clampPercent((xMin / width) * 100),
              widthPercent: clampPercent(((xMax - xMin) / width) * 100),
              heightPercent: clampPercent(((yMax - yMin) / height) * 100),
            });
          }
        }
      }

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

      // selectionMarks use page width/height in the same unit as the polygon
      selectionMarks.push(
        ...parsePageSelectionMarks(pageObj, pageNumber, width, height)
      );

      pages.push(page);
    }
  }

  return {
    pages,
    model: modelId,
    selectionMarks,
    lines: linesOut,
    usageInfo: {
      pagesProcessed: pages.length,
      tokensGenerated: 0,
    },
  };
}
