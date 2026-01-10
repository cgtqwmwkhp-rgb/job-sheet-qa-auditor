/**
 * ROI Processor Contract Tests
 * 
 * PR-J: Tests for ROI-targeted processing and performance caps.
 */

import { describe, it, expect } from 'vitest';
import {
  CRITICAL_ROI_FIELDS,
  IMAGE_QA_FIELDS,
  isCriticalRoiField,
  requiresImageQa,
  getRoiForField,
  getMissingCriticalRois,
  extractFromRoi,
  runImageQa,
  processWithRoi,
  requiresReviewQueue,
  DEFAULT_PERFORMANCE_CAPS,
  type RoiConfig,
  type PerformanceCaps,
} from '../../services/roiProcessor';

// Test ROI config
const fullRoiConfig: RoiConfig = {
  regions: [
    { name: 'header', page: 1, bounds: { x: 0, y: 0, width: 1, height: 0.1 } },
    { name: 'jobReference', page: 1, bounds: { x: 0.05, y: 0.1, width: 0.4, height: 0.05 } },
    { name: 'assetId', page: 1, bounds: { x: 0.5, y: 0.1, width: 0.45, height: 0.05 } },
    { name: 'date', page: 1, bounds: { x: 0.7, y: 0.02, width: 0.25, height: 0.04 } },
    { name: 'expiryDate', page: 1, bounds: { x: 0.7, y: 0.08, width: 0.25, height: 0.04 } },
    { name: 'tickboxBlock', page: 1, bounds: { x: 0.05, y: 0.3, width: 0.9, height: 0.3 } },
    { name: 'signatureBlock', page: 1, bounds: { x: 0, y: 0.85, width: 1, height: 0.15 } },
  ],
};

const partialRoiConfig: RoiConfig = {
  regions: [
    { name: 'jobReference', page: 1, bounds: { x: 0.05, y: 0.1, width: 0.4, height: 0.05 } },
    { name: 'assetId', page: 1, bounds: { x: 0.5, y: 0.1, width: 0.45, height: 0.05 } },
  ],
};

