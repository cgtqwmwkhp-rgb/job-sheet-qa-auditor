/**
 * Text-layer-first extraction (PR1 / PX-100 / PX-103).
 *
 * Classify digital vs scan → label-anchor header fields → grounded emit.
 * Primary Mistral OCR is skipped when the document is born-digital.
 */

import {
  extractEmbeddedPdfText,
  fetchPdfBuffer,
  usableTextLength,
  type EmbeddedPdfTextResult,
} from "../embeddedPdfText";
import { classifyDocument } from "./classify";
import {
  extractLabelAnchoredFields,
  groundedFieldsToPreExtracted,
  extractFieldsFromPlainText,
  JOB_SUMMARY_LABEL_SPECS,
} from "./labelAnchor";
import type {
  DocumentClassification,
  DocumentStrategyLogical,
  TextLayerExtractionResult,
  GroundedTextLayerField,
} from "./types";

export * from "./types";
export * from "./classify";
export * from "./labelAnchor";

/** DB enum does not yet include text_layer — map for persistence. */
export function toDbDocumentStrategy(
  logical: DocumentStrategyLogical
): "embedded_text" | "ocr" | "hybrid" {
  if (logical === "text_layer") return "embedded_text";
  return logical;
}

export interface ExtractTextLayerOptions {
  /** Optional buffer when already fetched (avoids double download). */
  buffer?: Buffer | null;
}

/**
 * Fetch + extract + classify + label-anchor from a document URL.
 * Fail-soft: returns empty classification on fetch/parse failure.
 */
export async function extractTextLayerFromUrl(
  documentUrl: string,
  options: ExtractTextLayerOptions = {}
): Promise<{
  buffer: Buffer | null;
  embedded: EmbeddedPdfTextResult | null;
  result: TextLayerExtractionResult;
}> {
  const buffer =
    options.buffer !== undefined
      ? options.buffer
      : await fetchPdfBuffer(documentUrl);

  if (!buffer) {
    return {
      buffer: null,
      embedded: null,
      result: emptyResult("FETCH_FAILED"),
    };
  }

  const embedded = await extractEmbeddedPdfText(buffer);
  return {
    buffer,
    embedded,
    result: buildTextLayerResult(embedded),
  };
}

/**
 * Build extraction result from an already-parsed embedded extract.
 */
export function buildTextLayerResult(
  embedded: EmbeddedPdfTextResult | null
): TextLayerExtractionResult {
  const classification = classifyDocument(embedded);
  if (!embedded || !embedded.success) {
    return {
      classification,
      fullText: "",
      pageTexts: [],
      fields: [],
      preExtracted: {},
    };
  }

  const pageLayouts =
    embedded.pageLayouts.length > 0
      ? embedded.pageLayouts
      : embedded.pages.map((text, i) => ({
          pageNumber: i + 1,
          text,
          words: [],
        }));

  let fields = extractLabelAnchoredFields(pageLayouts, JOB_SUMMARY_LABEL_SPECS);

  // Document-level plain-text fill for any missing headers
  if (fields.length < 3 && embedded.fullText) {
    const fromFull = extractFieldsFromPlainText(embedded.fullText, 1);
    const seen = new Set(fields.map(f => f.fieldId));
    for (const f of fromFull) {
      if (!seen.has(f.fieldId)) {
        seen.add(f.fieldId);
        fields.push(f);
      }
    }
  }

  const pageTexts =
    embedded.pages.length > 0 ? embedded.pages : [embedded.fullText];
  const fullText = pageTexts
    .map((p, i) => `--- Page ${i + 1} ---\n${p}`)
    .join("\n\n");

  return {
    classification,
    fullText,
    pageTexts,
    fields,
    preExtracted: groundedFieldsToPreExtracted(fields),
  };
}

function emptyResult(reason: string): TextLayerExtractionResult {
  const classification: DocumentClassification = {
    kind: "empty",
    skipPrimaryOcr: false,
    documentStrategy: "ocr",
    pages: [],
    usableChars: 0,
    digitalPageCount: 0,
    scanPageCount: 0,
    reason,
  };
  return {
    classification,
    fullText: "",
    pageTexts: [],
    fields: [],
    preExtracted: {},
  };
}

/**
 * Synthesize a pipeline OCRResult-shaped object from text-layer pages so
 * downstream stages keep working without calling Mistral.
 */
export function synthesizeOcrResultFromTextLayer(
  pageTexts: string[],
  opts?: { model?: string; processingTimeMs?: number }
): {
  success: boolean;
  pages: Array<{
    pageNumber: number;
    markdown: string;
    confidenceScores?: { averagePageConfidence: number };
  }>;
  totalPages: number;
  model: string;
  provider: string;
  processingTimeMs?: number;
} {
  const pages = (pageTexts.length > 0 ? pageTexts : [""]).map((md, i) => ({
    pageNumber: i + 1,
    markdown: md,
    confidenceScores: { averagePageConfidence: 1 },
  }));
  return {
    success: usableTextLength(pageTexts.join("\n")) > 0,
    pages,
    totalPages: pages.length,
    model: opts?.model ?? "text-layer",
    provider: "text_layer",
    processingTimeMs: opts?.processingTimeMs,
  };
}

export function formatGroundedFieldsForReport(
  fields: GroundedTextLayerField[]
): Record<
  string,
  {
    value: string;
    confidence: number;
    pageNumber: number;
    source: "text_layer";
    bbox: GroundedTextLayerField["bbox"];
  }
> {
  const out: Record<
    string,
    {
      value: string;
      confidence: number;
      pageNumber: number;
      source: "text_layer";
      bbox: GroundedTextLayerField["bbox"];
    }
  > = {};
  for (const f of fields) {
    out[f.fieldId] = {
      value: f.value,
      confidence: Math.round(f.confidence * 100),
      pageNumber: f.page,
      source: "text_layer",
      bbox: f.bbox,
    };
  }
  return out;
}
