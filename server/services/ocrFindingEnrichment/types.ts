/**
 * OCR finding enrichment types (PR-2).
 *
 * Maps analyzer findings onto OCR-4 evidence (blocks, word confidence, signatures)
 * for persistence on audit_findings.boundingBox / confidence / pageNumber.
 */

import type { Finding } from '../analyzer';
import type { OCRBlockType, OCRBoundingBoxPercent } from '../ocrAdapter/types';

/**
 * Provenance of the bounding box attached to a finding.
 */
export type FindingEvidenceSource =
  | 'ocr_block'
  | 'ocr_word_span'
  | 'ocr_signature_block';

/**
 * Bounding box JSON stored on audit_findings.boundingBox (existing column).
 * Extends the analyzer Finding.boundingBox shape with audit metadata.
 */
export interface AuditFindingBoundingBox extends OCRBoundingBoxPercent {
  source: FindingEvidenceSource;
  blockType?: OCRBlockType;
  pageWidthPx?: number;
  pageHeightPx?: number;
}

/**
 * Finding after OCR evidence enrichment.
 * boundingBox may carry the extended AuditFindingBoundingBox shape;
 * analyzer.Finding.boundingBox remains structurally compatible (x/y/width/height).
 */
export type EnrichedFinding = Finding & {
  boundingBox?: Finding['boundingBox'] & Partial<AuditFindingBoundingBox>;
};
