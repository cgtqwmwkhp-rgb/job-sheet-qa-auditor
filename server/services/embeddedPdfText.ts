/**
 * Embedded PDF text enrichment (fail-soft).
 *
 * Uses pdfjs-dist in-process — no pdftotext / poppler dependency (Alpine image).
 * Prefer this over OCR markdown when the PDF has a real text layer.
 *
 * PR1 / PX-100: also expose per-word bounding boxes from TextItem.transform so
 * label-anchor extraction can ground fields before any generative OCR runs.
 */

import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

/** Non-whitespace character count used for thin-text / prefer-embedded decisions. */
export function usableTextLength(text: string): number {
  return text.replace(/\s+/g, " ").trim().length;
}

/**
 * @deprecated Soft post-OCR length race — do NOT use as the born-digital gate.
 * Kept for contract/backward-compat; Stage 1 now classifies text-layer-first.
 */
export function shouldPreferEmbeddedText(
  ocrText: string,
  embeddedText: string
): boolean {
  const ocrLen = usableTextLength(ocrText);
  const embLen = usableTextLength(embeddedText);
  return embLen >= Math.max(ocrLen * 2, 500);
}

/** Thin usable text → do not run Gemini FULL path against catch-all specs. */
export const THIN_TEXT_CHAR_THRESHOLD = 500;

export function isThinExtractedText(text: string): boolean {
  return usableTextLength(text) < THIN_TEXT_CHAR_THRESHOLD;
}

/** Axis-aligned word box in PDF user space (origin bottom-left). */
export interface PdfTextWord {
  text: string;
  page: number;
  /** Lower-left x (PDF user space). */
  x: number;
  /** Lower-left y (PDF user space). */
  y: number;
  width: number;
  height: number;
}

export interface EmbeddedPdfPageLayout {
  pageNumber: number;
  text: string;
  words: PdfTextWord[];
  /** MediaBox width when available. */
  width?: number;
  /** MediaBox height when available. */
  height?: number;
}

export interface EmbeddedPdfTextResult {
  success: boolean;
  fullText: string;
  pages: string[];
  pageCount: number;
  /** Per-page layouts with word boxes (empty when parse failed). */
  pageLayouts: EmbeddedPdfPageLayout[];
  /** Flattened words across pages. */
  words: PdfTextWord[];
  error?: string;
}

/**
 * Derive an axis-aligned bbox from a pdfjs TextItem transform + width.
 * transform = [a, b, c, d, e, f] where (e,f) is the glyph origin.
 */
export function textItemToWordBox(
  item: { str?: string; transform?: number[]; width?: number; height?: number },
  pageNumber: number
): PdfTextWord | null {
  const text = typeof item.str === "string" ? item.str : "";
  if (!text.trim()) return null;
  const t = item.transform;
  if (!Array.isArray(t) || t.length < 6) return null;

  const a = Number(t[0]) || 0;
  const b = Number(t[1]) || 0;
  const c = Number(t[2]) || 0;
  const d = Number(t[3]) || 0;
  const e = Number(t[4]) || 0;
  const f = Number(t[5]) || 0;

  const width =
    typeof item.width === "number" && Number.isFinite(item.width)
      ? Math.abs(item.width)
      : Math.hypot(a, b) * Math.max(text.length, 1) * 0.5;
  const height =
    typeof item.height === "number" &&
    Number.isFinite(item.height) &&
    item.height > 0
      ? Math.abs(item.height)
      : Math.max(Math.hypot(c, d), Math.hypot(a, b), 8);

  return {
    text,
    page: pageNumber,
    x: e,
    y: f,
    width: width > 0 ? width : 1,
    height: height > 0 ? height : 8,
  };
}

/**
 * Fetch PDF bytes from a document URL (typically an Azure SAS URL).
 * Fail-soft: returns null on any network/HTTP error.
 */
