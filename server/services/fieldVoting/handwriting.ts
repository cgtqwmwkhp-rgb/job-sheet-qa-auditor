/**
 * Handwriting / signature vote helpers (Wave-4 B2).
 *
 * Kills ensemble "Present" theater: label-only OCR Present without VLM/crop
 * ink evidence abstains. VLM Present + OCR agreement → high-confidence Present.
 */

import { fuseFieldResults, type OcrFieldResult, type ImageQaResult } from "../imageQaFusion";
import {
  voteField,
  type EngineFieldCandidate,
  type FieldVoteResult,
} from "./voteField";

export interface HandwritingVoteInput {
  fieldId: string;
  /** OCR / ensemble candidates (may include label-only Present). */
  ocrCandidates?: EngineFieldCandidate[];
  /** VLM ink verification (0–1 confidence). */
  vlm?: {
    present: boolean;
    confidence: number;
    quality?: "high" | "medium" | "low" | "unreadable";
  } | null;
  /** Crop OCR / ROI text for the signature region. */
  crop?: {
    value: string | null;
    confidence: number;
  } | null;
}

/**
 * Vote signature / handwriting field with VLM preferred over label theater.
 */
export function voteHandwritingField(
  input: HandwritingVoteInput
): FieldVoteResult {
  const candidates: EngineFieldCandidate[] = [
    ...(input.ocrCandidates ?? []).map(c => ({
      ...c,
      fieldId: input.fieldId,
    })),
  ];

  if (input.vlm) {
    candidates.push({
      engine: "vlm",
      fieldId: input.fieldId,
      value: input.vlm.present ? "Present" : "Absent",
      confidence: Math.max(0, Math.min(1, input.vlm.confidence)),
      evidenceStrength: "strong",
      evidence: "vlm_ink",
    });
  }

  if (input.crop?.value) {
    candidates.push({
      engine: "crop",
      fieldId: input.fieldId,
      value: input.crop.value,
      confidence: Math.max(0, Math.min(1, input.crop.confidence)),
      evidenceStrength: "strong",
      evidence: "crop_ocr",
    });
  }

  return voteField(input.fieldId, candidates);
}

/**
 * Fuse OCR presence with Image QA / VLM for signature honesty path.
 * Returns fused outcome; CONFLICT when high-confidence sources disagree.
 */
export function fuseHandwritingPresence(
  fieldId: string,
  ocr: {
    extracted: boolean;
    value: string | null;
    confidence: number;
    source?: OcrFieldResult["source"];
  } | null,
  imageQa: {
    present: boolean;
    confidence: number;
    quality?: ImageQaResult["quality"];
    issues?: string[];
  } | null
) {
  const ocrResult: OcrFieldResult | null = ocr
    ? {
        fieldId,
        extracted: ocr.extracted,
        value: ocr.value,
        confidence: ocr.confidence,
        source: ocr.source ?? "pattern",
      }
    : null;

  const imageQaResult: ImageQaResult | null = imageQa
    ? {
        fieldId,
        present: imageQa.present,
        confidence: imageQa.confidence,
        quality: imageQa.quality ?? "medium",
        issues: imageQa.issues ?? [],
      }
    : null;

  return fuseFieldResults(fieldId, ocrResult, imageQaResult);
}
