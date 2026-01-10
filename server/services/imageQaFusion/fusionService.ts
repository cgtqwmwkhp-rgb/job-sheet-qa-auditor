/**
 * OCR + Image QA Fusion Service - PR-2
 * 
 * Fuses OCR text extraction with image-based quality assessment for:
 * - Signature blocks
 * - Tickbox blocks
 * 
 * Fusion rules create deterministic CONFLICT/LOW_CONFIDENCE outcomes.
 * Evidence includes ROI bbox and crop references.
 */

import { createSafeLogger } from '../../utils/safeLogger';

const logger = createSafeLogger('imageQaFusion');

/**
 * Image QA result from vision-based analysis
 */
export interface ImageQaResult {
  fieldId: string;
  present: boolean;
  confidence: number;
  quality: 'high' | 'medium' | 'low' | 'unreadable';
  issues: string[];
}

/**
 * OCR extraction result for a field
 */
export interface OcrFieldResult {
  fieldId: string;
  extracted: boolean;
  value: string | null;
  confidence: number;
  source: 'pattern' | 'roi' | 'context';
}

/**
 * ROI bounding box reference
 */
export interface RoiBbox {
  pageIndex: number;
  x: number;      // 0-1 normalized
  y: number;      // 0-1 normalized
  width: number;  // 0-1 normalized
  height: number; // 0-1 normalized
}

/**
 * Crop reference for evidence
 */
export interface CropReference {
  roiId: string;
  bbox: RoiBbox;
  cropHash: string;
  extractedAt: string;
}

/**
 * Fused field result combining OCR and Image QA
 */
export interface FusedFieldResult {
  fieldId: string;
  ocrResult: OcrFieldResult | null;
  imageQaResult: ImageQaResult | null;
  fusedOutcome: 'VALID' | 'LOW_CONFIDENCE' | 'CONFLICT' | 'MISSING_FIELD';
  fusedConfidence: number;
  fusedValue: string | boolean | null;
  fusionReason: string;
  cropReference?: CropReference;
}

/**
 * Fusion evidence artifact
 */
export interface FusionEvidence {
  documentId: string;
  timestamp: string;
  fusionVersion: string;
  fields: FusedFieldResult[];
  overallOutcome: 'VALID' | 'LOW_CONFIDENCE' | 'CONFLICT' | 'REVIEW_REQUIRED';
  processingTimeMs: number;
}

/**
 * Confidence thresholds for fusion decisions
 */
export const FUSION_THRESHOLDS = {
  ocrHighConfidence: 0.8,
  ocrMediumConfidence: 0.6,
  imageQaHighConfidence: 0.85,
  imageQaMediumConfidence: 0.65,
  fusionConflictGap: 0.3,
  minimumValidConfidence: 0.7,
} as const;

/**
 * Fields that require image QA fusion
 */
export const IMAGE_QA_FUSION_FIELDS = [
  'engineerSignOff',
  'signatureBlock',
  'complianceTickboxes',
  'tickboxBlock',
] as const;

export type ImageQaFusionField = typeof IMAGE_QA_FUSION_FIELDS[number];

/**
 * Determines if a field requires image QA fusion
 */
export function requiresImageQaFusion(fieldId: string): boolean {
  return IMAGE_QA_FUSION_FIELDS.includes(fieldId as ImageQaFusionField);
}

/**
 * Generate a deterministic crop hash from ROI and document
 */
function generateCropHash(documentId: string, roiId: string, bbox: RoiBbox): string {
  const input = `${documentId}:${roiId}:${bbox.pageIndex}:${bbox.x}:${bbox.y}:${bbox.width}:${bbox.height}`;
  // Simple deterministic hash for traceability
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return `crop_${Math.abs(hash).toString(16).padStart(8, '0')}`;
}

/**
 * Fuse OCR result with Image QA result for a single field
 * 
 * Fusion rules:
 * 1. If both agree (high confidence) → VALID
 * 2. If OCR says present but Image QA says absent (or vice versa) → CONFLICT
 * 3. If both low confidence → LOW_CONFIDENCE
 * 4. If one high, one low → Trust the higher, but mark as medium confidence
 * 5. If neither has result → MISSING_FIELD
 */
