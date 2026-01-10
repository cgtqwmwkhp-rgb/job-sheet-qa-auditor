/**
 * Image QA Fusion Service - Contract Tests
 * 
 * Tests for:
 * - Fusion rules (agreement, conflict, confidence levels)
 * - Deterministic outcomes
 * - Evidence artifact completeness
 * - ROI bbox and crop references
 */

import { describe, it, expect } from 'vitest';
import {
  fuseFieldResults,
  fuseAllFields,
  generateFusionEvidenceJson,
  requiresImageQaFusion,
  FUSION_THRESHOLDS,
  IMAGE_QA_FUSION_FIELDS,
  type OcrFieldResult,
  type ImageQaResult,
  type RoiBbox,
  type FusedFieldResult,
  type FusionEvidence,
} from '../../services/imageQaFusion';

describe('Image QA Fusion Service', () => {
  describe('requiresImageQaFusion', () => {
    it('should return true for signature fields', () => {
      expect(requiresImageQaFusion('engineerSignOff')).toBe(true);
      expect(requiresImageQaFusion('signatureBlock')).toBe(true);
    });

    it('should return true for tickbox fields', () => {
      expect(requiresImageQaFusion('complianceTickboxes')).toBe(true);
      expect(requiresImageQaFusion('tickboxBlock')).toBe(true);
    });

    it('should return false for other fields', () => {
      expect(requiresImageQaFusion('jobReference')).toBe(false);
      expect(requiresImageQaFusion('assetId')).toBe(false);
      expect(requiresImageQaFusion('date')).toBe(false);
    });
  });

  describe('fuseFieldResults', () => {
    describe('when both sources agree', () => {
      it('should return VALID when both have high confidence', () => {
        const ocrResult: OcrFieldResult = {
          fieldId: 'engineerSignOff',
          extracted: true,
          value: 'Signed',
          confidence: 0.9,
          source: 'roi',
        };
        const imageQaResult: ImageQaResult = {
          fieldId: 'engineerSignOff',
          present: true,
          confidence: 0.92,
          quality: 'high',
          issues: [],
        };

        const result = fuseFieldResults('engineerSignOff', ocrResult, imageQaResult);

        expect(result.fusedOutcome).toBe('VALID');
        expect(result.fusedConfidence).toBeGreaterThan(0.9);
        expect(result.fusionReason).toContain('agree with high confidence');
      });

      it('should return LOW_CONFIDENCE when both have low confidence', () => {
        const ocrResult: OcrFieldResult = {
          fieldId: 'signatureBlock',
          extracted: true,
          value: null,
          confidence: 0.45,
          source: 'pattern',
        };
        const imageQaResult: ImageQaResult = {
          fieldId: 'signatureBlock',
          present: true,
          confidence: 0.5,
          quality: 'low',
          issues: ['Blurry image'],
        };

        const result = fuseFieldResults('signatureBlock', ocrResult, imageQaResult);

        expect(result.fusedOutcome).toBe('LOW_CONFIDENCE');
        expect(result.fusedConfidence).toBeLessThan(FUSION_THRESHOLDS.minimumValidConfidence);
      });
    });

    describe('when sources disagree', () => {
      it('should return CONFLICT when both have high confidence but disagree', () => {
        const ocrResult: OcrFieldResult = {
          fieldId: 'tickboxBlock',
          extracted: true,
          value: 'checked',
          confidence: 0.85,
          source: 'roi',
        };
        const imageQaResult: ImageQaResult = {
          fieldId: 'tickboxBlock',
          present: false, // Disagrees with OCR
          confidence: 0.9,
          quality: 'high',
          issues: ['Box appears empty'],
        };

        const result = fuseFieldResults('tickboxBlock', ocrResult, imageQaResult);

        expect(result.fusedOutcome).toBe('CONFLICT');
        expect(result.fusionReason).toContain('conflicts');
      });

      it('should trust OCR when it has high confidence and Image QA has low', () => {
        const ocrResult: OcrFieldResult = {
          fieldId: 'complianceTickboxes',
          extracted: true,
          value: 'all checked',
          confidence: 0.88,
          source: 'roi',
        };
        const imageQaResult: ImageQaResult = {
          fieldId: 'complianceTickboxes',
          present: false,
          confidence: 0.4,
          quality: 'low',
          issues: ['Poor image quality'],
        };

        const result = fuseFieldResults('complianceTickboxes', ocrResult, imageQaResult);

        expect(result.fusedOutcome).toBe('LOW_CONFIDENCE');
        expect(result.fusionReason).toContain('Trusting OCR');
        expect(result.fusedValue).toBe('all checked');
      });

      it('should trust Image QA when it has high confidence and OCR has low', () => {
        const ocrResult: OcrFieldResult = {
          fieldId: 'signatureBlock',
          extracted: true,
          value: '[illegible]',
          confidence: 0.35,
          source: 'pattern',
        };
        const imageQaResult: ImageQaResult = {
          fieldId: 'signatureBlock',
          present: false,
          confidence: 0.92,
          quality: 'high',
          issues: ['No signature visible'],
        };

        const result = fuseFieldResults('signatureBlock', ocrResult, imageQaResult);

        expect(result.fusedOutcome).toBe('LOW_CONFIDENCE');
        expect(result.fusionReason).toContain('Trusting Image QA');
        expect(result.fusedValue).toBe(false);
      });
    });

    describe('when only one source available', () => {
      it('should use OCR result when no Image QA available', () => {
        const ocrResult: OcrFieldResult = {
          fieldId: 'engineerSignOff',
          extracted: true,
          value: 'Signed by J. Smith',
          confidence: 0.85,
          source: 'roi',
        };

        const result = fuseFieldResults('engineerSignOff', ocrResult, null);

        expect(result.fusedOutcome).toBe('VALID');
        expect(result.fusionReason).toContain('OCR only');
        expect(result.fusedValue).toBe('Signed by J. Smith');
      });

      it('should use Image QA result when no OCR available', () => {
        const imageQaResult: ImageQaResult = {
          fieldId: 'tickboxBlock',
          present: true,
          confidence: 0.88,
          quality: 'high',
          issues: [],
        };

        const result = fuseFieldResults('tickboxBlock', null, imageQaResult);

        expect(result.fusedOutcome).toBe('VALID');
        expect(result.fusionReason).toContain('Image QA only');
        expect(result.fusedValue).toBe(true);
      });

      it('should return MISSING_FIELD when neither source available', () => {
        const result = fuseFieldResults('complianceTickboxes', null, null);

        expect(result.fusedOutcome).toBe('MISSING_FIELD');
        expect(result.fusedConfidence).toBe(0);
        expect(result.fusedValue).toBeNull();
      });
    });

    describe('ROI bbox and crop references', () => {
      it('should include crop reference when ROI bbox provided', () => {
        const ocrResult: OcrFieldResult = {
          fieldId: 'signatureBlock',
          extracted: true,
          value: 'Signed',
          confidence: 0.8,
          source: 'roi',
        };
        const roiBbox: RoiBbox = {
          pageIndex: 0,
          x: 0.1,
          y: 0.8,
          width: 0.3,
          height: 0.1,
        };

        const result = fuseFieldResults(
          'signatureBlock',
          ocrResult,
          null,
          roiBbox,
          'doc-123'
        );

        expect(result.cropReference).toBeDefined();
        expect(result.cropReference!.roiId).toBe('signatureBlock');
        expect(result.cropReference!.bbox).toEqual(roiBbox);
        expect(result.cropReference!.cropHash).toMatch(/^crop_[0-9a-f]+$/);
        expect(result.cropReference!.extractedAt).toBeDefined();
      });

      it('should generate deterministic crop hash', () => {
        const roiBbox: RoiBbox = {
          pageIndex: 0,
          x: 0.1,
          y: 0.8,
          width: 0.3,
          height: 0.1,
        };

        const result1 = fuseFieldResults('signatureBlock', null, null, roiBbox, 'doc-123');
        const result2 = fuseFieldResults('signatureBlock', null, null, roiBbox, 'doc-123');

        expect(result1.cropReference!.cropHash).toBe(result2.cropReference!.cropHash);
      });
    });
  });

  describe('fuseAllFields', () => {
    it('should process all Image QA fusion fields', () => {
      const ocrResults = new Map<string, OcrFieldResult>([
        ['engineerSignOff', {
          fieldId: 'engineerSignOff',
          extracted: true,
          value: 'Signed',
          confidence: 0.9,
          source: 'roi',
        }],
        ['complianceTickboxes', {
          fieldId: 'complianceTickboxes',
          extracted: true,
          value: 'checked',
          confidence: 0.85,
          source: 'roi',
        }],
      ]);

      const imageQaResults = new Map<string, ImageQaResult>([
        ['engineerSignOff', {
          fieldId: 'engineerSignOff',
          present: true,
          confidence: 0.92,
          quality: 'high',
          issues: [],
        }],
        ['complianceTickboxes', {
          fieldId: 'complianceTickboxes',
          present: true,
          confidence: 0.88,
          quality: 'high',
          issues: [],
        }],
      ]);

      const roiBboxes = new Map<string, RoiBbox>([
        ['engineerSignOff', { pageIndex: 0, x: 0.1, y: 0.8, width: 0.3, height: 0.1 }],
        ['complianceTickboxes', { pageIndex: 0, x: 0.5, y: 0.4, width: 0.4, height: 0.3 }],
      ]);

      const evidence = fuseAllFields('doc-test', ocrResults, imageQaResults, roiBboxes);

      expect(evidence.documentId).toBe('doc-test');
      expect(evidence.fields).toHaveLength(IMAGE_QA_FUSION_FIELDS.length);
      expect(evidence.fusionVersion).toBe('1.0.0');
      expect(evidence.timestamp).toBeDefined();
      expect(evidence.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should return CONFLICT overall when any field has conflict', () => {
      const ocrResults = new Map<string, OcrFieldResult>([
        ['engineerSignOff', {
          fieldId: 'engineerSignOff',
          extracted: true,
          value: 'Signed',
          confidence: 0.9,
          source: 'roi',
        }],
      ]);

      const imageQaResults = new Map<string, ImageQaResult>([
        ['engineerSignOff', {
          fieldId: 'engineerSignOff',
          present: false, // Conflict!
          confidence: 0.92,
          quality: 'high',
          issues: [],
        }],
      ]);

      const evidence = fuseAllFields('doc-conflict', ocrResults, imageQaResults, new Map());

      expect(evidence.overallOutcome).toBe('CONFLICT');
    });

    it('should return REVIEW_REQUIRED when any field has low confidence', () => {
      const ocrResults = new Map<string, OcrFieldResult>([
        ['signatureBlock', {
          fieldId: 'signatureBlock',
          extracted: true,
          value: 'unclear',
          confidence: 0.4,
          source: 'pattern',
        }],
      ]);

      const imageQaResults = new Map<string, ImageQaResult>([
        ['signatureBlock', {
          fieldId: 'signatureBlock',
          present: true,
          confidence: 0.45,
          quality: 'low',
          issues: ['Blurry'],
        }],
      ]);

      const evidence = fuseAllFields('doc-review', ocrResults, imageQaResults, new Map());

      expect(evidence.overallOutcome).toBe('REVIEW_REQUIRED');
    });

    it('should sort fields deterministically by fieldId', () => {
      const ocrResults = new Map<string, OcrFieldResult>();
      const imageQaResults = new Map<string, ImageQaResult>();
      const roiBboxes = new Map<string, RoiBbox>();

      const evidence = fuseAllFields('doc-sort', ocrResults, imageQaResults, roiBboxes);

      const fieldIds = evidence.fields.map(f => f.fieldId);
      const sortedIds = [...fieldIds].sort();
      expect(fieldIds).toEqual(sortedIds);
    });
  });

  describe('generateFusionEvidenceJson', () => {
    it('should generate valid JSON', () => {
      const evidence: FusionEvidence = {
        documentId: 'doc-json-test',
        timestamp: new Date().toISOString(),
        fusionVersion: '1.0.0',
        fields: [],
        overallOutcome: 'VALID',
        processingTimeMs: 5,
      };

      const json = generateFusionEvidenceJson(evidence);
      expect(() => JSON.parse(json)).not.toThrow();
    });

    it('should include all evidence fields', () => {
      const evidence: FusionEvidence = {
        documentId: 'doc-evidence-test',
        timestamp: '2025-01-01T00:00:00.000Z',
        fusionVersion: '1.0.0',
        fields: [{
          fieldId: 'signatureBlock',
          ocrResult: {
            fieldId: 'signatureBlock',
            extracted: true,
            value: 'Signed',
            confidence: 0.9,
            source: 'roi',
          },
          imageQaResult: {
            fieldId: 'signatureBlock',
            present: true,
            confidence: 0.92,
            quality: 'high',
            issues: [],
          },
          fusedOutcome: 'VALID',
          fusedConfidence: 0.95,
          fusedValue: 'Signed',
          fusionReason: 'OCR and Image QA agree with high confidence',
          cropReference: {
            roiId: 'signatureBlock',
            bbox: { pageIndex: 0, x: 0.1, y: 0.8, width: 0.3, height: 0.1 },
            cropHash: 'crop_12345678',
            extractedAt: '2025-01-01T00:00:00.000Z',
          },
        }],
        overallOutcome: 'VALID',
        processingTimeMs: 10,
      };

      const json = generateFusionEvidenceJson(evidence);
      const parsed = JSON.parse(json);

      // Verify all top-level keys present
      expect(parsed.documentId).toBe('doc-evidence-test');
      expect(parsed.timestamp).toBeDefined();
      expect(parsed.fusionVersion).toBe('1.0.0');
      expect(parsed.fields).toHaveLength(1);
      expect(parsed.overallOutcome).toBe('VALID');
      expect(parsed.processingTimeMs).toBe(10);

      // Verify field structure
      const field = parsed.fields[0];
      expect(field.fieldId).toBe('signatureBlock');
      expect(field.ocrResult).toBeDefined();
      expect(field.imageQaResult).toBeDefined();
      expect(field.fusedOutcome).toBe('VALID');
      expect(field.fusedConfidence).toBe(0.95);
      expect(field.fusedValue).toBe('Signed');
      expect(field.fusionReason).toBeDefined();
      expect(field.cropReference).toBeDefined();
      expect(field.cropReference.bbox).toBeDefined();
    });
  });

  describe('Determinism', () => {
    it('should produce identical results for identical inputs', () => {
      const ocrResult: OcrFieldResult = {
        fieldId: 'tickboxBlock',
        extracted: true,
        value: 'checked',
        confidence: 0.85,
        source: 'roi',
      };
      const imageQaResult: ImageQaResult = {
        fieldId: 'tickboxBlock',
        present: true,
        confidence: 0.88,
        quality: 'high',
        issues: [],
      };

      const result1 = fuseFieldResults('tickboxBlock', ocrResult, imageQaResult);
      const result2 = fuseFieldResults('tickboxBlock', ocrResult, imageQaResult);

      // Exclude timestamp-based fields from comparison
      const normalize = (r: FusedFieldResult) => ({
        ...r,
        cropReference: r.cropReference ? {
          ...r.cropReference,
          extractedAt: 'X',
        } : undefined,
      });

      expect(normalize(result1)).toEqual(normalize(result2));
    });

    it('should produce deterministic overall outcome ordering', () => {
      const ocrResults = new Map<string, OcrFieldResult>();
      const imageQaResults = new Map<string, ImageQaResult>();
      const roiBboxes = new Map<string, RoiBbox>();

      const evidence1 = fuseAllFields('doc-det-1', ocrResults, imageQaResults, roiBboxes);
      const evidence2 = fuseAllFields('doc-det-1', ocrResults, imageQaResults, roiBboxes);

      const normalize = (e: FusionEvidence) => ({
        ...e,
        timestamp: 'X',
        processingTimeMs: 0,
        fields: e.fields.map(f => ({
          ...f,
          cropReference: f.cropReference ? { ...f.cropReference, extractedAt: 'X' } : undefined,
        })),
      });

      expect(normalize(evidence1)).toEqual(normalize(evidence2));
    });
  });

  describe('Canonical Reason Codes', () => {
    it('should only use canonical fusion outcomes', () => {
      const validOutcomes = ['VALID', 'LOW_CONFIDENCE', 'CONFLICT', 'MISSING_FIELD'];
      
      // Test various scenarios
      const scenarios: Array<[OcrFieldResult | null, ImageQaResult | null]> = [
        [null, null],
        [{ fieldId: 'f', extracted: true, value: 'v', confidence: 0.9, source: 'roi' }, null],
        [null, { fieldId: 'f', present: true, confidence: 0.9, quality: 'high', issues: [] }],
        [
          { fieldId: 'f', extracted: true, value: 'v', confidence: 0.9, source: 'roi' },
          { fieldId: 'f', present: true, confidence: 0.9, quality: 'high', issues: [] },
        ],
        [
          { fieldId: 'f', extracted: true, value: 'v', confidence: 0.9, source: 'roi' },
          { fieldId: 'f', present: false, confidence: 0.9, quality: 'high', issues: [] },
        ],
        [
          { fieldId: 'f', extracted: true, value: 'v', confidence: 0.3, source: 'pattern' },
          { fieldId: 'f', present: true, confidence: 0.3, quality: 'low', issues: [] },
        ],
      ];

      for (const [ocr, imageQa] of scenarios) {
        const result = fuseFieldResults('testField', ocr, imageQa);
        expect(validOutcomes).toContain(result.fusedOutcome);
      }
    });

    it('should only use canonical overall outcomes', () => {
      const validOverallOutcomes = ['VALID', 'LOW_CONFIDENCE', 'CONFLICT', 'REVIEW_REQUIRED'];
      
      const evidence = fuseAllFields('doc-canonical', new Map(), new Map(), new Map());
      expect(validOverallOutcomes).toContain(evidence.overallOutcome);
    });
  });
});
