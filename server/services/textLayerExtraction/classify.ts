/**
 * Classify PDF pages as born-digital (usable text layer) vs scan/photo.
 *
 * This is the Stage 1 gate — NOT the deprecated post-OCR length race in
 * shouldPreferEmbeddedText.
 */

import {
  usableTextLength,
  type EmbeddedPdfPageLayout,
  type EmbeddedPdfTextResult,
} from "../embeddedPdfText";
import type {
  DocumentClassification,
  DocumentKind,
  PageClassification,
  PageKind,
} from "./types";

/** Minimum non-whitespace chars for a page to count as born-digital. */
export const PAGE_DIGITAL_MIN_CHARS = 40;

/** Minimum words for a page to count as born-digital. */
export const PAGE_DIGITAL_MIN_WORDS = 6;

/** Document-level: skip primary OCR when this fraction of pages is digital. */
export const DOCUMENT_DIGITAL_PAGE_RATIO = 0.5;

/** Document-level floor on total usable chars to skip primary OCR. */
export const DOCUMENT_DIGITAL_MIN_CHARS = 80;

export function classifyPageKind(
  usableChars: number,
  wordCount: number
): PageKind {
  if (usableChars <= 0 && wordCount <= 0) return "empty";
  if (
    usableChars >= PAGE_DIGITAL_MIN_CHARS ||
    wordCount >= PAGE_DIGITAL_MIN_WORDS
  ) {
    return "born_digital";
  }
  // Sparse glyphs (page numbers only) → treat as scan / not authoritative.
  return "scan";
}

export function classifyPageLayout(
  layout: EmbeddedPdfPageLayout
): PageClassification {
  const usableChars = usableTextLength(layout.text);
  const wordCount = layout.words.filter(w => w.text.trim().length > 0).length;
  return {
    pageNumber: layout.pageNumber,
    kind: classifyPageKind(usableChars, wordCount),
    usableChars,
    wordCount,
  };
}

/**
 * Classify a whole document from embedded extract result.
 * skipPrimaryOcr=true only when enough pages are born-digital with usable text.
 */
export function classifyDocument(
  embedded: EmbeddedPdfTextResult | null
): DocumentClassification {
  if (!embedded || !embedded.success) {
    return {
      kind: "empty",
      skipPrimaryOcr: false,
      documentStrategy: "ocr",
      pages: [],
      usableChars: 0,
      digitalPageCount: 0,
      scanPageCount: 0,
      reason: embedded?.error
        ? `EXTRACT_FAILED:${embedded.error}`
        : "NO_TEXT_LAYER",
    };
  }

  const layouts =
    embedded.pageLayouts.length > 0
      ? embedded.pageLayouts
      : embedded.pages.map((text, i) => ({
          pageNumber: i + 1,
          text,
          words: [],
        }));

  const pages = layouts.map(classifyPageLayout);
  const contentPages = pages.filter(p => p.kind !== "empty");
  const digitalPageCount = pages.filter(p => p.kind === "born_digital").length;
  const scanPageCount = pages.filter(p => p.kind === "scan").length;
  const usableChars = usableTextLength(embedded.fullText);

  let kind: DocumentKind;
  let skipPrimaryOcr = false;
  let reason: string;

  if (contentPages.length === 0 || usableChars < 8) {
    kind = "empty";
    reason = "EMPTY_OR_NEAR_EMPTY";
  } else if (
    digitalPageCount > 0 &&
    scanPageCount === 0 &&
    usableChars >= DOCUMENT_DIGITAL_MIN_CHARS
  ) {
    kind = "born_digital";
    skipPrimaryOcr = true;
    reason = "ALL_CONTENT_PAGES_DIGITAL";
  } else if (
    digitalPageCount > 0 &&
    digitalPageCount / Math.max(contentPages.length, 1) >=
      DOCUMENT_DIGITAL_PAGE_RATIO &&
    usableChars >= DOCUMENT_DIGITAL_MIN_CHARS
  ) {
    kind = "hybrid";
    // Prefer text layer for the document; still skip primary Mistral when
    // the majority is digital (scan pages stay thin — Azure layout later).
    skipPrimaryOcr = true;
    reason = "MAJORITY_DIGITAL_PAGES";
  } else if (digitalPageCount > 0 && scanPageCount > 0) {
    kind = "hybrid";
    skipPrimaryOcr = false;
    reason = "MIXED_NEEDS_OCR";
  } else {
    kind = "scan";
    skipPrimaryOcr = false;
    reason = "NO_USABLE_TEXT_LAYER";
  }

  const documentStrategy =
    skipPrimaryOcr && (kind === "born_digital" || kind === "hybrid")
      ? "text_layer"
      : kind === "hybrid"
        ? "hybrid"
        : "ocr";

  return {
    kind,
    skipPrimaryOcr,
    documentStrategy,
    pages,
    usableChars,
    digitalPageCount,
    scanPageCount,
    reason,
  };
}
