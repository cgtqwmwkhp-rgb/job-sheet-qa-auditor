/**
 * Signature ink verification via Anthropic VLM.
 * AI-09: prefer cropped signature ROIs over full-PDF (reduces alias blur).
 * Fail-soft: never throws; returns skipped result when disabled/unavailable.
 */

import { fetchPdfBuffer } from "./embeddedPdfText";
import { runImageQa, type ImageQaResult } from "./roiProcessor";
import type { RoiConfig, RoiRegion } from "./templateRegistry/types";
import {
  getVlmConfig,
  isVlmVerificationEnabled,
  type VlmCropImage,
  type VlmDocumentPdf,
} from "./vlmAdapter";
import {
  findSignatureRois,
  resolveCropForRoi,
  type PageImageInput,
  type RoiCropReference,
} from "./multimodalRoiExtract";
import { createSafeLogger } from "../utils/safeLogger";

const logger = createSafeLogger("VlmInkVerification");

/** Soft size cap — Anthropic PDF document inputs should stay modest. */
export const VLM_PDF_MAX_BYTES = 8 * 1024 * 1024;

const DEFAULT_SIGNATURE_ROI: RoiRegion = {
  name: "signatureBlock",
  page: 1,
  bounds: {
    x: 0.05,
    y: 0.7,
    width: 0.9,
    height: 0.25,
  },
  fields: ["customerSignature", "technicianSignature"],
};

export interface SignatureInkVerificationResult {
  ran: boolean;
  skippedReason?: string;
  imageQa?: ImageQaResult;
  preExtractedHint?: {
    value: string;
    confidence: number;
    pageNumber: number;
  };
  /** Per-ROI crop results when multiple signature regions exist. */
  cropResults?: Array<{
    roiId: string;
    page: number;
    media: "crop" | "page" | "pdf";
    passed: boolean;
    confidence: number;
    cropReference: RoiCropReference | null;
    imageQa: ImageQaResult;
  }>;
  artifact: Record<string, unknown>;
}

