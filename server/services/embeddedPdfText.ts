/**
 * Embedded PDF text enrichment (fail-soft).
 *
 * Uses pdfjs-dist in-process — no pdftotext / poppler dependency (Alpine image).
 * Prefer this over OCR markdown when the PDF has a real text layer.
 */

import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

/** Non-whitespace character count used for thin-text / prefer-embedded decisions. */
export function usableTextLength(text: string): number {
  return text.replace(/\s+/g, " ").trim().length;
}

/** Prefer embedded text when it is meaningfully richer than OCR. */
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

export interface EmbeddedPdfTextResult {
  success: boolean;
  fullText: string;
  pages: string[];
  pageCount: number;
  error?: string;
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
 * Extract embedded text layer from a PDF buffer via pdfjs.
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
      disableWorker: true,
      isEvalSupported: false,
      verbosity: 0,
    });
    const doc = await loadingTask.promise;
    const pageCount = doc.numPages;
    const pages: string[] = [];

    for (let i = 1; i <= pageCount; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items
        .map(item => ("str" in item ? String(item.str) : ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      pages.push(pageText);
    }

    await doc.destroy();

    const fullText = pages.filter(p => p.length > 0).join("\n\n");
    return {
      success: fullText.length > 0,
      fullText,
      pages: pages.length > 0 ? pages : [fullText],
      pageCount,
    };
  } catch (error) {
    return {
      success: false,
      fullText: "",
      pages: [],
      pageCount: 0,
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
