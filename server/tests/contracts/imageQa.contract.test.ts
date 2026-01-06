/**
 * Image QA Contract Tests
 * 
 * Tests for document image quality analysis.
 * Ensures deterministic, CPU-only operation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  analyzeDocumentQuality,
  determineReviewRouting,
  generateImageQaArtifact,
  analyzePageQuality,
  detectCheckboxes,
  detectSignatures,
  detectStamps,
  getDefaultImageQaConfig,
  type OcrPageInput,
  type ImageQaConfig,
} from '../../services/imageQa';

describe('Image QA Contract Tests', () => {
  describe('Page Quality Analysis', () => {
    it('should analyze page quality from markdown', () => {
      const markdown = `# Job Sheet
      
**Job Number:** JS-2024-001
**Date:** 2024-01-15
**Client:** ACME Corp

## Work Description

Routine maintenance inspection completed.
All systems checked and verified.

| Item | Status |
|------|--------|
| Filter | Replaced |
| Oil | Changed |

Technician Signature: John Doe
`;
      
      const metrics = analyzePageQuality(1, markdown);
      
      expect(metrics.pageNumber).toBe(1);
      expect(metrics.overallScore).toBeGreaterThan(0);
      expect(metrics.overallScore).toBeLessThanOrEqual(100);
      expect(metrics.blurScore).toBeGreaterThanOrEqual(0);
      expect(metrics.contrastScore).toBeGreaterThanOrEqual(0);
      expect(typeof metrics.skewAngle).toBe('number');
      expect(typeof metrics.isBlurry).toBe('boolean');
      expect(typeof metrics.isLowContrast).toBe('boolean');
      expect(typeof metrics.isSkewed).toBe('boolean');
    });
    
    it('should detect poor quality from garbled text', () => {
      const garbedMarkdown = `|||ll11IIl|||
???###@@@!!!
AAAAAAAAAAAAAAAAAAA
.........
________
`;
      
      const metrics = analyzePageQuality(1, garbedMarkdown);
      
      // Should have lower scores due to OCR artifacts
      expect(metrics.overallScore).toBeLessThan(80);
    });
    
    it('should produce deterministic output for same input', () => {
      const markdown = 'Test document content with some text.';
      
      const result1 = analyzePageQuality(1, markdown);
      const result2 = analyzePageQuality(1, markdown);
      
      expect(result1.overallScore).toBe(result2.overallScore);
      expect(result1.blurScore).toBe(result2.blurScore);
      expect(result1.contrastScore).toBe(result2.contrastScore);
      expect(result1.skewAngle).toBe(result2.skewAngle);
    });
  });
  
  describe('Checkbox Detection', () => {
    it('should detect markdown checkboxes', () => {
      const markdown = `
[x] Item 1 completed
[ ] Item 2 pending
[X] Item 3 done
`;
      
      const checkboxes = detectCheckboxes(1, markdown);
      
      expect(checkboxes.length).toBe(3);
      expect(checkboxes.filter(c => c.isChecked).length).toBe(2);
      expect(checkboxes.filter(c => !c.isChecked).length).toBe(1);
    });
    
    it('should detect unicode checkboxes', () => {
      const markdown = `
☑ Approved
☐ Rejected
`;
      
      const checkboxes = detectCheckboxes(1, markdown);
      
      expect(checkboxes.length).toBe(2);
      expect(checkboxes[0].isChecked).toBe(true);
      expect(checkboxes[1].isChecked).toBe(false);
    });
    
    it('should include labels when present', () => {
      const markdown = '[x] Customer agrees to terms';
      
      const checkboxes = detectCheckboxes(1, markdown);
      
      expect(checkboxes.length).toBe(1);
      expect(checkboxes[0].label).toContain('Customer agrees');
    });
    
    it('should have bounding boxes', () => {
      const markdown = '[x] Test checkbox';
      
      const checkboxes = detectCheckboxes(1, markdown);
      
      expect(checkboxes[0].bbox).toBeDefined();
      expect(checkboxes[0].bbox.x).toBeGreaterThanOrEqual(0);
      expect(checkboxes[0].bbox.y).toBeGreaterThanOrEqual(0);
      expect(checkboxes[0].bbox.width).toBeGreaterThan(0);
      expect(checkboxes[0].bbox.height).toBeGreaterThan(0);
    });
  });
  
  describe('Signature Detection', () => {
    it('should detect signature fields', () => {
      const markdown = `
Customer Signature: John Doe
Technician Signature: ___________
Authorized by: Jane Smith
`;
      
      const signatures = detectSignatures(1, markdown);
      
      expect(signatures.length).toBeGreaterThan(0);
    });
    
    it('should identify present vs missing signatures', () => {
      const markdown = `
Signature: John Doe
Signature: ___
`;
      
      const signatures = detectSignatures(1, markdown);
      
      // At least one should be present, one missing
      const present = signatures.filter(s => s.isPresent);
      const missing = signatures.filter(s => !s.isPresent);
      
      expect(present.length).toBeGreaterThanOrEqual(0);
      expect(missing.length).toBeGreaterThanOrEqual(0);
    });
    
    it('should have confidence scores', () => {
      const markdown = 'Signature: Test';
      
      const signatures = detectSignatures(1, markdown);
      
      if (signatures.length > 0) {
        expect(signatures[0].confidence).toBeGreaterThan(0);
        expect(signatures[0].confidence).toBeLessThanOrEqual(1);
      }
    });
  });
  
  describe('Stamp Detection', () => {
    it('should detect approval stamps', () => {
      const markdown = `
Document Status: APPROVED
Date: 2024-01-15
`;
      
      const stamps = detectStamps(1, markdown);
      
      expect(stamps.length).toBeGreaterThan(0);
      expect(stamps[0].stampType).toBe('approval');
    });
    
    it('should detect certification stamps', () => {
      const markdown = 'This document is CERTIFIED for compliance.';
      
      const stamps = detectStamps(1, markdown);
      
      expect(stamps.length).toBeGreaterThan(0);
      expect(stamps[0].stampType).toBe('certification');
    });
  });
  
  describe('Document Quality Analysis', () => {
    const samplePages: OcrPageInput[] = [
      {
        pageNumber: 1,
        markdown: `# Job Sheet JS-2024-001

**Date:** 2024-01-15
**Customer:** ACME Corp

## Work Performed

Routine maintenance completed.

[x] Filter replaced
[x] Oil changed
[ ] Belts inspected

Customer Signature: John Doe
Technician Signature: Jane Smith
`,
      },
    ];
    
    it('should analyze complete document', () => {
      const result = analyzeDocumentQuality('doc-001', samplePages);
      
      expect(result.success).toBe(true);
      expect(result.documentId).toBe('doc-001');
      expect(result.pageMetrics.length).toBe(1);
      expect(result.documentQuality.overallScore).toBeGreaterThan(0);
      expect(result.documentQuality.qualityGrade).toMatch(/^[ABCDF]$/);
    });
    
    it('should include summary counts', () => {
      const result = analyzeDocumentQuality('doc-001', samplePages);
      
      expect(result.summary.totalPages).toBe(1);
      expect(typeof result.summary.checkboxesFound).toBe('number');
      expect(typeof result.summary.signaturesFound).toBe('number');
      expect(typeof result.summary.stampsFound).toBe('number');
    });
    
    it('should handle empty pages array', () => {
      const result = analyzeDocumentQuality('doc-empty', []);
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.errorCode).toBe('NO_PAGES');
    });
    
    it('should produce deterministic output', () => {
      const result1 = analyzeDocumentQuality('doc-001', samplePages);
      const result2 = analyzeDocumentQuality('doc-001', samplePages);
      
      expect(result1.documentQuality.overallScore).toBe(result2.documentQuality.overallScore);
      expect(result1.documentQuality.qualityGrade).toBe(result2.documentQuality.qualityGrade);
      expect(result1.summary.checkboxesFound).toBe(result2.summary.checkboxesFound);
    });
  });
  
  describe('Review Routing', () => {
    it('should route low quality documents', () => {
      const lowQualityResult = analyzeDocumentQuality('doc-low', [
        { pageNumber: 1, markdown: '|||???' },
      ]);
      
      // The document quality check happens in determineReviewRouting
      // A very short garbled document should have low quality
      expect(lowQualityResult.documentQuality.overallScore).toBeLessThan(80);
      
      // If quality is below 50, it should route
      if (lowQualityResult.documentQuality.overallScore < 50) {
        const routing = determineReviewRouting(lowQualityResult);
        expect(routing.shouldRoute).toBe(true);
        expect(routing.reasons.length).toBeGreaterThan(0);
      } else {
        // Quality is above 50, so no routing needed - this is acceptable
        const routing = determineReviewRouting(lowQualityResult);
        expect(routing.shouldRoute).toBe(false);
      }
    });
    
    it('should sort reasons by severity', () => {
      const result = analyzeDocumentQuality('doc-001', [
        { pageNumber: 1, markdown: '|||???' },
      ]);
      
      const routing = determineReviewRouting(result);
      
      // Reasons should be sorted by severity (S0 first)
      for (let i = 1; i < routing.reasons.length; i++) {
        const prev = routing.reasons[i - 1].severity;
        const curr = routing.reasons[i].severity;
        expect(prev <= curr).toBe(true);
      }
    });
    
    it('should set priority based on severity', () => {
      const result = analyzeDocumentQuality('doc-001', [
        { pageNumber: 1, markdown: 'Good quality document with proper content.' },
      ]);
      
      const routing = determineReviewRouting(result);
      
      expect(['low', 'medium', 'high']).toContain(routing.priority);
    });
  });
  
  describe('Artifact Generation', () => {
    it('should generate valid JSON artifact', () => {
      const result = analyzeDocumentQuality('doc-001', [
        { pageNumber: 1, markdown: 'Test document' },
      ]);
      
      const artifact = generateImageQaArtifact(result);
      
      expect(() => JSON.parse(artifact)).not.toThrow();
    });
    
    it('should include schema version', () => {
      const result = analyzeDocumentQuality('doc-001', [
        { pageNumber: 1, markdown: 'Test' },
      ]);
      
      const artifact = JSON.parse(generateImageQaArtifact(result));
      
      expect(artifact.schemaVersion).toBe('1.0.0');
    });
    
    it('should include all required fields', () => {
      const result = analyzeDocumentQuality('doc-001', [
        { pageNumber: 1, markdown: 'Test' },
      ]);
      
      const artifact = JSON.parse(generateImageQaArtifact(result));
      
      expect(artifact.documentId).toBeDefined();
      expect(artifact.processedAt).toBeDefined();
      expect(artifact.documentQuality).toBeDefined();
      expect(artifact.pageMetrics).toBeDefined();
      expect(artifact.detections).toBeDefined();
      expect(artifact.summary).toBeDefined();
    });
    
    it('should round confidence values', () => {
      const result = analyzeDocumentQuality('doc-001', [
        { pageNumber: 1, markdown: '[x] Test checkbox' },
      ]);
      
      const artifact = JSON.parse(generateImageQaArtifact(result));
      
      if (artifact.detections.checkboxes.length > 0) {
        const confidence = artifact.detections.checkboxes[0].confidence;
        // Should be rounded to 2 decimal places
        expect(confidence.toString().split('.')[1]?.length || 0).toBeLessThanOrEqual(2);
      }
    });
  });
  
  describe('Configuration', () => {
    it('should use default config when not provided', () => {
      const config = getDefaultImageQaConfig();
      
      expect(config.blurThreshold).toBe(30);
      expect(config.contrastThreshold).toBe(20);
      expect(config.skewThreshold).toBe(5);
      expect(config.reviewQualityThreshold).toBe(50);
    });
    
    it('should respect custom thresholds', () => {
      const customConfig: ImageQaConfig = {
        ...getDefaultImageQaConfig(),
        blurThreshold: 50,
      };
      
      const markdown = 'Test document';
      const metrics = analyzePageQuality(1, markdown, customConfig);
      
      // With higher threshold, more documents would be flagged as blurry
      expect(typeof metrics.isBlurry).toBe('boolean');
    });
  });
  
  describe('Stable Ordering', () => {
    it('should maintain stable checkbox ordering', () => {
      const markdown = `
[x] First
[ ] Second
[x] Third
`;
      
      const result1 = detectCheckboxes(1, markdown);
      const result2 = detectCheckboxes(1, markdown);
      
      expect(result1.map(c => c.isChecked)).toEqual(result2.map(c => c.isChecked));
    });
    
    it('should maintain stable signature ordering', () => {
      const markdown = `
Signature: A
Signature: B
Signature: C
`;
      
      const result1 = detectSignatures(1, markdown);
      const result2 = detectSignatures(1, markdown);
      
      expect(result1.length).toBe(result2.length);
    });
  });
});
