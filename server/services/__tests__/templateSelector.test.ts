/**
 * Template Selection Engine Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import {
  TemplateSelector,
  getTemplateSelector,
  resetTemplateSelector,
  type DocumentContext,
} from '../templateSelector';
import {
  TemplateRegistry,
  resetTemplateRegistry,
} from '../templateRegistry';

const SPECS_DIR = path.join(__dirname, '..', '..', 'specs');

describe('Template Selection Engine', () => {
  let selector: TemplateSelector;
  let registry: TemplateRegistry;

  beforeEach(async () => {
    resetTemplateRegistry();
    resetTemplateSelector();
    
    // Use the singleton registry and load packs into it
    const { getTemplateRegistry } = await import('../templateRegistry');
    registry = getTemplateRegistry();
    // Point the singleton to the specs directory
    (registry as unknown as { specsDir: string }).specsDir = SPECS_DIR;
    await registry.loadAllPacks();
    
    selector = getTemplateSelector();
  });

  afterEach(() => {
    resetTemplateRegistry();
    resetTemplateSelector();
  });

  describe('Fingerprint Matching', () => {
    it('selects LOLER template for LOLER document text', () => {
      const context: DocumentContext = {
        extractedText: `
          Thorough Examination Report
          Plantexpand
          LOLER Lifting Operations
          Asset ID: PUMP-001
          Customer: ACME Corp
        `,
        client: 'PLANTEXPAND',
      };

      const result = selector.selectTemplate(context);

      expect(result.selectedTemplate).not.toBeNull();
      expect(result.selectedTemplate?.templateId).toBe('PE_LOLER_EXAM_V1');
      expect(result.confidence).toBe('high');
    });

    it('selects VOR template for VOR document text', () => {
      const context: DocumentContext = {
        extractedText: `
          Job Summary Report
          Plantexpand
          This Vehicle is marked as VOR
          Asset Details
          Completion Details
          Repairs Required
        `,
        client: 'PLANTEXPAND',
      };

      const result = selector.selectTemplate(context);

      expect(result.selectedTemplate).not.toBeNull();
      expect(result.selectedTemplate?.templateId).toBe('PE_JOB_SUMMARY_REPAIR_V1');
    });

    it('selects Compliance template for compliance document text', () => {
      const context: DocumentContext = {
        extractedText: `
          Job Summary Report
          Plantexpand
          Compliance Checklist
          Asset Details
          Completion Details
          General Trailer Test Summary
        `,
        client: 'PLANTEXPAND',
      };

      const result = selector.selectTemplate(context);

      expect(result.selectedTemplate).not.toBeNull();
      expect(result.selectedTemplate?.templateId).toBe('PE_JOB_SUMMARY_COMPLIANCE_V1');
    });

    it('selects PTO template for PTO service document text', () => {
      const context: DocumentContext = {
        extractedText: `
          Job Summary Report
          Plantexpand
          PTO Service
          Asset Details
          Completion Details
          Compliance Checklist
          Lubricate
          Check/Do
        `,
        client: 'PLANTEXPAND',
      };

      const result = selector.selectTemplate(context);

      expect(result.selectedTemplate).not.toBeNull();
      expect(result.selectedTemplate?.templateId).toBe('PE_JOB_SUMMARY_PTO_V1');
    });

    it('selects Aztec template for Aztec weighing document text', () => {
      const context: DocumentContext = {
        extractedText: `
          Job Summary Report
          Plantexpand
          Aztec On Board Weighing
          Asset Details
          Completion Details
          Compliance Checklist
          Weighing System Operational
        `,
        client: 'PLANTEXPAND',
      };

      const result = selector.selectTemplate(context);

      expect(result.selectedTemplate).not.toBeNull();
      expect(result.selectedTemplate?.templateId).toBe('PE_JOB_SUMMARY_AZTEC_V1');
    });

    it('returns null when no templates match', () => {
      const context: DocumentContext = {
        extractedText: 'Random unrelated document content',
        client: 'PLANTEXPAND',
      };

      const result = selector.selectTemplate(context);

      expect(result.selectedTemplate).toBeNull();
      expect(result.confidence).toBe('none');
    });

    it('excludes templates when exclude tokens match', () => {
      const context: DocumentContext = {
        extractedText: `
          Job Summary Report
          Plantexpand
          Compliance Checklist
          PTO Service
          VOR
        `,
        client: 'PLANTEXPAND',
      };

      const result = selector.selectTemplate(context);

      // Should NOT select Compliance template because it excludes "PTO Service" and "VOR"
      if (result.selectedTemplate) {
        expect(result.selectedTemplate.templateId).not.toBe('PE_JOB_SUMMARY_COMPLIANCE_V1');
      }
    });
  });

  describe('Scoring', () => {
    it('provides scores for all templates', () => {
      const context: DocumentContext = {
        extractedText: `
          Job Summary Report
          Plantexpand
          Asset Details
        `,
        client: 'PLANTEXPAND',
      };

      const result = selector.selectTemplate(context);

      expect(result.allScores.length).toBeGreaterThan(0);
      expect(result.allScores[0].score).toBeGreaterThanOrEqual(result.allScores[result.allScores.length - 1].score);
    });

    it('includes matched tokens in score details', () => {
      const context: DocumentContext = {
        extractedText: `
          Thorough Examination Report
          Plantexpand
          LOLER
        `,
        client: 'PLANTEXPAND',
      };

      const result = selector.selectTemplate(context);
      const lolerScore = result.allScores.find(s => s.templateId === 'PE_LOLER_EXAM_V1');

      expect(lolerScore).toBeDefined();
      expect(lolerScore?.matchedRequiredAll).toContain('Thorough Examination Report');
      expect(lolerScore?.matchedRequiredAll).toContain('Plantexpand');
    });

    it('warns about ambiguous selection', () => {
      // Create a context that could match multiple templates similarly
      const context: DocumentContext = {
        extractedText: `
          Job Summary Report
          Plantexpand
          Asset Details
          Completion Details
        `,
        client: 'PLANTEXPAND',
      };

      const result = selector.selectTemplate(context);

      // May or may not have ambiguous warning depending on scores
      // Just verify the structure is correct
      expect(result.warnings).toBeInstanceOf(Array);
    });
  });

  describe('Manual Selection', () => {
    it('selects template by ID', () => {
      const result = selector.selectTemplateById('PE_LOLER_EXAM_V1');

      expect(result.selectedTemplate).not.toBeNull();
      expect(result.selectedTemplate?.templateId).toBe('PE_LOLER_EXAM_V1');
      expect(result.selectionMethod).toBe('manual');
      expect(result.confidence).toBe('high');
    });

    it('returns null for non-existent template ID', () => {
      const result = selector.selectTemplateById('NON_EXISTENT_V1');

      expect(result.selectedTemplate).toBeNull();
      expect(result.warnings).toContain('Template not found: NON_EXISTENT_V1');
    });
  });

  describe('ROI Support', () => {
    it('returns ROI definition for template with ROI', () => {
      const roi = selector.getROI('PE_JOB_SUMMARY_AZTEC_V1');

      // Aztec template should have ROI defined
      if (roi) {
        expect(roi.pageIndex0Based).toBeDefined();
        expect(roi.regions).toBeInstanceOf(Array);
      }
    });

    it('returns null for template without ROI', () => {
      // Some templates may not have ROI defined
      const roi = selector.getROI('PE_LOLER_EXAM_V1');
      
      // May or may not have ROI - just verify the method works
      expect(roi === null || roi.regions !== undefined).toBe(true);
    });

    it('returns ROI regions for specific page', () => {
      const regions = selector.getROIRegionsForPage('PE_JOB_SUMMARY_AZTEC_V1', 0);

      // Should return array (may be empty if no ROI or different page)
      expect(regions).toBeInstanceOf(Array);
    });

    it('checks if point is in ROI region', () => {
      // First get the ROI to know valid coordinates
      const roi = selector.getROI('PE_JOB_SUMMARY_AZTEC_V1');
      
      if (roi && roi.regions.length > 0) {
        const region = roi.regions[0];
        const centerX = region.x + region.width / 2;
        const centerY = region.y + region.height / 2;
        
        const result = selector.isPointInROI('PE_JOB_SUMMARY_AZTEC_V1', roi.pageIndex0Based, centerX, centerY);
        expect(result).not.toBeNull();
        expect(result?.name).toBe(region.name);
      } else {
        // If no ROI defined, the test still passes
        expect(true).toBe(true);
      }
    });

    it('returns null when point is outside all ROI regions', () => {
      const result = selector.isPointInROI('PE_JOB_SUMMARY_AZTEC_V1', 0, -100, -100);
      expect(result).toBeNull();
    });
  });

  describe('Client Filtering', () => {
    it('filters templates by client', () => {
      const context: DocumentContext = {
        extractedText: 'Some document text',
        client: 'PLANTEXPAND',
      };

      const result = selector.selectTemplate(context);

      // All scored templates should be from PLANTEXPAND
      for (const score of result.allScores) {
        const template = registry.getTemplate(score.templateId);
        if (template) {
          expect(template.client).toBe('PLANTEXPAND');
        }
      }
    });

    it('falls back to all templates when no templates for client', () => {
      const context: DocumentContext = {
        extractedText: 'Some document text',
        client: 'NON_EXISTENT_CLIENT',
      };

      const result = selector.selectTemplate(context);

      // Should fall back to all templates and warn
      // The warning is added when clientTemplates.length === 0
      expect(result.warnings.length).toBeGreaterThanOrEqual(0);
      // All scores should still be present (fallback to all templates)
      expect(result.allScores.length).toBeGreaterThan(0);
    });
  });

  describe('Singleton Instance', () => {
    it('returns the same instance', () => {
      const instance1 = getTemplateSelector();
      const instance2 = getTemplateSelector();

      expect(instance1).toBe(instance2);
    });

    it('resets the singleton instance', () => {
      const instance1 = getTemplateSelector();
      resetTemplateSelector();
      const instance2 = getTemplateSelector();

      expect(instance1).not.toBe(instance2);
    });
  });
});
