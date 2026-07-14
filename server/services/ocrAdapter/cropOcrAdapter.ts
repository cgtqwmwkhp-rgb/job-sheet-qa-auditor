/**
 * Crop OCR Adapter (PR-AI-05 / CropVision)
 *
 * Renders a template ROI from a PDF page, then re-OCRs the crop so cramped /
 * handwriting-heavy fields are not limited to whole-PDF OCR plateaus.
 *
 * HTR (AI-15) is a follow-on: this path uses the configured OCR adapter on the
 * cropped image; a dedicated handwriting model can plug in later via the same
 * CropOcrRunner interface.
 *
 * Rendering uses @napi-rs/canvas when resolvable (pdfjs optional peer). Fail-soft
 * when canvas/PDF render is unavailable — never fabricates field values.
 */

import { createHash } from "crypto";
import { createRequire } from "node:module";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { RoiRegion } from "../templateRegistry/types";
import type { OCRAdapter, OCRResult } from "./types";

const require = createRequire(import.meta.url);

export const FEATURE_ROI_CROP_REOCR = "FEATURE_ROI_CROP_REOCR";

/** Default-on unless explicitly disabled — critical-field crop path. */
export function isRoiCropReocrEnabled(): boolean {
  const raw = (process.env[FEATURE_ROI_CROP_REOCR] ?? "true").toLowerCase();
  if (raw === "false" || raw === "0" || raw === "off") return false;
  return true;
}

export interface RoiCropImage {
  dataBase64: string;
  mediaType: "image/png";
  page: number;
  bounds: RoiRegion["bounds"];
  cropHash: string;
  widthPx: number;
  heightPx: number;
}

export interface CropOcrRequest {
  fieldId: string;
  roi: RoiRegion;
  /** PDF bytes for render → crop. Required unless cropImage is supplied. */
  pdfBuffer?: Buffer | null;
  /** Pre-rendered crop (skips PDF render). */
  cropImage?: RoiCropImage;
  /** Cap OCR retries on crop (keep cheap). */
  skipRetry?: boolean;
}

export interface CropOcrResult {
  fieldId: string;
  success: boolean;
  value: string | null;
  /** 0–1 confidence */
  confidence: number;
  method: "crop_ocr" | "unavailable";
  crop?: RoiCropImage;
  ocrText?: string;
  error?: string;
  processingTimeMs: number;
}

export type CropRenderer = (
  pdfBuffer: Buffer,
  roi: RoiRegion,
  options?: { scale?: number; paddingRatio?: number }
) => Promise<RoiCropImage | null>;

export type CropOcrRunner = (request: CropOcrRequest) => Promise<CropOcrResult>;

type NapiCanvasModule = {
  createCanvas: (
    width: number,
    height: number
  ) => {
    width: number;
    height: number;
    getContext: (type: "2d") => CanvasRenderingContext2D | null;
    toBuffer: (mime: "image/png") => Buffer;
  };
};

let cachedCanvas: NapiCanvasModule | null | undefined;

