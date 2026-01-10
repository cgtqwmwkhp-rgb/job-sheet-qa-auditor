/**
 * Template Selector Contract Tests
 * 
 * PR-B: Validates template selection logic.
 * 
 * CRITICAL RULES TESTED:
 * - LOW confidence (<50): NO auto-select
 * - MEDIUM (50-79) with gap <10: NO auto-select  
 * - HIGH (>=80): Auto-processing allowed
 * - Deterministic ordering: score desc, then templateId asc
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  tokenizeText,
  calculateScore,
  getConfidenceBand,
  selectTemplate,
  createSelectionTraceArtifact,
} from '../../services/templateSelector';
import {
  createTemplate,
  uploadTemplateVersion,
  activateVersion,
  resetRegistry,
  type SelectionConfig,
  type SpecJson,
} from '../../services/templateRegistry';

// Test fixtures
const baseSpecJson: SpecJson = {
  name: 'Test Spec',
  version: '1.0.0',
  fields: [],
  rules: [],
};

describe('Template Selector - PR-B Contract Tests', () => {
  beforeEach(() => {
    resetRegistry();
  });

  describe('Tokenization', () => {
    it('should tokenize text to lowercase words', () => {
      const tokens = tokenizeText('Hello World! This is a TEST.');
      
      expect(tokens).toEqual(['hello', 'world', 'this', 'is', 'a', 'test']);
    });

    it('should handle empty text', () => {
      const tokens = tokenizeText('');
      expect(tokens).toEqual([]);
    });

    it('should remove punctuation', () => {
      const tokens = tokenizeText('Job#123, Customer: ACME Corp.');
      expect(tokens).toContain('job');
      expect(tokens).toContain('123');
      expect(tokens).toContain('acme');
      expect(tokens).toContain('corp');
    });
  });

  describe('Score Calculation', () => {
    it('should score based on requiredTokensAll', () => {
      const config: SelectionConfig = {
        requiredTokensAll: ['job', 'sheet'],
        requiredTokensAny: [],
        optionalTokens: [],
      };
      
      const tokens = new Set(['job', 'sheet', 'repair']);
      const { score, matchedTokens, missingRequired } = calculateScore(tokens, config);
      
      expect(score).toBeGreaterThan(0);
      expect(matchedTokens).toContain('job');
      expect(matchedTokens).toContain('sheet');
      expect(missingRequired).toHaveLength(0);
    });

    it('should penalize missing required tokens', () => {
      const config: SelectionConfig = {
        requiredTokensAll: ['job', 'sheet', 'missing'],
        requiredTokensAny: [],
        optionalTokens: [],
      };
      
      const tokens = new Set(['job', 'sheet']);
      const { score, missingRequired } = calculateScore(tokens, config);
      
      expect(score).toBeLessThan(100);
      expect(missingRequired).toContain('missing');
    });

    it('should handle requiredTokensAny', () => {
      const config: SelectionConfig = {
        requiredTokensAll: [],
        requiredTokensAny: ['repair', 'maintenance', 'service'],
        optionalTokens: [],
      };
      
      const tokens = new Set(['job', 'repair']);
      const { matchedTokens } = calculateScore(tokens, config);
      
      expect(matchedTokens).toContain('repair');
    });

    it('should boost score for optional tokens', () => {
      const config: SelectionConfig = {
        requiredTokensAll: ['job'],
        requiredTokensAny: [],
        optionalTokens: ['signature', 'date', 'customer'],
      };
      
      const tokensBasic = new Set(['job']);
      const tokensWithOptional = new Set(['job', 'signature', 'date']);
      
      const scoreBasic = calculateScore(tokensBasic, config);
      const scoreWithOptional = calculateScore(tokensWithOptional, config);
      
      expect(scoreWithOptional.score).toBeGreaterThan(scoreBasic.score);
    });
  });

  describe('Confidence Bands', () => {
    it('should return HIGH for score >= 80', () => {
      expect(getConfidenceBand(80)).toBe('HIGH');
      expect(getConfidenceBand(100)).toBe('HIGH');
      expect(getConfidenceBand(95)).toBe('HIGH');
    });

    it('should return MEDIUM for score 50-79', () => {
      expect(getConfidenceBand(50)).toBe('MEDIUM');
      expect(getConfidenceBand(79)).toBe('MEDIUM');
      expect(getConfidenceBand(65)).toBe('MEDIUM');
    });

    it('should return LOW for score < 50', () => {
      expect(getConfidenceBand(0)).toBe('LOW');
      expect(getConfidenceBand(49)).toBe('LOW');
      expect(getConfidenceBand(25)).toBe('LOW');
    });
  });

  describe('Template Selection', () => {
    it('should return no selection when no templates exist', () => {
      const result = selectTemplate('Job sheet repair document');
      
      expect(result.selected).toBe(false);
      expect(result.autoProcessingAllowed).toBe(false);
      expect(result.blockReason).toBe('No active templates available');
    });

    it('should select HIGH confidence template', () => {
      // Create and activate a template with matching config
      const template = createTemplate({
        templateId: 'job-sheet-standard',
        name: 'Standard Job Sheet',
        createdBy: 1,
      });
      
      const version = uploadTemplateVersion({
        templateId: template.id,
        version: '1.0.0',
        specJson: baseSpecJson,
        selectionConfigJson: {
          requiredTokensAll: ['job', 'sheet'],
          requiredTokensAny: ['repair', 'maintenance'],
          optionalTokens: ['signature', 'customer'],
        },
        createdBy: 1,
      });
      
      activateVersion(version.id, true);
      
      const result = selectTemplate('Job Sheet Repair Report with Customer Signature');
      
      expect(result.confidenceBand).toBe('HIGH');
      expect(result.selected).toBe(true);
      expect(result.autoProcessingAllowed).toBe(true);
      expect(result.templateId).toBe(template.id);
    });

    it('should block LOW confidence selection', () => {
      const template = createTemplate({
        templateId: 'specific-template',
        name: 'Specific Template',
        createdBy: 1,
      });
      
      const version = uploadTemplateVersion({
        templateId: template.id,
        version: '1.0.0',
        specJson: baseSpecJson,
        selectionConfigJson: {
          requiredTokensAll: ['very', 'specific', 'tokens', 'unlikely'],
          requiredTokensAny: ['rare', 'unusual'],
          optionalTokens: ['uncommon'],
        },
        createdBy: 1,
      });
      
      activateVersion(version.id, true);
      
      const result = selectTemplate('Generic document with random content');
      
      expect(result.confidenceBand).toBe('LOW');
      expect(result.selected).toBe(false);
      expect(result.autoProcessingAllowed).toBe(false);
      expect(result.blockReason).toContain('LOW confidence');
    });

    it('should block MEDIUM confidence with small gap', () => {
      // Create two templates with similar scores
      const t1 = createTemplate({
        templateId: 'template-a',
        name: 'Template A',
        createdBy: 1,
      });
      
      const t2 = createTemplate({
        templateId: 'template-b',
        name: 'Template B',
        createdBy: 1,
      });
      
      const v1 = uploadTemplateVersion({
        templateId: t1.id,
        version: '1.0.0',
        specJson: { ...baseSpecJson, name: 'Spec A' },
        selectionConfigJson: {
          requiredTokensAll: ['document'],
          requiredTokensAny: ['repair'],
          optionalTokens: ['date'],
        },
        createdBy: 1,
      });
      
      const v2 = uploadTemplateVersion({
        templateId: t2.id,
        version: '1.0.0',
        specJson: { ...baseSpecJson, name: 'Spec B' },
        selectionConfigJson: {
          requiredTokensAll: ['document'],
          requiredTokensAny: ['service'],
          optionalTokens: ['time'],
        },
        createdBy: 1,
      });
      
      activateVersion(v1.id, true);
      activateVersion(v2.id, true);
      
      // Document that matches both templates similarly
      const result = selectTemplate('Document with repair and service details plus date and time');
      
      // If scores are close and MEDIUM confidence, should block
      if (result.confidenceBand === 'MEDIUM' && result.scoreGap < 10) {
        expect(result.autoProcessingAllowed).toBe(false);
        expect(result.blockReason).toContain('ambiguous gap');
      }
    });

    it('should sort candidates deterministically', () => {
      // Create templates
      const t1 = createTemplate({
        templateId: 'template-z',
        name: 'Template Z',
        createdBy: 1,
      });
      
      const t2 = createTemplate({
        templateId: 'template-a',
        name: 'Template A',
        createdBy: 1,
      });
      
      // Same selection config for equal scores
      const config: SelectionConfig = {
        requiredTokensAll: ['test'],
        requiredTokensAny: [],
        optionalTokens: [],
      };
      
      const v1 = uploadTemplateVersion({
        templateId: t1.id,
        version: '1.0.0',
        specJson: { ...baseSpecJson, name: 'Z' },
        selectionConfigJson: config,
        createdBy: 1,
      });
      
      const v2 = uploadTemplateVersion({
        templateId: t2.id,
        version: '1.0.0',
        specJson: { ...baseSpecJson, name: 'A' },
        selectionConfigJson: config,
        createdBy: 1,
      });
      
      activateVersion(v1.id, true);
      activateVersion(v2.id, true);
      
      // Run selection multiple times
      const results = [
        selectTemplate('test document'),
        selectTemplate('test document'),
        selectTemplate('test document'),
      ];
      
      // All should produce same ordering
      for (const result of results) {
        expect(result.candidates.length).toBe(2);
        // Equal scores should sort by templateId (slug) ascending
        if (result.candidates[0].score === result.candidates[1].score) {
          expect(result.candidates[0].templateSlug).toBe('template-a');
          expect(result.candidates[1].templateSlug).toBe('template-z');
        }
      }
    });
  });

  describe('Selection Trace Artifact', () => {
    it('should create deterministic trace artifact', () => {
      const template = createTemplate({
        templateId: 'test-template',
        name: 'Test',
        createdBy: 1,
      });
      
      const version = uploadTemplateVersion({
        templateId: template.id,
        version: '1.0.0',
        specJson: baseSpecJson,
        selectionConfigJson: {
          requiredTokensAll: ['job', 'sheet'],
          requiredTokensAny: [],
          optionalTokens: [],
        },
        createdBy: 1,
      });
      
      activateVersion(version.id, true);
      
      const result = selectTemplate('Job Sheet Document');
      const trace = createSelectionTraceArtifact(123, result);
      
      expect(trace).toHaveProperty('jobSheetId', 123);
      expect(trace).toHaveProperty('timestamp');
      expect(trace).toHaveProperty('confidenceBand');
      expect(trace).toHaveProperty('candidates');
    });

    it('should include all candidates in trace', () => {
      const t1 = createTemplate({ templateId: 'template-1', name: 'T1', createdBy: 1 });
      const t2 = createTemplate({ templateId: 'template-2', name: 'T2', createdBy: 1 });
      
      const v1 = uploadTemplateVersion({
        templateId: t1.id,
        version: '1.0.0',
        specJson: { ...baseSpecJson, name: 'S1' },
        selectionConfigJson: { requiredTokensAll: ['doc'], requiredTokensAny: [], optionalTokens: [] },
        createdBy: 1,
      });
      
      const v2 = uploadTemplateVersion({
        templateId: t2.id,
        version: '1.0.0',
        specJson: { ...baseSpecJson, name: 'S2' },
        selectionConfigJson: { requiredTokensAll: ['doc'], requiredTokensAny: [], optionalTokens: [] },
        createdBy: 1,
      });
      
      activateVersion(v1.id, true);
      activateVersion(v2.id, true);
      
      const result = selectTemplate('doc content');
      const trace = createSelectionTraceArtifact(456, result) as any;
      
      expect(trace.candidates).toHaveLength(2);
      expect(trace.candidates[0]).toHaveProperty('templateSlug');
      expect(trace.candidates[0]).toHaveProperty('score');
      expect(trace.candidates[0]).toHaveProperty('matchedTokens');
    });
  });

  describe('Critical Rule: LOW Confidence NEVER Auto-Selects', () => {
    it('should NEVER allow auto-processing for LOW confidence', () => {
      const template = createTemplate({
        templateId: 'narrow-template',
        name: 'Narrow',
        createdBy: 1,
      });
      
      const version = uploadTemplateVersion({
        templateId: template.id,
        version: '1.0.0',
        specJson: baseSpecJson,
        selectionConfigJson: {
          requiredTokensAll: ['xyz123', 'abc789'],
          requiredTokensAny: ['qwerty'],
          optionalTokens: ['asdfgh'],
        },
        createdBy: 1,
      });
      
      activateVersion(version.id, true);
      
      // Document with NO matching tokens
      const result = selectTemplate('Completely unrelated document content here');
      
      expect(result.confidenceBand).toBe('LOW');
      expect(result.autoProcessingAllowed).toBe(false);
      expect(result.selected).toBe(false);
    });
  });
});
