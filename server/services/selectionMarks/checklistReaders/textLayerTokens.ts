/**
 * Convert embedded PDF word boxes → checklist tokens (% coords).
 * Uses textLayerExtraction / embeddedPdfText layouts — does not re-parse PDFs.
 */

import type { EmbeddedPdfPageLayout } from "../../embeddedPdfText";
import type { AzureTextLine } from "../../ocrAdapter/parseAzureDiResponse";
import type { ChecklistTextToken } from "./types";

/**
 * Flatten pageLayouts into percent-space tokens (top-left origin like Azure DI).
 * PDF user space is bottom-left; we invert Y.
 */
export function pageLayoutsToTokens(
  layouts: EmbeddedPdfPageLayout[]
): ChecklistTextToken[] {
  const tokens: ChecklistTextToken[] = [];
  for (const layout of layouts) {
    const pageW = layout.width && layout.width > 0 ? layout.width : 612;
    const pageH = layout.height && layout.height > 0 ? layout.height : 792;
    for (const w of layout.words) {
      const text = w.text?.trim();
      if (!text) continue;
      const cx = w.x + w.width / 2;
      const cy = w.y + w.height / 2;
      // PDF origin bottom-left → percent from top
      const xPercent = clamp((cx / pageW) * 100);
      const yPercent = clamp(((pageH - cy) / pageH) * 100);
      tokens.push({
        pageNumber: layout.pageNumber || w.page || 1,
        content: text,
        xPercent,
        yPercent,
        widthPercent: clamp((Math.abs(w.width) / pageW) * 100),
        heightPercent: clamp((Math.abs(w.height) / pageH) * 100),
      });
    }
  }
  return tokens;
}

/** Join nearby same-line tokens into AzureTextLine-shaped rows for label search. */
export function tokensToLines(tokens: ChecklistTextToken[]): AzureTextLine[] {
  if (tokens.length === 0) return [];
  const byPage = new Map<number, ChecklistTextToken[]>();
  for (const t of tokens) {
    const list = byPage.get(t.pageNumber) ?? [];
    list.push(t);
    byPage.set(t.pageNumber, list);
  }

  const lines: AzureTextLine[] = [];
  for (const [pageNumber, pageTokens] of Array.from(byPage.entries())) {
    const sorted = [...pageTokens].sort((a, b) => {
      if (Math.abs(a.yPercent - b.yPercent) > 0.8) {
        return a.yPercent - b.yPercent;
      }
      return a.xPercent - b.xPercent;
    });

    const clusters: ChecklistTextToken[][] = [];
    for (const tok of sorted) {
      const last = clusters[clusters.length - 1];
      if (last && Math.abs(last[0].yPercent - tok.yPercent) <= 0.9) {
        last.push(tok);
      } else {
        clusters.push([tok]);
      }
    }

    for (const cluster of clusters) {
      cluster.sort((a, b) => a.xPercent - b.xPercent);
      const content = cluster
        .map(c => c.content)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (!content) continue;
      const minX = Math.min(
        ...cluster.map(c => c.xPercent - c.widthPercent / 2)
      );
      const maxX = Math.max(
        ...cluster.map(c => c.xPercent + c.widthPercent / 2)
      );
      const y =
        cluster.reduce((s, c) => s + c.yPercent, 0) /
        Math.max(cluster.length, 1);
      const h = Math.max(...cluster.map(c => c.heightPercent), 1);
      lines.push({
        pageNumber,
        content,
        xPercent: minX,
        yPercent: y,
        widthPercent: Math.max(maxX - minX, 1),
        heightPercent: h,
      });
    }
  }
  return lines;
}

function clamp(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}
