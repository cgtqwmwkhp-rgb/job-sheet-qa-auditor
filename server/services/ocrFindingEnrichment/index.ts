/**
 * OCR Finding Enrichment (PR-2)
 *
 * Attaches OCR-4 block bboxes and word confidence to analyzer findings
 * before they are persisted on audit_findings.
 */

export {
  enrichFindingsWithOcrEvidence,
  computePageConfidencePrior,
  hasOcrSignatureEvidence,
} from './enrichFindings';

export type {
  EnrichedFinding,
  FindingEvidenceSource,
  AuditFindingBoundingBox,
} from './types';
