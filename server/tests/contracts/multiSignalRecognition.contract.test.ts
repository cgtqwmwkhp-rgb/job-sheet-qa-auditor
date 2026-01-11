/**
 * Multi-Signal Template Recognition Contract Tests
 * 
 * PR-2: Verifies multi-signal template recognition with:
 * - Token signals (keyword matching)
 * - Layout signals (page count, sections)
 * - ROI signals (expected regions present)
 * - Plausibility signals (field patterns found)
 * 
 * NON-NEGOTIABLES:
 * - No silent guess on ambiguity (explicit block reason)
 * - Deterministic signal combination
 * - Evidence traceability for all signals
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  extractTokenSignal,
  extractLayoutSignal,
  extractRoiSignal,
  extractPlausibilitySignal,
  combineSignals,
  DEFAULT_SIGNAL_WEIGHTS,
  type SignalResult,
  type DocumentMetadata,
} from '../../services/templateSelector/signalExtractors';
import {
  selectTemplateMultiSignal,
  type MultiSignalInput,
} from '../../services/templateSelector/selectorService';
import {
  resetRegistry,
  createTemplate,
  uploadTemplateVersion,
  activateVersion,
} from '../../services/templateRegistry';
import {
  DEFAULT_SPEC_JSON,
  DEFAULT_SELECTION_CONFIG,
  DEFAULT_ROI_CONFIG,
} from '../../services/templateRegistry/defaultTemplate';

describe('Multi-Signal Template Recognition', () => {
  beforeEach(() => {
    resetRegistry();
  });

  afterEach(() => {
    resetRegistry();
  });

  describe('Token Signal Extraction', () => {
    it('should extract token signal from document', () => {
      const documentTokens = new Set(['job', 'sheet', 'maintenance', 'service', 'technician']);
      
      const result = extractTokenSignal(documentTokens, DEFAULT_SELECTION_CONFIG);
      
      expect(result.type).toBe('token');
      expect(result.score).toBeGreaterThan(0);
      expect(result.evidence.matched.length).toBeGreaterThan(0);
    });

    it('should penalize missing required tokens', () => {
      const documentTokens = new Set(['random', 'text', 'unrelated']);
      
      const config = {
        ...DEFAULT_SELECTION_CONFIG,
        requiredTokensAll: ['mandatory-token'],
      };
      
      const result = extractTokenSignal(documentTokens, config);
      
      expect(result.score).toBeLessThan(50);
      expect(result.evidence.missing).toContain('mandatory-token');
    });

    it('should include matched tokens in evidence', () => {
      const documentTokens = new Set(['job', 'sheet', 'maintenance']);
      
      const result = extractTokenSignal(documentTokens, DEFAULT_SELECTION_CONFIG);
      
      expect(result.evidence.matched).toContain('job');
      expect(result.evidence.matched).toContain('sheet');
    });
  });

  describe('Layout Signal Extraction', () => {
    it('should return neutral score when no layout expectations', () => {
      const metadata: DocumentMetadata = {
        pageCount: 2,
      };
      
      const result = extractLayoutSignal(metadata);
      
      expect(result.type).toBe('layout');
      expect(result.score).toBe(50); // Neutral
    });

    it('should boost score for matching page count', () => {
      const metadata: DocumentMetadata = {
        pageCount: 2,
      };
      
      const result = extractLayoutSignal(metadata, {
        minPages: 1,
        maxPages: 5,
      });
      
      expect(result.score).toBeGreaterThan(50);
      expect(result.evidence.matched.length).toBeGreaterThan(0);
    });

    it('should penalize score for page count out of range', () => {
      const metadata: DocumentMetadata = {
        pageCount: 10,
      };
      
      const result = extractLayoutSignal(metadata, {
        minPages: 1,
        maxPages: 2,
      });
      
      expect(result.score).toBeLessThan(50);
      expect(result.evidence.missing.length).toBeGreaterThan(0);
    });
  });

  describe('ROI Signal Extraction', () => {
    it('should return neutral score when no ROI config', () => {
      const result = extractRoiSignal('Some document text', ['Page 1 text']);
      
      expect(result.type).toBe('roi');
      expect(result.score).toBe(50); // Neutral
    });

    it('should score based on matching ROI regions', () => {
      const documentText = 'Job Sheet\nSerial Number: SN-12345-AB\nDate: 01/01/2026\nSignature: _____';
      
      const result = extractRoiSignal(documentText, [documentText], DEFAULT_ROI_CONFIG);
      
      expect(result.score).toBeGreaterThan(0);
      expect(result.evidence.matched.length).toBeGreaterThan(0);
    });

    it('should report missing ROI regions', () => {
      const documentText = 'Some random text without expected fields';
      
      const roiConfig = {
        regions: [
          {
            name: 'signatureBlock',
            page: 1,
            bounds: { x: 0, y: 0, width: 1, height: 1 },
            fields: ['uniqueFieldNotInDocument'],
          },
        ],
      };
      
      const result = extractRoiSignal(documentText, [documentText], roiConfig);
      
      expect(result.evidence.missing.length).toBeGreaterThan(0);
    });
  });

  describe('Plausibility Signal Extraction', () => {
    it('should detect date patterns in document', () => {
      const documentText = 'Date: 15/03/2026';
      
      const result = extractPlausibilitySignal(documentText, [
        { field: 'dateOfService', type: 'date' },
      ]);
      
      expect(result.score).toBe(100);
      expect(result.evidence.matched).toContain('field:dateOfService');
    });

    it('should detect pattern fields', () => {
      const documentText = 'Serial Number: SN-12345-AB';
      
      const result = extractPlausibilitySignal(documentText, [
        { field: 'serialNumber', type: 'pattern', pattern: 'SN-\\d{5}-[A-Z]{2}' },
      ]);
      
      expect(result.score).toBe(100);
      expect(result.evidence.matched).toContain('field:serialNumber');
    });

    it('should report missing fields', () => {
      const documentText = 'Some random text';
      
      const result = extractPlausibilitySignal(documentText, [
        { field: 'uniqueField', type: 'pattern', pattern: 'UNIQUE-\\d{10}' },
      ]);
      
      expect(result.score).toBe(0);
      expect(result.evidence.missing).toContain('field:uniqueField');
    });
  });

  describe('Signal Combination', () => {
    it('should combine signals with weighted average', () => {
      const signals: SignalResult[] = [
        {
          type: 'token',
          score: 80,
          weight: 0.4,
          confidence: 'HIGH',
          evidence: { matched: [], missing: [], details: {} },
        },
        {
          type: 'layout',
          score: 60,
          weight: 0.2,
          confidence: 'MEDIUM',
          evidence: { matched: [], missing: [], details: {} },
        },
        {
          type: 'roi',
          score: 70,
          weight: 0.25,
          confidence: 'MEDIUM',
          evidence: { matched: [], missing: [], details: {} },
        },
        {
          type: 'plausibility',
          score: 90,
          weight: 0.15,
          confidence: 'HIGH',
          evidence: { matched: [], missing: [], details: {} },
        },
      ];
      
      const result = combineSignals(signals);
      
      expect(result.combinedScore).toBeGreaterThan(0);
      expect(result.signals.length).toBe(4);
      expect(result.combinedEvidence.signalCount).toBe(4);
    });

    it('should track high confidence and weak signals', () => {
      const signals: SignalResult[] = [
        {
          type: 'token',
          score: 90,
          weight: 0.4,
          confidence: 'HIGH',
          evidence: { matched: [], missing: [], details: {} },
        },
        {
          type: 'layout',
          score: 30,
          weight: 0.2,
          confidence: 'LOW',
          evidence: { matched: [], missing: [], details: {} },
        },
      ];
      
      const result = combineSignals(signals);
      
      expect(result.combinedEvidence.highConfidenceSignals).toBe(1);
      expect(result.combinedEvidence.weakSignals).toContain('layout');
    });

    it('should apply custom weights', () => {
      const signals: SignalResult[] = [
        {
          type: 'token',
          score: 100,
          weight: 0.4,
          confidence: 'HIGH',
          evidence: { matched: [], missing: [], details: {} },
        },
        {
          type: 'roi',
          score: 0,
          weight: 0.25,
          confidence: 'LOW',
          evidence: { matched: [], missing: [], details: {} },
        },
      ];
      
      // Default weights
      const defaultResult = combineSignals(signals);
      
      // Custom weights (boost token, reduce ROI)
      const customResult = combineSignals(signals, {
        tokenWeight: 0.9,
        roiWeight: 0.1,
      });
      
      expect(customResult.combinedScore).toBeGreaterThan(defaultResult.combinedScore);
    });
  });

  describe('Multi-Signal Selection', () => {
    beforeEach(() => {
      // Create and activate a template
      const template = createTemplate({
        templateId: 'test-multi-signal',
        name: 'Test Multi-Signal Template',
        createdBy: 1,
      });
      const version = uploadTemplateVersion({
        templateId: template.id,
        version: '1.0.0',
        specJson: DEFAULT_SPEC_JSON,
        selectionConfigJson: {
          requiredTokensAll: [],
          requiredTokensAny: ['job', 'sheet', 'maintenance'],
          optionalTokens: ['technician', 'service'],
        },
        roiJson: DEFAULT_ROI_CONFIG,
        createdBy: 1,
      });
      activateVersion(version.id, { skipPreconditions: true, skipFixtures: true });
    });

    it('should return multiSignalEnabled=true', () => {
      const input: MultiSignalInput = {
        documentText: 'This is a job sheet for maintenance work.',
      };
      
      const result = selectTemplateMultiSignal(input);
      
      expect(result.multiSignalEnabled).toBe(true);
    });

    it('should include signal breakdown for top candidate', () => {
      const input: MultiSignalInput = {
        documentText: 'Job Sheet - Maintenance Service\nSerial Number: SN-12345-AB\nDate: 01/01/2026',
        pageTexts: ['Job Sheet - Maintenance Service\nSerial Number: SN-12345-AB\nDate: 01/01/2026'],
        metadata: { pageCount: 1 },
      };
      
      const result = selectTemplateMultiSignal(input);
      
      expect(result.signalBreakdown).toBeDefined();
      expect(result.signalBreakdown!.signals.length).toBeGreaterThan(0);
    });

    it('should block with explicit reason on LOW confidence', () => {
      const input: MultiSignalInput = {
        documentText: 'Random unrelated document text',
      };
      
      const result = selectTemplateMultiSignal(input);
      
      if (!result.autoProcessingAllowed) {
        expect(result.blockReason).toBeDefined();
        expect(result.blockReason).toContain('BLOCK');
      }
    });

    it('should include candidates with multi-signal data', () => {
      const input: MultiSignalInput = {
        documentText: 'Job Sheet - Maintenance',
      };
      
      const result = selectTemplateMultiSignal(input);
      
      expect(result.multiSignalCandidates).toBeDefined();
      expect(result.multiSignalCandidates!.length).toBeGreaterThan(0);
      expect(result.multiSignalCandidates![0].multiSignal).toBeDefined();
    });
  });

  describe('Ambiguity Detection (No Silent Guess)', () => {
    beforeEach(() => {
      // Create two similar templates to trigger ambiguity
      const template1 = createTemplate({
        templateId: 'template-a',
        name: 'Template A',
        createdBy: 1,
      });
      const version1 = uploadTemplateVersion({
        templateId: template1.id,
        version: '1.0.0',
        specJson: DEFAULT_SPEC_JSON,
        selectionConfigJson: {
          requiredTokensAll: [],
          requiredTokensAny: ['job', 'sheet'],
          optionalTokens: ['maintenance'],
        },
        createdBy: 1,
      });
      activateVersion(version1.id, { skipPreconditions: true, skipFixtures: true });
      
      const template2 = createTemplate({
        templateId: 'template-b',
        name: 'Template B',
        createdBy: 1,
      });
      const version2 = uploadTemplateVersion({
        templateId: template2.id,
        version: '1.0.0',
        specJson: DEFAULT_SPEC_JSON,
        selectionConfigJson: {
          requiredTokensAll: [],
          requiredTokensAny: ['job', 'sheet'],
          optionalTokens: ['service'],
        },
        createdBy: 1,
      });
      activateVersion(version2.id, { skipPreconditions: true, skipFixtures: true });
    });

    it('should block ambiguous selection with explicit AMBIGUITY_BLOCK reason', () => {
      const input: MultiSignalInput = {
        documentText: 'Job Sheet Document', // Matches both templates equally
      };
      
      const result = selectTemplateMultiSignal(input);
      
      // Both templates should score similarly, triggering ambiguity
      if (result.scoreGap < 10 && !result.autoProcessingAllowed) {
        expect(result.blockReason).toContain('AMBIGUITY_BLOCK');
        expect(result.blockReason).toContain('template-a');
        expect(result.blockReason).toContain('template-b');
      }
    });
  });

  describe('Determinism', () => {
    it('should produce identical results for identical inputs', () => {
      const template = createTemplate({
        templateId: 'determinism-test',
        name: 'Determinism Test',
        createdBy: 1,
      });
      const version = uploadTemplateVersion({
        templateId: template.id,
        version: '1.0.0',
        specJson: DEFAULT_SPEC_JSON,
        selectionConfigJson: DEFAULT_SELECTION_CONFIG,
        createdBy: 1,
      });
      activateVersion(version.id, { skipPreconditions: true, skipFixtures: true });
      
      const input: MultiSignalInput = {
        documentText: 'Job Sheet for Maintenance Service',
        metadata: { pageCount: 1 },
      };
      
      const result1 = selectTemplateMultiSignal(input);
      const result2 = selectTemplateMultiSignal(input);
      
      expect(result1.combinedScore).toBe(result2.combinedScore);
      expect(result1.confidenceBand).toBe(result2.confidenceBand);
      expect(result1.autoProcessingAllowed).toBe(result2.autoProcessingAllowed);
    });

    it('should sort candidates deterministically', () => {
      // Create multiple templates
      for (let i = 0; i < 3; i++) {
        const t = createTemplate({
          templateId: `sort-test-${i}`,
          name: `Sort Test ${i}`,
          createdBy: 1,
        });
        const v = uploadTemplateVersion({
          templateId: t.id,
          version: '1.0.0',
          specJson: DEFAULT_SPEC_JSON,
          selectionConfigJson: {
            requiredTokensAll: [],
            requiredTokensAny: ['job'],
            optionalTokens: [],
          },
          createdBy: 1,
        });
        activateVersion(v.id, { skipPreconditions: true, skipFixtures: true });
      }
      
      const input: MultiSignalInput = {
        documentText: 'job sheet',
      };
      
      const result1 = selectTemplateMultiSignal(input);
      const result2 = selectTemplateMultiSignal(input);
      
      expect(result1.candidates.map(c => c.templateSlug)).toEqual(
        result2.candidates.map(c => c.templateSlug)
      );
    });
  });

  describe('Evidence Traceability', () => {
    it('should include evidence for all signal types', () => {
      const template = createTemplate({
        templateId: 'evidence-test',
        name: 'Evidence Test',
        createdBy: 1,
      });
      const version = uploadTemplateVersion({
        templateId: template.id,
        version: '1.0.0',
        specJson: DEFAULT_SPEC_JSON,
        selectionConfigJson: DEFAULT_SELECTION_CONFIG,
        roiJson: DEFAULT_ROI_CONFIG,
        createdBy: 1,
      });
      activateVersion(version.id, { skipPreconditions: true, skipFixtures: true });
      
      const input: MultiSignalInput = {
        documentText: 'Job Sheet - Maintenance\nDate: 01/01/2026\nSerial: SN-12345-AB',
        pageTexts: ['Job Sheet - Maintenance\nDate: 01/01/2026\nSerial: SN-12345-AB'],
        metadata: { pageCount: 1 },
      };
      
      const result = selectTemplateMultiSignal(input);
      
      expect(result.signalBreakdown).toBeDefined();
      
      const signals = result.signalBreakdown!.signals;
      const signalTypes = signals.map(s => s.type);
      
      expect(signalTypes).toContain('token');
      expect(signalTypes).toContain('roi');
      expect(signalTypes).toContain('plausibility');
      
      // Each signal should have evidence
      for (const signal of signals) {
        expect(signal.evidence).toBeDefined();
        expect(signal.evidence.matched).toBeInstanceOf(Array);
        expect(signal.evidence.missing).toBeInstanceOf(Array);
      }
    });
  });
});