export function fuseFieldResults(
  fieldId: string,
  ocrResult: OcrFieldResult | null,
  imageQaResult: ImageQaResult | null,
  roiBbox?: RoiBbox,
  documentId?: string
): FusedFieldResult {
  const cropReference = roiBbox && documentId ? {
    roiId: fieldId,
    bbox: roiBbox,
    cropHash: generateCropHash(documentId, fieldId, roiBbox),
    extractedAt: new Date().toISOString(),
  } : undefined;

  // Case 5: Neither has result
  if (!ocrResult && !imageQaResult) {
    return {
      fieldId,
      ocrResult: null,
      imageQaResult: null,
      fusedOutcome: 'MISSING_FIELD',
      fusedConfidence: 0,
      fusedValue: null,
      fusionReason: 'No OCR or Image QA result available',
      cropReference,
    };
  }

  // Only OCR available
  if (!imageQaResult) {
    const outcome = ocrResult!.confidence >= FUSION_THRESHOLDS.minimumValidConfidence
      ? 'VALID' : 'LOW_CONFIDENCE';
    return {
      fieldId,
      ocrResult,
      imageQaResult: null,
      fusedOutcome: outcome,
      fusedConfidence: ocrResult!.confidence,
      fusedValue: ocrResult!.extracted ? ocrResult!.value : null,
      fusionReason: 'OCR only (no Image QA available)',
      cropReference,
    };
  }

  // Only Image QA available
  if (!ocrResult) {
    const outcome = imageQaResult.confidence >= FUSION_THRESHOLDS.minimumValidConfidence
      ? 'VALID' : 'LOW_CONFIDENCE';
    return {
      fieldId,
      ocrResult: null,
      imageQaResult,
      fusedOutcome: outcome,
      fusedConfidence: imageQaResult.confidence,
      fusedValue: imageQaResult.present,
      fusionReason: 'Image QA only (no OCR available)',
      cropReference,
    };
  }

  // Both available - apply fusion rules
  const ocrPresent = ocrResult.extracted;
  const imageQaPresent = imageQaResult.present;
  const ocrConf = ocrResult.confidence;
  const imageQaConf = imageQaResult.confidence;

  // Case 2: Conflict - OCR and Image QA disagree
  if (ocrPresent !== imageQaPresent) {
    // Both high confidence but disagree → definite CONFLICT
    if (ocrConf >= FUSION_THRESHOLDS.ocrHighConfidence && 
        imageQaConf >= FUSION_THRESHOLDS.imageQaHighConfidence) {
      return {
        fieldId,
        ocrResult,
        imageQaResult,
        fusedOutcome: 'CONFLICT',
        fusedConfidence: Math.min(ocrConf, imageQaConf),
        fusedValue: null,
        fusionReason: `OCR (${ocrPresent ? 'present' : 'absent'}) conflicts with Image QA (${imageQaPresent ? 'present' : 'absent'})`,
        cropReference,
      };
    }

    // Case 4: One high, one low → trust higher, mark low confidence
    if (ocrConf >= FUSION_THRESHOLDS.ocrHighConfidence) {
      return {
        fieldId,
        ocrResult,
        imageQaResult,
        fusedOutcome: 'LOW_CONFIDENCE',
        fusedConfidence: ocrConf * 0.7, // Penalize for disagreement
        fusedValue: ocrResult.value,
        fusionReason: 'Trusting OCR (high confidence) over Image QA (low confidence)',
        cropReference,
      };
    }

    if (imageQaConf >= FUSION_THRESHOLDS.imageQaHighConfidence) {
      return {
        fieldId,
        ocrResult,
        imageQaResult,
        fusedOutcome: 'LOW_CONFIDENCE',
        fusedConfidence: imageQaConf * 0.7, // Penalize for disagreement
        fusedValue: imageQaPresent,
        fusionReason: 'Trusting Image QA (high confidence) over OCR (low confidence)',
        cropReference,
      };
    }

    // Both low confidence and disagree → CONFLICT
    return {
      fieldId,
      ocrResult,
      imageQaResult,
      fusedOutcome: 'CONFLICT',
      fusedConfidence: Math.max(ocrConf, imageQaConf) * 0.5,
      fusedValue: null,
      fusionReason: 'Both OCR and Image QA have low confidence and disagree',
      cropReference,
    };
  }

  // Agreement path
  // Case 1: Both agree with high confidence → VALID
  if (ocrConf >= FUSION_THRESHOLDS.ocrHighConfidence && 
      imageQaConf >= FUSION_THRESHOLDS.imageQaHighConfidence) {
    // Boost confidence when both agree
    const fusedConf = Math.min(1.0, (ocrConf + imageQaConf) / 2 * 1.1);
    return {
      fieldId,
      ocrResult,
      imageQaResult,
      fusedOutcome: 'VALID',
      fusedConfidence: fusedConf,
      fusedValue: ocrPresent ? ocrResult.value ?? true : false,
      fusionReason: 'OCR and Image QA agree with high confidence',
      cropReference,
    };
  }

  // Case 3: Both agree but low confidence → LOW_CONFIDENCE
  if (ocrConf < FUSION_THRESHOLDS.ocrMediumConfidence || 
      imageQaConf < FUSION_THRESHOLDS.imageQaMediumConfidence) {
    return {
      fieldId,
      ocrResult,
      imageQaResult,
      fusedOutcome: 'LOW_CONFIDENCE',
      fusedConfidence: (ocrConf + imageQaConf) / 2,
      fusedValue: ocrPresent ? ocrResult.value ?? true : false,
      fusionReason: 'OCR and Image QA agree but with low confidence',
      cropReference,
    };
  }

  // Medium confidence agreement
  const fusedConf = (ocrConf + imageQaConf) / 2;
  const outcome = fusedConf >= FUSION_THRESHOLDS.minimumValidConfidence ? 'VALID' : 'LOW_CONFIDENCE';
  return {
    fieldId,
    ocrResult,
    imageQaResult,
    fusedOutcome: outcome,
    fusedConfidence: fusedConf,
    fusedValue: ocrPresent ? ocrResult.value ?? true : false,
    fusionReason: 'OCR and Image QA agree with medium confidence',
    cropReference,
  };
}

