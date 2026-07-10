/**
 * Signature ink verification via Anthropic VLM (PDF document path).
 * Fail-soft: never throws; returns null when disabled or unavailable.
 */

import { fetchPdfBuffer } from "./embeddedPdfText";
import { runImageQa, type ImageQaResult } from "./roiProcessor";
import type { RoiRegion } from "./templateRegistry/types";
import {
  getVlmConfig,
  isVlmVerificationEnabled,
  type VlmDocumentPdf,
} from "./vlmAdapter";
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

/**
 * Run Anthropic VLM ink verification against the job-sheet PDF.
 * Called when FEATURE_VLM_VERIFICATION is on and signature evidence is disputed
 * or label-only (OCR cannot see handwriting).
 */
export async function verifySignatureInk(options: {
  documentUrl: string;
  pdfBuffer?: Buffer | null;
  disputed?: boolean;
  disputeReason?: string;
  extractionConfidence?: number;
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
  if (!buffer) {
    return {
      ran: false,
      skippedReason: "pdf_fetch_failed",
      artifact: {
        enabled: true,
        provider: config.provider,
        error: "pdf_fetch_failed",
      },
    };
  }

  const documentPdf = pdfBufferToVlmDocument(buffer);
  if (!documentPdf) {
    return {
      ran: false,
      skippedReason: "pdf_too_large_or_empty",
      artifact: {
        enabled: true,
        provider: config.provider,
        error: "pdf_too_large_or_empty",
        bytes: buffer.length,
      },
    };
  }

  try {
    const imageQa = await runImageQa(DEFAULT_SIGNATURE_ROI, "signatureBlock", {
      documentPdf,
      disputed: options.disputed !== false,
      disputeReason:
        options.disputeReason ||
        "Handwritten ink not visible to OCR; verify signature area",
      extractionConfidence: options.extractionConfidence ?? 0.4,
    });

    const hint =
      imageQa.vlmUsed && imageQa.passed
        ? {
            value: "Present",
            confidence: Math.round(imageQa.confidence * 100),
            pageNumber: 1,
          }
        : imageQa.vlmUsed && !imageQa.passed
          ? {
              value: "Absent",
              confidence: Math.round(imageQa.confidence * 100),
              pageNumber: 1,
            }
          : undefined;

    logger.info("Signature ink verification complete", {
      vlmUsed: imageQa.vlmUsed,
      passed: imageQa.passed,
      confidence: imageQa.confidence,
      provider: imageQa.vlmProvider,
    });

    return {
      ran: true,
      imageQa,
      preExtractedHint: hint,
      artifact: {
        enabled: true,
        provider: imageQa.vlmProvider || config.provider,
        model: imageQa.vlmModel || config.model,
        vlmUsed: imageQa.vlmUsed === true,
        passed: imageQa.passed,
        confidence: imageQa.confidence,
        details: imageQa.details,
        media: "application/pdf",
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