export async function fetchPdfBuffer(
  documentUrl: string
): Promise<Buffer | null> {
  try {
    const response = await fetch(documentUrl);
    if (!response.ok) {
      console.warn(
        `[EmbeddedPdfText] fetch failed: HTTP ${response.status} for document URL`
      );
      return null;
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (
      contentType &&
      !contentType.includes("pdf") &&
      !contentType.includes("octet-stream") &&
      !contentType.includes("application/octet-stream")
    ) {
      // Still try — some stores omit/mislabel content-type.
      console.warn(
        `[EmbeddedPdfText] unexpected content-type: ${contentType}; attempting parse anyway`
      );
    }
    const ab = await response.arrayBuffer();
    return Buffer.from(ab);
  } catch (error) {
    console.warn(
      "[EmbeddedPdfText] fetch error:",
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

/**
 * Extract embedded text layer (+ word boxes) from a PDF buffer via pdfjs.
 * Fail-soft: returns empty pages on any parse error.
 */
export async function extractEmbeddedPdfText(
  buffer: Buffer
): Promise<EmbeddedPdfTextResult> {
  try {
    const data = new Uint8Array(buffer);
    const loadingTask = getDocument({
      data,
      useSystemFonts: true,
      isEvalSupported: false,
      verbosity: 0,
    });
    const doc = await loadingTask.promise;
    const pageCount = doc.numPages;
    const pages: string[] = [];
    const pageLayouts: EmbeddedPdfPageLayout[] = [];
    const allWords: PdfTextWord[] = [];

    for (let i = 1; i <= pageCount; i++) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const words: PdfTextWord[] = [];

      for (const raw of content.items) {
        if (!raw || typeof raw !== "object" || !("str" in raw)) continue;
        const box = textItemToWordBox(
          raw as {
            str?: string;
            transform?: number[];
            width?: number;
            height?: number;
          },
          i
        );
        if (box) {
          words.push(box);
          allWords.push(box);
        }
      }

      // Reading-order join: sort by y desc (top→bottom), then x asc.
      const sorted = [...words].sort((a, b) => {
        const lineDelta = b.y - a.y;
        if (Math.abs(lineDelta) > Math.max(a.height, b.height) * 0.5) {
          return lineDelta;
        }
        return a.x - b.x;
      });
      const pageText = sorted
        .map(w => w.text)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      pages.push(pageText);
      pageLayouts.push({
        pageNumber: i,
        text: pageText,
        words,
        width: viewport?.width,
        height: viewport?.height,
      });
    }

    await doc.destroy();

    const fullText = pages.filter(p => p.length > 0).join("\n\n");
    return {
      success: fullText.length > 0,
      fullText,
      pages: pages.length > 0 ? pages : [fullText],
      pageCount,
      pageLayouts,
      words: allWords,
    };
  } catch (error) {
    return {
      success: false,
      fullText: "",
      pages: [],
      pageCount: 0,
      pageLayouts: [],
      words: [],
      error:
        error instanceof Error ? error.message : "Embedded text extract failed",
    };
  }
}

export interface EnrichmentDecision {
  /** Text used for template selection + Gemini judgment */
  extractedText: string;
  /** Per-page texts for multi-signal / hybrid */
  pageTexts: string[];
  /** Whether embedded text was preferred over OCR */
  usedEmbedded: boolean;
  /** Soft stage outcome for processingStages */
  stageStatus: "success" | "skipped" | "failed";
  stageError?: string;
  embeddedLength: number;
  ocrLength: number;
}

/** Pure decision helper — prefer embedded when meaningfully richer than OCR. */
export function decideEmbeddedEnrichment(
  ocrPageMarkdowns: string[],
  embedded: EmbeddedPdfTextResult | null,
  stageErrorIfMissing: string = "NO_EMBEDDED_TEXT"
): EnrichmentDecision {
  const ocrPlain = ocrPageMarkdowns.join("\n\n");
  const ocrLength = usableTextLength(ocrPlain);
  const ocrFormatted = ocrPageMarkdowns
    .map((md, i) => `--- Page ${i + 1} ---\n${md}`)
    .join("\n\n");

  if (!embedded || !embedded.success || !embedded.fullText) {
    return {
      extractedText: ocrFormatted,
      pageTexts: ocrPageMarkdowns,
      usedEmbedded: false,
      stageStatus: embedded?.error ? "failed" : "skipped",
      stageError: embedded?.error ?? stageErrorIfMissing,
      embeddedLength: 0,
      ocrLength,
    };
  }

  const embeddedLength = usableTextLength(embedded.fullText);
  if (!shouldPreferEmbeddedText(ocrPlain, embedded.fullText)) {
    return {
      extractedText: ocrFormatted,
      pageTexts: ocrPageMarkdowns,
      usedEmbedded: false,
      stageStatus: "skipped",
      stageError: "OCR_SUFFICIENT",
      embeddedLength,
      ocrLength,
    };
  }

  const pageTexts =
    embedded.pages.length > 0 ? embedded.pages : [embedded.fullText];
  const extractedText = pageTexts
    .map((p, i) => `--- Page ${i + 1} ---\n${p}`)
    .join("\n\n");

  return {
    extractedText,
    pageTexts,
    usedEmbedded: true,
    stageStatus: "success",
    embeddedLength,
    ocrLength,
  };
}

/**
 * Fetch + extract embedded text and decide whether to prefer it over OCR.
 * @deprecated Prefer text-layer-first classify in textLayerExtraction (Stage 1).
 */
export async function enrichWithEmbeddedPdfText(
  documentUrl: string,
  ocrPageMarkdowns: string[]
): Promise<EnrichmentDecision> {
  const buffer = await fetchPdfBuffer(documentUrl);
  if (!buffer) {
    return decideEmbeddedEnrichment(ocrPageMarkdowns, null, "FETCH_FAILED");
  }

  const embedded = await extractEmbeddedPdfText(buffer);
  return decideEmbeddedEnrichment(ocrPageMarkdowns, embedded);
}