export function isGeminiMultimodalEnabled(): boolean {
  const flag = process.env.FEATURE_GEMINI_MULTIMODAL;
  if (flag === "false" || flag === "0") return false;
  if (flag === "true" || flag === "1") return true;
  // Default on when Gemini is configured — multimodal PDF improves ink/layout judgment.
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

export function pdfBufferToVlmDocument(buffer: Buffer): VlmDocumentPdf | null {
  if (!buffer.length || buffer.length > VLM_PDF_MAX_BYTES) {
    return null;
  }
  return {
    data: buffer.toString("base64"),
    mediaType: "application/pdf",
    encoding: "base64",
  };
}

export function resolveSignatureRois(
  roiConfig?: RoiConfig | null,
  explicit?: RoiRegion | RoiRegion[] | null
): RoiRegion[] {
  if (explicit) {
    return Array.isArray(explicit) ? explicit : [explicit];
  }
  const fromConfig = findSignatureRois(roiConfig?.regions ?? []);
  if (fromConfig.length > 0) return fromConfig;
  return [DEFAULT_SIGNATURE_ROI];
}

function hintFromImageQa(
  imageQa: ImageQaResult,
  pageNumber: number
): SignatureInkVerificationResult["preExtractedHint"] {
  if (imageQa.vlmUsed && imageQa.passed) {
    return {
      value: "Present",
      confidence: Math.round(imageQa.confidence * 100),
      pageNumber,
    };
  }
  if (imageQa.vlmUsed && !imageQa.passed) {
    return {
      value: "Absent",
      confidence: Math.round(imageQa.confidence * 100),
      pageNumber,
    };
  }
  return undefined;
}

/**
 * Run Anthropic VLM ink verification against cropped signature ROIs (preferred)
 * or the full job-sheet PDF (fallback).
 */
export async function verifySignatureInk(options: {
  documentUrl: string;
  pdfBuffer?: Buffer | null;
  disputed?: boolean;
  disputeReason?: string;
  extractionConfidence?: number;
  /** Template ROI config — used to locate signature crops. */
  roiConfig?: RoiConfig | null;
  /** Explicit signature ROI(s); overrides roiConfig lookup. */
  signatureRoi?: RoiRegion | RoiRegion[] | null;
  /** Optional pre-cropped signature images keyed by ROI name. */
  cropImages?: Record<string, VlmCropImage>;
  /** Optional page bitmaps for pixel cropping. */
  pageImages?: PageImageInput[];
}): Promise<SignatureInkVerificationResult> {
  if (!isVlmVerificationEnabled()) {
    return {
      ran: false,
      skippedReason: "FEATURE_VLM_VERIFICATION off",
      artifact: { enabled: false },
    };
  }

  const config = getVlmConfig();
  let buffer = options.pdfBuffer ?? null;
  if (!buffer) {
    buffer = await fetchPdfBuffer(options.documentUrl);
  }

  const documentPdf = buffer ? pdfBufferToVlmDocument(buffer) : null;
  const signatureRois = resolveSignatureRois(
    options.roiConfig,
    options.signatureRoi
  ).slice(0, Math.max(1, config.maxCropsPerDoc));

  if (!documentPdf && !options.pageImages?.length && !options.cropImages) {
    return {
      ran: false,
      skippedReason: buffer ? "pdf_too_large_or_empty" : "pdf_fetch_failed",
      artifact: {
        enabled: true,
        provider: config.provider,
        error: buffer ? "pdf_too_large_or_empty" : "pdf_fetch_failed",
        bytes: buffer?.length,
      },
    };
  }

  try {
    const cropResults: NonNullable<
      SignatureInkVerificationResult["cropResults"]
    > = [];

    for (const roi of signatureRois) {
      const resolved = resolveCropForRoi(roi, {
        cropImages: options.cropImages,
        pageImages: options.pageImages,
      });

      const media: "crop" | "page" | "pdf" =
        resolved.media === "crop" || resolved.media === "page"
          ? resolved.media
          : "pdf";

      const boundsHint = `${roi.bounds.x.toFixed(3)},${roi.bounds.y.toFixed(3)},${roi.bounds.width.toFixed(3)},${roi.bounds.height.toFixed(3)}`;
      const disputeReason =
        options.disputeReason ||
        (media === "crop"
          ? "Handwritten ink not visible to OCR; verify cropped signature ROI"
          : `Handwritten ink not visible to OCR; verify signature ROI ${roi.name} at bounds ${boundsHint}`);

      const imageQa = await runImageQa(roi, "signatureBlock", {
        cropImage: resolved.cropImage,
        documentPdf: resolved.cropImage
          ? undefined
          : (documentPdf ?? undefined),
        disputed: options.disputed !== false,
        disputeReason,
        extractionConfidence: options.extractionConfidence ?? 0.4,
      });

      cropResults.push({
        roiId: roi.name,
        page: roi.page || 1,
        media,
        passed: imageQa.passed,
        confidence: imageQa.confidence,
        cropReference: resolved.reference,
        imageQa,
      });
    }

    // Aggregate: any clear Present wins; else if all Absent → Absent; else best effort.
    const vlmCrops = cropResults.filter(c => c.imageQa.vlmUsed);
    const presentCrop = vlmCrops.find(c => c.passed);
    const best =
      presentCrop ??
      vlmCrops.sort((a, b) => b.confidence - a.confidence)[0] ??
      cropResults[0];

    const imageQa = best.imageQa;
    const hint = hintFromImageQa(imageQa, best.page);

    logger.info("Signature ink verification complete", {
      vlmUsed: imageQa.vlmUsed,
      passed: imageQa.passed,
      confidence: imageQa.confidence,
      provider: imageQa.vlmProvider,
      cropCount: cropResults.length,
      media: best.media,
      pixelCropped: best.cropReference?.pixelCropped === true,
    });

    return {
      ran: true,
      imageQa,
      preExtractedHint: hint,
      cropResults,
      artifact: {
        enabled: true,
        provider: imageQa.vlmProvider || config.provider,
        model: imageQa.vlmModel || config.model,
        vlmUsed: imageQa.vlmUsed === true,
        passed: imageQa.passed,
        confidence: imageQa.confidence,
        details: imageQa.details,
        media: best.media === "crop" ? "image/png" : "application/pdf",
        mediaMode: best.media,
        pixelCropped: best.cropReference?.pixelCropped === true,
        cropHash: best.cropReference?.cropHash,
        cropCount: cropResults.length,
        crops: cropResults.map(c => ({
          roiId: c.roiId,
          page: c.page,
          media: c.media,
          passed: c.passed,
          confidence: c.confidence,
          cropHash: c.cropReference?.cropHash,
          pixelCropped: c.cropReference?.pixelCropped === true,
          bbox: c.cropReference?.bbox,
        })),
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    logger.warn("Signature ink verification failed soft", { message });
    return {
      ran: false,
      skippedReason: "exception",
      artifact: {
        enabled: true,
        provider: config.provider,
        error: message,
      },
    };
  }
}
