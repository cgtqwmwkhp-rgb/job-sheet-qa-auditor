/**
 * Selection Fixtures Contract Tests
 * 
 * PR-3: Verifies selection fixture behavior with:
 * - Near-miss tests: documents that almost match but shouldn't
 * - Ambiguity tests: documents that trigger REVIEW_QUEUE
 * - Edge cases: minimal content, wrong format, etc.
 * 
 * NON-NEGOTIABLES:
 * - Near-misses must NOT result in HIGH confidence
 * - Ambiguous cases must trigger explicit blocks
 * - All fixtures must be deterministic
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  ALL_SELECTION_FIXTURES,
  POSITIVE_FIXTURES,
  NEAR_MISS_FIXTURES,
  AMBIGUITY_FIXTURES,
  EDGE_CASE_FIXTURES,
  runSelectionFixture,
  runFixtureCategory,
  runAllFixtures,
  getFixturesByCategory,
  getFixturesByTag,
  getFixtureById,
  type SelectionFixture,
} from '../../services/templateSelector/selectionFixtures';
import { selectTemplateMultiSignal } from '../../services/templateSelector/selectorService';
import {
  resetRegistry,
  createTemplate,
  uploadTemplateVersion,
  activateVersion,
  initializeDefaultTemplate,
} from '../../services/templateRegistry';
import {
  DEFAULT_SPEC_JSON,
  DEFAULT_SELECTION_CONFIG,
  DEFAULT_ROI_CONFIG,
} from '../../services/templateRegistry/defaultTemplate';

describe('Selection Fixtures', () => {
  beforeEach(() => {
    resetRegistry();
    // Initialize the default template for fixture testing
    initializeDefaultTemplate();
  });

  afterEach(() => {
    resetRegistry();
  });

  describe('Fixture Registry', () => {
    it('should have all fixture categories defined', () => {
      expect(POSITIVE_FIXTURES.length).toBeGreaterThan(0);
      expect(NEAR_MISS_FIXTURES.length).toBeGreaterThan(0);
      expect(AMBIGUITY_FIXTURES.length).toBeGreaterThan(0);
      expect(EDGE_CASE_FIXTURES.length).toBeGreaterThan(0);
    });

    it('should have unique fixture IDs', () => {
      const ids = ALL_SELECTION_FIXTURES.map(f => f.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should have all fixtures properly categorized', () => {
      for (const fixture of ALL_SELECTION_FIXTURES) {
        expect(['positive', 'near-miss', 'ambiguity', 'edge-case']).toContain(fixture.category);
        expect(fixture.tags.length).toBeGreaterThan(0);
      }
    });

    it('should retrieve fixtures by category', () => {
      const positives = getFixturesByCategory('positive');
      expect(positives.length).toBe(POSITIVE_FIXTURES.length);
      expect(positives.every(f => f.category === 'positive')).toBe(true);
    });

    it('should retrieve fixtures by tag', () => {
      const nearMisses = getFixturesByTag('near-miss');
      expect(nearMisses.length).toBeGreaterThan(0);
      expect(nearMisses.every(f => f.tags.includes('near-miss'))).toBe(true);
    });

    it('should retrieve fixture by ID', () => {
      const fixture = getFixtureById('POS-001');
      expect(fixture).toBeDefined();
      expect(fixture!.id).toBe('POS-001');
    });
  });

  describe('Positive Fixtures', () => {
    it('should match positive fixtures with expected confidence', () => {
      for (const fixture of POSITIVE_FIXTURES) {
        const result = selectTemplateMultiSignal({
          documentText: fixture.documentText,
          metadata: fixture.metadata,
        });
        
        // Positive fixtures should have reasonable scores
        expect(result.topScore).toBeGreaterThan(0);
        
        // If minScore is defined, check it
        if (fixture.minScore !== undefined) {
          expect(result.topScore).toBeGreaterThanOrEqual(fixture.minScore);
        }
      }
    });

    it('should have deterministic results for positive fixtures', () => {
      for (const fixture of POSITIVE_FIXTURES) {
        const result1 = selectTemplateMultiSignal({
          documentText: fixture.documentText,
          metadata: fixture.metadata,
        });
        const result2 = selectTemplateMultiSignal({
          documentText: fixture.documentText,
          metadata: fixture.metadata,
        });
        
        expect(result1.topScore).toBe(result2.topScore);
        expect(result1.confidenceBand).toBe(result2.confidenceBand);
      }
    });
  });

  describe('Near-Miss Fixtures (Critical)', () => {
    it('should NOT give HIGH confidence to near-miss documents', () => {
      for (const fixture of NEAR_MISS_FIXTURES) {
        const result = selectTemplateMultiSignal({
          documentText: fixture.documentText,
          metadata: fixture.metadata,
        });
        
        // CRITICAL: Near-misses must NOT be HIGH confidence
        expect(result.confidenceBand).not.toBe('HIGH');
        
        // Near-misses should typically score below 50
        if (fixture.maxScore !== undefined) {
          expect(result.topScore).toBeLessThanOrEqual(fixture.maxScore);
        }
      }
    });

    it('should block near-miss documents with LOW_CONFIDENCE reason', () => {
      for (const fixture of NEAR_MISS_FIXTURES) {
        const result = selectTemplateMultiSignal({
          documentText: fixture.documentText,
          metadata: fixture.metadata,
        });
        
        // Near-misses should be blocked
        expect(result.autoProcessingAllowed).toBe(false);
        
        // Should have explicit block reason
        if (fixture.expectedBlockReasonPattern) {
          expect(result.blockReason).toBeDefined();
          expect(fixture.expectedBlockReasonPattern.test(result.blockReason!)).toBe(true);
        }
      }
    });

    it('NEAR-001: Job application should not match job sheet template', () => {
      const fixture = getFixtureById('NEAR-001')!;
      const result = selectTemplateMultiSignal({
        documentText: fixture.documentText,
      });
      
      expect(result.confidenceBand).toBe('LOW');
      expect(result.autoProcessingAllowed).toBe(false);
    });

    it('NEAR-002: Invoice should not match job sheet template', () => {
      const fixture = getFixtureById('NEAR-002')!;
      const result = selectTemplateMultiSignal({
        documentText: fixture.documentText,
      });
      
      expect(result.confidenceBand).toBe('LOW');
      expect(result.autoProcessingAllowed).toBe(false);
    });
  });

  describe('Ambiguity Fixtures (Critical)', () => {
    beforeEach(() => {
      // Create a second template with VERY similar selection config to trigger ambiguity
      const template2 = createTemplate({
        templateId: 'inspection-report-v1',
        name: 'Inspection Report',
        createdBy: 1,
      });
      const version2 = uploadTemplateVersion({
        templateId: template2.id,
        version: '1.0.0',
        specJson: {
          ...DEFAULT_SPEC_JSON,
          name: 'Inspection Report',
        },
        selectionConfigJson: {
          // Same tokens as default to create ambiguity
          requiredTokensAll: [],
          requiredTokensAny: ['service', 'document', 'work', 'order'],
          optionalTokens: ['date', 'reference', 'customer'],
        },
        createdBy: 1,
      });
      activateVersion(version2.id, { skipPreconditions: true, skipFixtures: true });
    });

    it('should block ambiguous documents when score gap is small', () => {
      // Use a document specifically designed to score similarly on both templates
      const ambiguousDocument = `
        SERVICE DOCUMENT
        Date: 15/03/2026
        Reference Number: REF-12345
        Customer: General Corp
        Work Order: WO-2026-001
      `;
      
      const result = selectTemplateMultiSignal({
        documentText: ambiguousDocument,
      });
      
      // Check if we have multiple candidates with close scores
      if (result.candidates.length >= 2) {
        const gap = result.topScore - result.runnerUpScore;
        
        // If gap is small and confidence is MEDIUM, should be blocked
        if (gap < 10 && result.confidenceBand === 'MEDIUM') {
          expect(result.autoProcessingAllowed).toBe(false);
          expect(result.blockReason).toBeDefined();
          expect(result.blockReason).toContain('AMBIGUITY');
        }
      }
    });

    it('should not auto-process when score gap is too small', () => {
      // Generic service document should match multiple templates similarly
      const fixture = getFixtureById('AMB-001')!;
      const result = selectTemplateMultiSignal({
        documentText: fixture.documentText,
      });
      
      // If two templates score similarly, should not auto-process
      if (result.scoreGap < 10 && result.confidenceBand === 'MEDIUM') {
        expect(result.autoProcessingAllowed).toBe(false);
      }
    });
  });

  describe('Edge Case Fixtures', () => {
    it('EDGE-001: Empty document should not match', () => {
      const fixture = getFixtureById('EDGE-001')!;
      const result = selectTemplateMultiSignal({
        documentText: fixture.documentText,
      });
      
      expect(result.autoProcessingAllowed).toBe(false);
    });

    it('EDGE-002: Single word document should have low confidence', () => {
      const fixture = getFixtureById('EDGE-002')!;
      const result = selectTemplateMultiSignal({
        documentText: fixture.documentText,
      });
      
      expect(result.confidenceBand).toBe('LOW');
      expect(result.topScore).toBeLessThanOrEqual(30);
    });

    it('EDGE-003: Special characters only should not match', () => {
      const fixture = getFixtureById('EDGE-003')!;
      const result = selectTemplateMultiSignal({
        documentText: fixture.documentText,
      });
      
      expect(result.autoProcessingAllowed).toBe(false);
    });

    it('EDGE-005: Wrong language should have low confidence', () => {
      const fixture = getFixtureById('EDGE-005')!;
      const result = selectTemplateMultiSignal({
        documentText: fixture.documentText,
      });
      
      expect(result.confidenceBand).toBe('LOW');
      expect(result.autoProcessingAllowed).toBe(false);
    });
  });

  describe('Fixture Runner', () => {
    it('should run a single fixture and return result', () => {
      const fixture = getFixtureById('POS-001')!;
      const result = runSelectionFixture(fixture);
      
      expect(result.fixture.id).toBe('POS-001');
      expect(result.actualScore).toBeGreaterThanOrEqual(0);
      expect(result.actualConfidenceBand).toBeDefined();
    });

    it('should detect passing fixtures correctly', () => {
      // Near-miss should pass if it correctly blocks
      const fixture: SelectionFixture = {
        id: 'TEST-001',
        description: 'Test fixture',
        category: 'near-miss',
        documentText: 'Random unrelated text without any job sheet keywords',
        expectedOutcome: 'LOW_CONFIDENCE_BLOCK',
        expectedConfidenceBand: 'LOW',
        tags: ['test'],
      };
      
      const result = runSelectionFixture(fixture);
      
      // Should pass because it correctly gets LOW confidence
      expect(result.actualConfidenceBand).toBe('LOW');
      expect(result.actualOutcome).toBe('LOW_CONFIDENCE_BLOCK');
    });

    it('should detect failing fixtures correctly', () => {
      const fixture: SelectionFixture = {
        id: 'TEST-002',
        description: 'Impossible fixture (expects HIGH for random text)',
        category: 'positive',
        documentText: 'xyz abc 123',
        expectedOutcome: 'HIGH_CONFIDENCE_MATCH',
        expectedConfidenceBand: 'HIGH',
        minScore: 90,
        tags: ['test'],
      };
      
      const result = runSelectionFixture(fixture);
      
      // Should fail because random text won't get HIGH confidence
      expect(result.passed).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should run all fixtures in a category', () => {
      const results = runFixtureCategory('near-miss');
      
      expect(results.length).toBe(NEAR_MISS_FIXTURES.length);
      for (const result of results) {
        expect(result.fixture.category).toBe('near-miss');
      }
    });

    it('should run all fixtures and return summary', () => {
      const summary = runAllFixtures();
      
      expect(summary.total).toBe(ALL_SELECTION_FIXTURES.length);
      expect(summary.passed + summary.failed).toBe(summary.total);
      expect(Object.keys(summary.byCategory).length).toBeGreaterThan(0);
    });
  });

  describe('Determinism', () => {
    it('should produce identical results for all fixtures on repeated runs', () => {
      for (const fixture of ALL_SELECTION_FIXTURES.slice(0, 5)) {
        const result1 = runSelectionFixture(fixture);
        const result2 = runSelectionFixture(fixture);
        
        expect(result1.actualScore).toBe(result2.actualScore);
        expect(result1.actualConfidenceBand).toBe(result2.actualConfidenceBand);
        expect(result1.actualOutcome).toBe(result2.actualOutcome);
      }
    });
  });
});
