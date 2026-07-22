/**
 * Pack v1 — shared document raster path for VLM ink + Image QA + photo pairs.
 *
 * Renders PDF pages / signature ROIs to PNG via the existing crop renderer so
 * `image_qa_unavailable` is not the default when a PDF buffer exists.
 */

import { renderRoiCropFromPdf } from "../ocrAdapter/cropOcrAdapter";
import type { PageImageInput } from "../multimodalRoiExtract";
import type { VlmCropImage } from "../vlmAdapter";
import type { RoiConfig, RoiRegion } from "../templateRegistry/types";
import { resolveSignatureRois } from "../vlmInkVerification";

export interface DocumentImageBundle {
  pageImages: PageImageInput[];
  cropImages: Record<string, VlmCropImage>;
  /** True when at least one page or crop raster was produced. */
  hasRaster: boolean;
}

const FULL_PAGE: RoiRegion = {
  name: "pageFull",
  page: 1,
  bounds: { x: 0, y: 0, width: 1, height: 1 },
  fields: [],
};

/**
 * Build page bitmaps + signature crops from a PDF buffer (fail-soft).
 */
export async function buildDocumentImageBundle(options: {
  pdfBuffer?: Buffer | null;
  roiConfig?: RoiConfig | null;
  /** Pre-existing crops from ROI crop re-OCR (merged in). */
  existingCrops?: Record<string, VlmCropImage>;
  /** Max pages to rasterize (default 1 — signature usually page 1). */
  maxPages?: number;
}): Promise<DocumentImageBundle> {
  const cropImages: Record<string, VlmCropImage> = {
    ...(options.existingCrops ?? {}),
  };
  const pageImages: PageImageInput[] = [];
  const buffer = options.pdfBuffer;
  if (!buffer?.length) {
    return {
      pageImages,
      cropImages,
      hasRaster: Object.keys(cropImages).length > 0,
    };
  }

  const maxPages = Math.max(1, options.maxPages ?? 1);

  // Full-page raster(s) — Image QA / pair-compare fallback media.
  for (let page = 1; page <= maxPages; page++) {
    const pageRoi: RoiRegion = { ...FULL_PAGE, name: `page${page}`, page };
    const rendered = await renderRoiCropFromPdf(buffer, pageRoi, {
      scale: 1.5,
    });
    if (rendered) {
      pageImages.push({
        page,
        data: rendered.dataBase64,
        mediaType: "image/png",
        encoding: "base64",
        width: rendered.widthPx,
        height: rendered.heightPx,
      });
    }
  }

  // Signature ROI crops for VLM ink (prefer pixel crop over full PDF).
  const sigRois = resolveSignatureRois(options.roiConfig);
  for (const roi of sigRois) {
    const key = roi.name || "signatureBlock";
    if (cropImages[key]?.data) continue;
    const crop = await renderRoiCropFromPdf(buffer, roi, { scale: 2 });
    if (crop) {
      cropImages[key] = {
        data: crop.dataBase64,
        mediaType: "image/png",
        encoding: "base64",
      };
    }
  }

  return {
    pageImages,
    cropImages,
    hasRaster:
      pageImages.length > 0 || Object.values(cropImages).some(c => !!c?.data),
  };
}