/**
 * Fuse all fields requiring image QA and generate evidence
 */
export function fuseAllFields(
  documentId: string,
  ocrResults: Map<string, OcrFieldResult>,
  imageQaResults: Map<string, ImageQaResult>,
  roiBboxes: Map<string, RoiBbox>
): FusionEvidence {
  const startTime = Date.now();
  const fields: FusedFieldResult[] = [];

  // Process all Image QA fusion fields
  for (const fieldId of IMAGE_QA_FUSION_FIELDS) {
    const ocrResult = ocrResults.get(fieldId) ?? null;
    const imageQaResult = imageQaResults.get(fieldId) ?? null;
    const roiBbox = roiBboxes.get(fieldId);

    const fusedResult = fuseFieldResults(
      fieldId,
      ocrResult,
      imageQaResult,
      roiBbox,
      documentId
    );
    fields.push(fusedResult);
  }

  // Sort fields deterministically by fieldId
  fields.sort((a, b) => a.fieldId.localeCompare(b.fieldId));

  // Determine overall outcome
  const hasConflict = fields.some(f => f.fusedOutcome === 'CONFLICT');
  const hasLowConfidence = fields.some(f => f.fusedOutcome === 'LOW_CONFIDENCE');
  const hasMissing = fields.some(f => f.fusedOutcome === 'MISSING_FIELD');

  let overallOutcome: FusionEvidence['overallOutcome'];
  if (hasConflict) {
    overallOutcome = 'CONFLICT';
  } else if (hasLowConfidence || hasMissing) {
    overallOutcome = 'REVIEW_REQUIRED';
  } else {
    overallOutcome = 'VALID';
  }

  const processingTimeMs = Date.now() - startTime;

  logger.info('Fusion complete', {
    documentId,
    fieldsProcessed: fields.length,
    overallOutcome,
    conflictCount: fields.filter(f => f.fusedOutcome === 'CONFLICT').length,
    processingTimeMs,
  });

  return {
    documentId,
    timestamp: new Date().toISOString(),
    fusionVersion: '1.0.0',
    fields,
    overallOutcome,
    processingTimeMs,
  };
}

/**
 * Generate JSON evidence artifact
 */
export function generateFusionEvidenceJson(evidence: FusionEvidence): string {
  return JSON.stringify(evidence, null, 2);
}
