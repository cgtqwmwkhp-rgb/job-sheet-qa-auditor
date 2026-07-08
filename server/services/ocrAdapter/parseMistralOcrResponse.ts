/**
 * Pure Mistral OCR response parser (PR-2).
 *
 * Converts raw API JSON into typed OCRPage[] with optional deep features.
 * No HTTP / side effects — safe for unit tests and mock fixtures.
 */

import type {
  OCRBlock,
  OCRBlockType,
  OCRBoundingBoxPercent,
  OCRConfidenceScores,
  OCRPage,
  OCRPixelCorners,
  OCRSignatureRegion,
  OCRWordConfidence,
} from "./types";
import { summarizeDeepFeatures } from "./types";

export interface ParseMistralOcrOptions {
  /** When false, ignore blocks/confidence even if present in raw. */
  includeDeepFeatures?: boolean;
  /** Apply PII redaction to markdown (caller supplies redactor). */
  redactMarkdown?: (text: string) => string;
}

export interface ParsedMistralOcrResult {
  pages: OCRPage[];
  model?: string;
  usageInfo?: {
    pagesProcessed: number;
    tokensGenerated: number;
  };
  deepFeaturesEnabled: boolean;
}

/**
 * Convert pixel corner bbox + page dimensions → percent bbox (0–100).
 * Returns undefined when dimensions are missing or invalid.
 */
export function pixelCornersToPercent(
  corners: OCRPixelCorners,
  dimensions?: { width: number; height: number }
): OCRBoundingBoxPercent | undefined {
  if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) {
    return undefined;
  }

  const x = (corners.topLeftX / dimensions.width) * 100;
  const y = (corners.topLeftY / dimensions.height) * 100;
  const width =
    ((corners.bottomRightX - corners.topLeftX) / dimensions.width) * 100;
  const height =
    ((corners.bottomRightY - corners.topLeftY) / dimensions.height) * 100;

  if (![x, y, width, height].every(n => Number.isFinite(n))) {
    return undefined;
  }

  return {
    x: clampPercent(x),
    y: clampPercent(y),
    width: clampPercent(Math.max(0, width)),
    height: clampPercent(Math.max(0, height)),
    coordinateSpace: "percent",
  };
}

function clampPercent(n: number): number {
  return Math.min(100, Math.max(0, n));
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

function parsePixelCorners(
  raw: Record<string, unknown>
): OCRPixelCorners | undefined {
  const topLeftX = asNumber(raw.top_left_x ?? raw.topLeftX);
  const topLeftY = asNumber(raw.top_left_y ?? raw.topLeftY);
  const bottomRightX = asNumber(raw.bottom_right_x ?? raw.bottomRightX);
  const bottomRightY = asNumber(raw.bottom_right_y ?? raw.bottomRightY);

  if (
    topLeftX === undefined ||
    topLeftY === undefined ||
    bottomRightX === undefined ||
    bottomRightY === undefined
  ) {
    return undefined;
  }

  return { topLeftX, topLeftY, bottomRightX, bottomRightY };
}

function parseBlock(
  raw: unknown,
  dimensions?: { width: number; height: number; dpi: number }
): OCRBlock | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const obj = raw as Record<string, unknown>;
  const type = asString(obj.type) as OCRBlockType | undefined;
  if (!type) return undefined;

  const content = asString(obj.content) ?? "";
  const pixelCorners = parsePixelCorners(obj);
  const boundingBox = pixelCorners
    ? pixelCornersToPercent(pixelCorners, dimensions)
    : undefined;

  const block: OCRBlock = {
    type,
    content,
    pixelCorners,
    boundingBox,
  };

  const imageId = asString(obj.image_id ?? obj.imageId);
  if (imageId) block.imageId = imageId;
  const tableId = asString(obj.table_id ?? obj.tableId);
  if (tableId) block.tableId = tableId;

  return block;
}

function parseWordConfidence(raw: unknown): OCRWordConfidence | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const obj = raw as Record<string, unknown>;
  const text = asString(obj.text);
  const confidence = asNumber(obj.confidence);
  const startIndex = asNumber(obj.start_index ?? obj.startIndex);
  if (
    text === undefined ||
    confidence === undefined ||
    startIndex === undefined
  ) {
    return undefined;
  }
  return { text, confidence, startIndex };
}

function parseConfidenceScores(raw: unknown): OCRConfidenceScores | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const obj = raw as Record<string, unknown>;

  const averagePageConfidence = asNumber(
    obj.average_page_confidence_score ?? obj.averagePageConfidence
  );
  const minimumPageConfidence = asNumber(
    obj.minimum_page_confidence_score ?? obj.minimumPageConfidence
  );

  let wordConfidenceScores: OCRWordConfidence[] | undefined;
  const wordsRaw = obj.word_confidence_scores ?? obj.wordConfidenceScores;
  if (Array.isArray(wordsRaw)) {
    wordConfidenceScores = wordsRaw
      .map(parseWordConfidence)
      .filter((w): w is OCRWordConfidence => w !== undefined);
    if (wordConfidenceScores.length === 0) wordConfidenceScores = undefined;
  }

  if (
    averagePageConfidence === undefined &&
    minimumPageConfidence === undefined &&
    !wordConfidenceScores
  ) {
    return undefined;
  }

  return {
    averagePageConfidence,
    minimumPageConfidence,
    wordConfidenceScores,
  };
}