describe('ROI Processor - PR-J Contract Tests', () => {
  describe('Critical ROI Fields', () => {
    it('should define critical ROI fields', () => {
      expect(CRITICAL_ROI_FIELDS).toContain('jobReference');
      expect(CRITICAL_ROI_FIELDS).toContain('assetId');
      expect(CRITICAL_ROI_FIELDS).toContain('date');
      expect(CRITICAL_ROI_FIELDS).toContain('expiryDate');
      expect(CRITICAL_ROI_FIELDS).toContain('tickboxBlock');
      expect(CRITICAL_ROI_FIELDS).toContain('signatureBlock');
    });

    it('should correctly identify critical fields', () => {
      expect(isCriticalRoiField('jobReference')).toBe(true);
      expect(isCriticalRoiField('signatureBlock')).toBe(true);
      expect(isCriticalRoiField('customerName')).toBe(false);
    });
  });

  describe('Image QA Fields', () => {
    it('should define image QA fields', () => {
      expect(IMAGE_QA_FIELDS).toContain('tickboxBlock');
      expect(IMAGE_QA_FIELDS).toContain('signatureBlock');
    });

    it('should correctly identify image QA fields', () => {
      expect(requiresImageQa('tickboxBlock')).toBe(true);
      expect(requiresImageQa('signatureBlock')).toBe(true);
      expect(requiresImageQa('jobReference')).toBe(false);
    });
  });

  describe('ROI Lookup', () => {
    it('should find ROI for field', () => {
      const roi = getRoiForField(fullRoiConfig, 'jobReference');
      
      expect(roi).not.toBeNull();
      expect(roi!.name).toBe('jobReference');
      expect(roi!.bounds.x).toBe(0.05);
    });

    it('should return null for missing ROI', () => {
      const roi = getRoiForField(fullRoiConfig, 'customField');
      
      expect(roi).toBeNull();
    });

    it('should return null when no config', () => {
      const roi = getRoiForField(null, 'jobReference');
      
      expect(roi).toBeNull();
    });
  });

  describe('Missing Critical ROIs', () => {
    it('should return empty array when all critical ROIs present', () => {
      const missing = getMissingCriticalRois(fullRoiConfig);
      
      expect(missing).toEqual([]);
    });

    it('should identify missing critical ROIs', () => {
      const missing = getMissingCriticalRois(partialRoiConfig);
      
      expect(missing).toContain('date');
      expect(missing).toContain('expiryDate');
      expect(missing).toContain('tickboxBlock');
      expect(missing).toContain('signatureBlock');
      expect(missing).not.toContain('jobReference');
      expect(missing).not.toContain('assetId');
    });

    it('should return all critical ROIs when config is null', () => {
      const missing = getMissingCriticalRois(null);
      
      expect(missing).toEqual([...CRITICAL_ROI_FIELDS]);
    });
  });

  describe('ROI Extraction', () => {
    it('should extract value from ROI', () => {
      const roi = getRoiForField(fullRoiConfig, 'jobReference')!;
      const result = extractFromRoi('document text', roi, 'jobReference');
      
      expect(result.value).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should have high confidence for ROI extraction', () => {
      const roi = getRoiForField(fullRoiConfig, 'assetId')!;
      const result = extractFromRoi('document text', roi, 'assetId');
      
      // ROI extraction should have higher confidence than full-page
      expect(result.confidence).toBeGreaterThan(0.8);
    });
  });

  describe('Image QA', () => {
    it('should run image QA for tickbox block', () => {
      const roi = getRoiForField(fullRoiConfig, 'tickboxBlock')!;
      const result = runImageQa(roi, 'tickboxBlock');
      
      expect(result.checkType).toBe('tickboxes_checked');
      expect(result.passed).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should run image QA for signature block', () => {
      const roi = getRoiForField(fullRoiConfig, 'signatureBlock')!;
      const result = runImageQa(roi, 'signatureBlock');
      
      expect(result.checkType).toBe('signature_present');
      expect(result.passed).toBeDefined();
    });
  });

  describe('ROI Processing', () => {
    it('should process document with full ROI config', () => {
      const trace = processWithRoi(
        1,
        'test document text',
        100,
        fullRoiConfig,
        ['jobReference', 'assetId', 'signatureBlock']
      );
      
      expect(trace.documentId).toBe(1);
      expect(trace.templateVersionId).toBe(100);
      expect(trace.results.length).toBe(3);
      expect(trace.warnings.length).toBe(0);
    });

    it('should use ROI source when ROI exists', () => {
      const trace = processWithRoi(
        1,
        'test document',
        100,
        fullRoiConfig,
        ['jobReference']
      );
      
      expect(trace.results[0].source).toBe('roi');
    });

    it('should use fullpage source when ROI missing', () => {
      const trace = processWithRoi(
        1,
        'test document',
        100,
        partialRoiConfig,
        ['customerName'] // Not a critical field, no ROI
      );
      
      expect(trace.results[0].source).toBe('fullpage');
    });

    it('should add warning for missing critical ROIs', () => {
      const trace = processWithRoi(
        1,
        'test document',
        100,
        partialRoiConfig,
        ['jobReference', 'signatureBlock']
      );
      
      expect(trace.warnings.some(w => w.includes('signatureBlock'))).toBe(true);
    });

    it('should include image QA for visual fields', () => {
      const trace = processWithRoi(
        1,
        'test document',
        100,
        fullRoiConfig,
        ['signatureBlock', 'tickboxBlock']
      );
      
      const sigResult = trace.results.find(r => r.fieldId === 'signatureBlock');
      const tickResult = trace.results.find(r => r.fieldId === 'tickboxBlock');
      
      expect(sigResult?.imageQaResult).toBeDefined();
      expect(tickResult?.imageQaResult).toBeDefined();
    });

    it('should record processing time', () => {
      const trace = processWithRoi(
        1,
        'test document',
        100,
        fullRoiConfig,
        ['jobReference']
      );
      
      expect(trace.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should record ROI region in result', () => {
      const trace = processWithRoi(
        1,
        'test document',
        100,
        fullRoiConfig,
        ['jobReference']
      );
      
      expect(trace.results[0].roiRegion).toBeDefined();
      expect(trace.results[0].roiRegion!.name).toBe('jobReference');
    });
  });

  describe('Performance Caps', () => {
    it('should define default performance caps', () => {
      expect(DEFAULT_PERFORMANCE_CAPS.maxReprocessAttemptsPerDoc).toBe(3);
      expect(DEFAULT_PERFORMANCE_CAPS.maxReprocessAttemptsPerRoi).toBe(2);
      expect(DEFAULT_PERFORMANCE_CAPS.minConfidenceThreshold).toBe(0.6);
    });

    it('should track reprocess attempts', () => {
      const trace = processWithRoi(
        1,
        'test document',
        100,
        fullRoiConfig,
        ['jobReference', 'assetId']
      );
      
      // Each result should track its reprocess attempts
      for (const result of trace.results) {
        expect(typeof result.reprocessAttempts).toBe('number');
      }
      expect(typeof trace.totalReprocessAttempts).toBe('number');
    });

    it('should respect custom performance caps', () => {
      const strictCaps: PerformanceCaps = {
        ...DEFAULT_PERFORMANCE_CAPS,
        maxReprocessAttemptsPerDoc: 1,
        maxReprocessAttemptsPerRoi: 1,
      };
      
      const trace = processWithRoi(
        1,
        'test document',
        100,
        fullRoiConfig,
        ['jobReference'],
        strictCaps
      );
      
      expect(trace.totalReprocessAttempts).toBeLessThanOrEqual(1);
    });
  });

  describe('Review Queue Routing', () => {
    it('should not require review when all critical ROIs present', () => {
      const trace = processWithRoi(
        1,
        'test document',
        100,
        fullRoiConfig,
        ['jobReference', 'assetId', 'signatureBlock']
      );
      
      const review = requiresReviewQueue(trace);
      
      expect(review.required).toBe(false);
      expect(review.reasonCodes).toEqual([]);
    });

    it('should require review when critical ROIs missing', () => {
      const trace = processWithRoi(
        1,
        'test document',
        100,
        partialRoiConfig, // Missing date, expiry, tickbox, signature
        ['jobReference']
      );
      
      const review = requiresReviewQueue(trace);
      
      expect(review.required).toBe(true);
      expect(review.reasonCodes).toContain('MISSING_CRITICAL_ROI');
    });

    it('should require review when ROI config is null', () => {
      const trace = processWithRoi(
        1,
        'test document',
        100,
        null,
        ['jobReference']
      );
      
      const review = requiresReviewQueue(trace);
      
      expect(review.required).toBe(true);
      expect(review.reasonCodes).toContain('MISSING_CRITICAL_ROI');
    });
  });

  describe('Determinism', () => {
    it('should produce consistent results for same input', () => {
      const trace1 = processWithRoi(1, 'test', 100, fullRoiConfig, ['jobReference']);
      const trace2 = processWithRoi(1, 'test', 100, fullRoiConfig, ['jobReference']);
      
      expect(trace1.results[0].value).toBe(trace2.results[0].value);
      expect(trace1.results[0].source).toBe(trace2.results[0].source);
    });

    it('should maintain field order in results', () => {
      const fields = ['jobReference', 'assetId', 'date', 'signatureBlock'];
      const trace = processWithRoi(1, 'test', 100, fullRoiConfig, fields);
      
      expect(trace.results.map(r => r.fieldId)).toEqual(fields);
    });
  });
});