function loadNapiCanvas(): NapiCanvasModule | null {
  if (cachedCanvas !== undefined) return cachedCanvas;
  try {
    const pdfjsPkg = require.resolve("pdfjs-dist/package.json");
    const canvasPath = require.resolve("@napi-rs/canvas", { paths: [pdfjsPkg] });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cachedCanvas = require(canvasPath) as NapiCanvasModule;
    return cachedCanvas;
  } catch {
    cachedCanvas = null;
    return null;
  }
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function cropHashFor(
  page: number,
  bounds: RoiRegion["bounds"],
  widthPx: number,
  heightPx: number
): string {
  const raw = `${page}:${bounds.x.toFixed(4)},${bounds.y.toFixed(4)},${bounds.width.toFixed(4)},${bounds.height.toFixed(4)}:${widthPx}x${heightPx}`;
  return `crop_${createHash("sha256").update(raw).digest("hex").slice(0, 12)}`;
}

/**
 * Render a PDF page region to a PNG crop (normalized ROI bounds 0–1).
 * Fail-soft: returns null when canvas or PDF render fails.
 */
export async function renderRoiCropFromPdf(
  pdfBuffer: Buffer,
  roi: RoiRegion,
  options: { scale?: number; paddingRatio?: number } = {}
): Promise<RoiCropImage | null> {
  const canvasMod = loadNapiCanvas();
  if (!canvasMod) return null;
  if (!pdfBuffer?.length) return null;

  const scale = options.scale ?? 2;
  const pad = clamp01(options.paddingRatio ?? 0.04);
  const pageNum = Math.max(1, Math.floor(roi.page || 1));

  const bx = clamp01(roi.bounds.x);
  const by = clamp01(roi.bounds.y);
  const bw = clamp01(roi.bounds.width);
  const bh = clamp01(roi.bounds.height);
  if (bw <= 0.001 || bh <= 0.001) return null;

  try {
    const data = new Uint8Array(pdfBuffer);
    const loadingTask = getDocument({
      data,
      useSystemFonts: true,
      isEvalSupported: false,
      verbosity: 0,
    });
    const doc = await loadingTask.promise;
    if (pageNum > doc.numPages) {
      await doc.destroy();
      return null;
    }

    const page = await doc.getPage(pageNum);
    const viewport = page.getViewport({ scale });
    const full = canvasMod.createCanvas(viewport.width, viewport.height);
    const ctx = full.getContext("2d");
    if (!ctx) {
      await doc.destroy();
      return null;
    }

    await page.render({
      canvasContext: ctx as unknown as CanvasRenderingContext2D,
      viewport,
      // pdfjs node typings expect canvas factory; napi canvas is duck-typed
    } as Parameters<typeof page.render>[0]).promise;

    const x0 = Math.max(0, Math.floor((bx - pad) * viewport.width));
    const y0 = Math.max(0, Math.floor((by - pad) * viewport.height));
    const x1 = Math.min(
      viewport.width,
      Math.ceil((bx + bw + pad) * viewport.width)
    );
    const y1 = Math.min(
      viewport.height,
      Math.ceil((by + bh + pad) * viewport.height)
    );
    const widthPx = Math.max(1, x1 - x0);
    const heightPx = Math.max(1, y1 - y0);

    const cropCanvas = canvasMod.createCanvas(widthPx, heightPx);
    const cropCtx = cropCanvas.getContext("2d");
    if (!cropCtx) {
      await doc.destroy();
      return null;
    }
    cropCtx.drawImage(
      full as unknown as CanvasImageSource,
      x0,
      y0,
      widthPx,
      heightPx,
      0,
      0,
      widthPx,
      heightPx
    );

    const png = cropCanvas.toBuffer("image/png");
    await doc.destroy();

    return {
      dataBase64: png.toString("base64"),
      mediaType: "image/png",
      page: pageNum,
      bounds: roi.bounds,
      cropHash: cropHashFor(pageNum, roi.bounds, widthPx, heightPx),
      widthPx,
      heightPx,
    };
  } catch {
    return null;
  }
}

/** Pull a short field value from crop OCR markdown (first non-empty line). */
export function valueFromCropOcrText(
  ocrText: string,
  fieldId: string
): string | null {
  const cleaned = ocrText
    .replace(/\r/g, "")
    .split("\n")
    .map(l => l.replace(/^#+\s*/, "").trim())
    .filter(Boolean);
  if (!cleaned.length) return null;

  const labelHints: Record<string, RegExp[]> = {
    jobReference: [
      /(?:job\s*(?:ref(?:erence)?|no\.?|number|#)|jsr)\s*[:#-]?\s*([A-Z0-9][\w/-]{2,})/i,
      /\b(JOB[-_\s]?\d{3,}|\d{6,})\b/i,
    ],
    assetId: [
      /(?:asset(?:\s*id)?|fleet|reg(?:istration)?|plant)\s*[:#-]?\s*([A-Z0-9][\w/-]{2,})/i,
    ],
    date: [
      /(?:date|visited|completed)\s*[:#-]?\s*(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}|\d{4}-\d{2}-\d{2})/i,
      /\b(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})\b/,
    ],
    expiryDate: [
      /(?:expir(?:y|es|ation)|valid\s*until)\s*[:#-]?\s*(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}|\d{4}-\d{2}-\d{2})/i,
    ],
  };

  const patterns = labelHints[fieldId];
  const blob = cleaned.join("\n");
  if (patterns) {
    for (const re of patterns) {
      const m = blob.match(re);
      if (m?.[1]?.trim()) return m[1].trim().slice(0, 200);
    }
  }

  // Cramped single-value crops: use the densest short line
  const candidates = cleaned
    .filter(l => l.length <= 80)
    .sort((a, b) => a.length - b.length);
  return (candidates[0] ?? cleaned[0]).slice(0, 200);
}

function confidenceFromOcrResult(result: OCRResult): number {
  const pages = result.pages ?? [];
  const avg = pages
    .map(p => p.confidenceScores?.averagePageConfidence)
    .filter((n): n is number => typeof n === "number" && Number.isFinite(n));
  if (avg.length) {
    const mean = avg.reduce((a, b) => a + b, 0) / avg.length;
    // Mistral may return 0–100 or 0–1
    return mean > 1 ? Math.min(1, mean / 100) : Math.min(1, Math.max(0, mean));
  }
  // Successful crop OCR without scores — still above whole-page noise floor
  return result.success ? 0.82 : 0;
}

/**
 * Crop ROI (if needed) and re-OCR the image via the configured OCR adapter.
 */
export async function reOcrRoiCrop(
  request: CropOcrRequest,
  deps: {
    adapter?: OCRAdapter;
    render?: CropRenderer;
  } = {}
): Promise<CropOcrResult> {
  const start = Date.now();
  const fieldId = request.fieldId;

  let crop = request.cropImage ?? null;
  if (!crop && request.pdfBuffer?.length) {
    const render = deps.render ?? renderRoiCropFromPdf;
    crop = await render(request.pdfBuffer, request.roi);
  }

  if (!crop) {
    return {
      fieldId,
      success: false,
      value: null,
      confidence: 0,
      method: "unavailable",
      error: "ROI crop unavailable (no PDF render / crop image)",
      processingTimeMs: Date.now() - start,
    };
  }

  try {
    const adapter =
      deps.adapter ?? (await import("./index")).getOCRAdapter();
    const ocr = await adapter.extractFromBase64(
      crop.dataBase64,
      crop.mediaType,
      {
        skipRetry: request.skipRetry ?? true,
        pageLimit: 1,
        includeDeepFeatures: false,
      }
    );

    if (!ocr.success) {
      return {
        fieldId,
        success: false,
        value: null,
        confidence: 0,
        method: "unavailable",
        crop,
        error: ocr.error || ocr.errorCode || "crop OCR failed",
        processingTimeMs: Date.now() - start,
      };
    }

    const ocrText = ocr.pages.map(p => p.markdown || "").join("\n").trim();
    const value = valueFromCropOcrText(ocrText, fieldId);
    const confidence = value ? confidenceFromOcrResult(ocr) : 0;

    return {
      fieldId,
      success: Boolean(value),
      value,
      confidence,
      method: "crop_ocr",
      crop,
      ocrText,
      processingTimeMs: Date.now() - start,
    };
  } catch (err) {
    return {
      fieldId,
      success: false,
      value: null,
      confidence: 0,
      method: "unavailable",
      crop,
      error: err instanceof Error ? err.message : "crop OCR exception",
      processingTimeMs: Date.now() - start,
    };
  }
}

export function createCropOcrRunner(deps?: {
  adapter?: OCRAdapter;
  render?: CropRenderer;
}): CropOcrRunner {
  return request => reOcrRoiCrop(request, deps);
}