function deriveSignatures(
  pageNumber: number,
  blocks: OCRBlock[] | undefined
): OCRSignatureRegion[] | undefined {
  if (!blocks?.length) return undefined;
  const signatures = blocks
    .filter(b => b.type === "signature")
    .map(b => ({
      pageNumber,
      content: b.content,
      boundingBox: b.boundingBox,
      pixelCorners: b.pixelCorners,
      isIllegible: !b.content.trim(),
    }));
  return signatures.length > 0 ? signatures : undefined;
}

function parsePage(
  raw: unknown,
  index: number,
  options: ParseMistralOcrOptions
): OCRPage | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const obj = raw as Record<string, unknown>;

  const pageNumber =
    asNumber(obj.index) !== undefined
      ? (asNumber(obj.index) as number) + 1 // Mistral uses 0-based index
      : index + 1;

  let markdown = asString(obj.markdown) ?? "";
  if (options.redactMarkdown) {
    markdown = options.redactMarkdown(markdown);
  }

  let dimensions: OCRPage["dimensions"] | undefined;
  if (obj.dimensions && typeof obj.dimensions === "object") {
    const d = obj.dimensions as Record<string, unknown>;
    const width = asNumber(d.width);
    const height = asNumber(d.height);
    const dpi = asNumber(d.dpi) ?? 72;
    if (width !== undefined && height !== undefined) {
      dimensions = { width, height, dpi };
    }
  }

  let images: OCRPage["images"];
  if (Array.isArray(obj.images)) {
    images = obj.images
      .map(img => {
        if (!img || typeof img !== "object") return undefined;
        const i = img as Record<string, unknown>;
        const id = asString(i.id);
        const corners = parsePixelCorners(i);
        if (!id || !corners) return undefined;
        return {
          id,
          topLeftX: corners.topLeftX,
          topLeftY: corners.topLeftY,
          bottomRightX: corners.bottomRightX,
          bottomRightY: corners.bottomRightY,
        };
      })
      .filter((i): i is NonNullable<typeof i> => i !== undefined);
    if (images.length === 0) images = undefined;
  }

  const page: OCRPage = {
    pageNumber,
    markdown,
    images,
    dimensions,
  };

  if (options.includeDeepFeatures !== false) {
    if (Array.isArray(obj.blocks)) {
      const blocks = obj.blocks
        .map(b => parseBlock(b, dimensions))
        .filter((b): b is OCRBlock => b !== undefined);
      if (blocks.length > 0) {
        page.blocks = blocks;
        page.signatures = deriveSignatures(pageNumber, blocks);
      }
    }

    const confidenceScores = parseConfidenceScores(
      obj.confidence_scores ?? obj.confidenceScores
    );
    if (confidenceScores) {
      page.confidenceScores = confidenceScores;
    }
  }

  return page;
}

/**
 * Parse a raw Mistral OCR JSON response into typed pages.
 * Never throws on malformed deep fields — skips bad entries.
 */
export function parseMistralOcrResponse(
  raw: unknown,
  options: ParseMistralOcrOptions = {}
): ParsedMistralOcrResult {
  const deepFeaturesEnabled = options.includeDeepFeatures !== false;
  const empty: ParsedMistralOcrResult = {
    pages: [],
    deepFeaturesEnabled,
  };

  if (!raw || typeof raw !== "object") {
    return empty;
  }

  const obj = raw as Record<string, unknown>;
  const pagesRaw = Array.isArray(obj.pages) ? obj.pages : [];
  const pages = pagesRaw
    .map((p, i) =>
      parsePage(p, i, { ...options, includeDeepFeatures: deepFeaturesEnabled })
    )
    .filter((p): p is OCRPage => p !== undefined);

  let usageInfo: ParsedMistralOcrResult["usageInfo"];
  if (obj.usage_info && typeof obj.usage_info === "object") {
    const u = obj.usage_info as Record<string, unknown>;
    const pagesProcessed = asNumber(u.pages_processed);
    const tokensGenerated =
      asNumber(u.doc_size_tokens) ?? asNumber(u.doc_size_bytes);
    if (pagesProcessed !== undefined) {
      usageInfo = {
        pagesProcessed,
        tokensGenerated: tokensGenerated ?? 0,
      };
    }
  }

  return {
    pages,
    model: asString(obj.model),
    usageInfo,
    deepFeaturesEnabled,
  };
}

/**
 * Re-export summarize helper for callers that parse then stamp OCRResult.
 */
export { summarizeDeepFeatures };
