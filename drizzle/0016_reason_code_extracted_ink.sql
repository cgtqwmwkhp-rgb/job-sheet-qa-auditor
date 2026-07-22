-- Repair fix pack: successful extraction + ink-unverified theater reason codes
ALTER TABLE `audit_findings`
  MODIFY COLUMN `reasonCode` ENUM(
    'MISSING_FIELD',
    'UNREADABLE_FIELD',
    'LOW_CONFIDENCE',
    'INVALID_FORMAT',
    'CONFLICT',
    'OUT_OF_POLICY',
    'INCOMPLETE_EVIDENCE',
    'OCR_FAILURE',
    'PIPELINE_ERROR',
    'SPEC_GAP',
    'SECURITY_RISK',
    'EXTRACTED',
    'INK_UNVERIFIED'
  ) NOT NULL;
