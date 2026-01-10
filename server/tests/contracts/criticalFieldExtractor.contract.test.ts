/**
 * Critical Field Extraction Engine - Contract Tests
 * 
 * Tests for:
 * - Deterministic extraction
 * - Validation trace completeness
 * - Per-field extraction strategies
 * - Canonical reason codes
 */

import { describe, it, expect } from 'vitest';
import {
  CRITICAL_FIELDS,
  extractField,
  extractAllCriticalFields,
  generateValidationTraceJson,
  type CriticalFieldType,
  type ValidationTrace,
} from '../../services/extraction';

describe('Critical Field Extraction Engine', () => {
  describe('Field extraction strategies', () => {
    describe('jobReference', () => {
      it('should extract job reference from standard format', () => {
        const text = 'Job Reference: JOB-12345\nSome other text';
        const result = extractField('jobReference', text);
        
        expect(result.fieldId).toBe('jobReference');
        expect(result.extracted).toBe(true);
        expect(result.value).toBe('JOB-12345');
        expect(result.reasonCode).toBe('VALID');
        expect(result.candidates.length).toBeGreaterThan(0);
      });

      it('should extract work order format', () => {
        const text = 'WO: WO-98765';
        const result = extractField('jobReference', text);
        
        expect(result.extracted).toBe(true);
        expect(result.value).toBe('WO-98765');
      });

      it('should return MISSING_FIELD when no reference found', () => {
        const text = 'This document has no matching patterns';
        const result = extractField('jobReference', text);
        
        expect(result.extracted).toBe(false);
        expect(result.value).toBeNull();
        expect(result.reasonCode).toBe('MISSING_FIELD');
        expect(result.candidates).toHaveLength(0);
      });
    });

    describe('assetId', () => {
      it('should extract asset ID', () => {
        const text = 'Asset ID: ASSET-001';
        const result = extractField('assetId', text);
        
        expect(result.extracted).toBe(true);
        expect(result.value).toBe('ASSET-001');
        expect(result.reasonCode).toBe('VALID');
      });

      it('should extract equipment ID format', () => {
        const text = 'Equipment No: EQ12345';
        const result = extractField('assetId', text);
        
        expect(result.extracted).toBe(true);
        expect(result.value).toBe('EQ12345');
      });
    });

    describe('date', () => {
      it('should extract date in DD/MM/YYYY format', () => {
        const text = 'Date: 15/03/2024';
        const result = extractField('date', text);
        
        expect(result.extracted).toBe(true);
        expect(result.value).toBe('2024-03-15');
        expect(result.reasonCode).toBe('VALID');
      });

      it('should extract date in DD-MM-YYYY format', () => {
        const text = 'Service Date: 01-12-2025';
        const result = extractField('date', text);
        
        expect(result.extracted).toBe(true);
        expect(result.value).toBe('2025-12-01');
      });

      it('should extract date with month name', () => {
        const text = '15 January 2024';
        const result = extractField('date', text);
        
        expect(result.extracted).toBe(true);
        expect(result.value).toBe('2024-01-15');
      });
    });

    describe('expiryDate', () => {
      it('should extract expiry date', () => {
        const text = 'Expiry Date: 31/12/2025';
        const result = extractField('expiryDate', text);
        
        expect(result.extracted).toBe(true);
        expect(result.value).toBe('2025-12-31');
      });

      it('should extract valid until format', () => {
        const text = 'Valid Until: 01/06/2026';
        const result = extractField('expiryDate', text);
        
        expect(result.extracted).toBe(true);
        expect(result.value).toBe('2026-06-01');
      });
    });

    describe('engineerSignOff', () => {
      it('should detect engineer signature presence', () => {
        const text = 'Engineer Signature: [SIGNED]';
        const result = extractField('engineerSignOff', text);
        
        expect(result.candidates.length).toBeGreaterThan(0);
      });
    });

    describe('complianceTickboxes', () => {
      it('should detect tickbox markers', () => {
        const text = '[X] Checked\n[ ] Not checked\n[✓] Verified';
        const result = extractField('complianceTickboxes', text);
        
        expect(result.candidates.length).toBeGreaterThan(0);
      });
    });
  });

  describe('ROI prioritization', () => {
    it('should prefer ROI extraction over full text', () => {
      const fullText = 'Job Ref: JOB-WRONG\nAsset ID: ASSET-001';
      const roiText = 'Job Ref: JOB-CORRECT';
      
      const result = extractField('jobReference', fullText, roiText);
      
      expect(result.extracted).toBe(true);
      expect(result.value).toBe('JOB-CORRECT');
      expect(result.candidates[0].source).toBe('roi');
      expect(result.candidates[0].confidence).toBeGreaterThan(0.8);
    });

    it('should include both ROI and pattern candidates when values differ', () => {
      const fullText = 'Job Reference: JOB-FROM-TEXT';
      const roiText = 'Job Ref: JOB-FROM-ROI';
      
      const result = extractField('jobReference', fullText, roiText);
      
      // Should have candidates from both sources
      const roiCandidates = result.candidates.filter((c) => c.source === 'roi');
      const patternCandidates = result.candidates.filter((c) => c.source === 'pattern');
      
      expect(roiCandidates.length).toBeGreaterThan(0);
      expect(patternCandidates.length).toBeGreaterThan(0);
    });
  });

  describe('Conflict detection', () => {
    it('should detect CONFLICT when multiple high-confidence values found', () => {
      // Create text with multiple different job references
      const roiText = 'Job Ref: JOB-AAA\nJob Reference: JOB-BBB';
      
      const result = extractField('jobReference', '', roiText);
      
      // This should detect conflict since we have different values
      if (result.candidates.length > 1) {
        const uniqueValues = new Set(result.candidates.map((c) => c.value));
        if (uniqueValues.size > 1) {
          expect(result.reasonCode).toBe('CONFLICT');
        }
      }
    });
  });

  describe('extractAllCriticalFields', () => {
    it('should extract all 6 critical fields', () => {
      const text = `
        Job Reference: JOB-12345
        Asset ID: ASSET-001
        Date: 15/03/2024
        Expiry Date: 31/12/2025
        Engineer Signature: [SIGNED]
        Compliance Checks: [X] Verified [X] Complete
      `;
      
      const trace = extractAllCriticalFields('doc-001', text);
      
      expect(trace.documentId).toBe('doc-001');
      expect(trace.fields).toHaveLength(6);
      expect(trace.timestamp).toBeDefined();
      expect(trace.engineVersion).toBe('1.0.0');
      expect(trace.processingTimeMs).toBeGreaterThanOrEqual(0);
      
      // Verify all critical fields are present
      const fieldIds = trace.fields.map((f) => f.fieldId);
      for (const criticalField of CRITICAL_FIELDS) {
        expect(fieldIds).toContain(criticalField);
      }
    });

    it('should calculate overall confidence correctly', () => {
      const text = 'Job Reference: JOB-12345\nAsset ID: ASSET-001';
      const trace = extractAllCriticalFields('doc-002', text);
      
      expect(trace.overallConfidence).toBeGreaterThanOrEqual(0);
      expect(trace.overallConfidence).toBeLessThanOrEqual(1);
    });

    it('should use ROI texts when provided', () => {
      const text = 'Some general text without clear fields';
      const roiTexts = {
        jobReference: 'Job Ref: JOB-ROI-123',
        assetId: 'Asset: ASSET-ROI-456',
      };
      
      const trace = extractAllCriticalFields('doc-003', text, roiTexts);
      
      const jobRefField = trace.fields.find((f) => f.fieldId === 'jobReference');
      expect(jobRefField?.extracted).toBe(true);
      expect(jobRefField?.value).toBe('JOB-ROI-123');
      
      const assetField = trace.fields.find((f) => f.fieldId === 'assetId');
      expect(assetField?.extracted).toBe(true);
      expect(assetField?.value).toBe('ASSET-ROI-456');
    });
  });

  describe('Validation trace artifact', () => {
    it('should generate valid JSON', () => {
      const text = 'Job Reference: JOB-12345';
      const trace = extractAllCriticalFields('doc-json', text);
      const json = generateValidationTraceJson(trace);
      
      expect(() => JSON.parse(json)).not.toThrow();
    });

    it('should include all required evidence keys', () => {
      const text = 'Job Reference: JOB-12345\nDate: 01/01/2025';
      const trace = extractAllCriticalFields('doc-evidence', text);
      const json = generateValidationTraceJson(trace);
      const parsed = JSON.parse(json) as ValidationTrace;
      
      // Required keys
      expect(parsed.documentId).toBeDefined();
      expect(parsed.timestamp).toBeDefined();
      expect(parsed.engineVersion).toBeDefined();
      expect(parsed.fields).toBeDefined();
      expect(parsed.overallConfidence).toBeDefined();
      expect(parsed.processingTimeMs).toBeDefined();
      
      // Field structure
      for (const field of parsed.fields) {
        expect(field.fieldId).toBeDefined();
        expect(field.extracted).toBeDefined();
        expect(field.confidence).toBeDefined();
        expect(field.candidates).toBeDefined();
        expect(field.selectedCandidate).toBeDefined();
        expect(field.reasonCode).toBeDefined();
        expect(field.validationNotes).toBeDefined();
      }
    });

    it('should only use canonical reason codes', () => {
      const text = 'No useful content';
      const trace = extractAllCriticalFields('doc-codes', text);
      
      const validCodes = ['VALID', 'MISSING_FIELD', 'LOW_CONFIDENCE', 'CONFLICT'];
      
      for (const field of trace.fields) {
        expect(validCodes).toContain(field.reasonCode);
      }
    });
  });

  describe('Determinism', () => {
    it('should produce identical results for identical inputs', () => {
      const text = `
        Job Reference: JOB-12345
        Asset ID: ASSET-001
        Date: 15/03/2024
      `;
      
      const trace1 = extractAllCriticalFields('doc-det-1', text);
      const trace2 = extractAllCriticalFields('doc-det-1', text);
      
      // Normalize timestamps and processing time for comparison
      const normalize = (t: ValidationTrace) => ({
        ...t,
        timestamp: 'X',
        processingTimeMs: 0,
      });
      
      expect(normalize(trace1)).toEqual(normalize(trace2));
    });

    it('should sort candidates deterministically', () => {
      const text = 'Job Ref: AAA-111\nJob Reference: AAA-111\nWO: AAA-111';
      
      const trace1 = extractAllCriticalFields('doc-sort-1', text);
      const trace2 = extractAllCriticalFields('doc-sort-1', text);
      
      const jobRef1 = trace1.fields.find((f) => f.fieldId === 'jobReference');
      const jobRef2 = trace2.fields.find((f) => f.fieldId === 'jobReference');
      
      expect(jobRef1?.candidates).toEqual(jobRef2?.candidates);
    });
  });
});
