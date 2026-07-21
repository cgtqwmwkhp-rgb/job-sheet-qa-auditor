/**
 * Text-layer-first extraction types (PR1 / PX-100 / PX-103).
 *
 * Grounded fields always carry a source span. Generative OCR confidence is
 * never treated as measurement for statutory header fields.
 */

export type TextLayerSource = "text_layer";

export type PageKind = "born_digital" | "scan" | "empty";

export type DocumentKind = "born_digital" | "scan" | "hybrid" | "empty";

/** Logical strategy stamp for bake-off / reportJson (DB enum maps separately). */
export type DocumentStrategyLogical = "text_layer" | "ocr" | "hybrid";

export interface TextLayerBBox {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Grounded field value — only emit when tokens sit near a label anchor.
 */
export interface GroundedTextLayerField {
  fieldId: string;
  value: string;
  page: number;
  bbox: TextLayerBBox;
  source: TextLayerSource;
  /** 0–1; text-layer label-anchored values are high but honest. */
  confidence: number;
  /** Matched label text (e.g. "Asset No"). */
  label?: string;
}

export interface PageClassification {
  pageNumber: number;
  kind: PageKind;
  usableChars: number;
  wordCount: number;
}

export interface DocumentClassification {
  kind: DocumentKind;
  /** True when primary Mistral OCR should be skipped. */
  skipPrimaryOcr: boolean;
  documentStrategy: DocumentStrategyLogical;
  pages: PageClassification[];
  usableChars: number;
  digitalPageCount: number;
  scanPageCount: number;
  reason: string;
}

export interface TextLayerExtractionResult {
  classification: DocumentClassification;
  fullText: string;
  pageTexts: string[];
  fields: GroundedTextLayerField[];
  /** PreExtracted-shaped map (confidence 0–100) for pipeline merge. */
  preExtracted: Record<
    string,
    { value: string; confidence: number; pageNumber: number }
  >;
  /**
   * Field ids text-layer examined and rejected (e.g. date+label bleed).
   * FieldAuthority must not fill these from Gemini/ensemble (Wave B PX-112).
   */
  abstainFieldIds?: string[];
}
