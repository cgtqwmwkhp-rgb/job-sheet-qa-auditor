/**
 * Selection Analytics Contract Tests
 * 
 * PR-I: Tests for analytics aggregations and ops dashboard.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordSelection,
  getSelectionAnalytics,
  getAmbiguousTemplatePairs,
  getTokenCollisions,
  getTemplateAnalyticsSummary,
  checkAmbiguityAlert,
  getSelectionRecords,
  resetAnalyticsStore,
  getAnalyticsStoreStats,
  type SelectionRecord,
} from '../../services/selectionAnalytics';
import type { SelectionTraceArtifact } from '../../services/templateRegistry';

// Helper to create mock selection traces
function createMockTrace(overrides: Partial<{
  jobSheetId: number;
  templateId: number | null;
  templateSlug: string | null;
  confidenceBand: 'HIGH' | 'MEDIUM' | 'LOW';
  topScore: number;
  runnerUpScore: number;
  scoreDelta: number;
  autoProcessingAllowed: boolean;
  selected: boolean;
  tokenSample: string[];
  candidateCount: number;
}>): SelectionTraceArtifact {
  return {
    artifactVersion: '1.0.0',
    timestamp: new Date().toISOString(),
    jobSheetId: overrides.jobSheetId ?? 1,
    inputSignals: {
      tokenCount: 20,
      tokenSample: overrides.tokenSample ?? ['job', 'sheet', 'repair'],
      documentLength: 500,
    },
    outcome: {
      selected: overrides.selected ?? true,
      templateId: overrides.templateId ?? 1,
      versionId: 1,
      templateSlug: overrides.templateSlug ?? 'test-template',
      confidenceBand: overrides.confidenceBand ?? 'HIGH',
      topScore: overrides.topScore ?? 0.85,
      runnerUpScore: overrides.runnerUpScore ?? 0.45,
      scoreDelta: overrides.scoreDelta ?? 0.40,
      autoProcessingAllowed: overrides.autoProcessingAllowed ?? true,
      blockReason: null,
    },
    candidates: Array(overrides.candidateCount ?? 2).fill({
      templateId: 1,
      templateSlug: 'test',
      versionId: 1,
      score: 0.5,
      confidence: 'HIGH',
      matchedTokenCount: 3,
      missingRequiredCount: 0,
    }),
  };
}

describe('Selection Analytics - PR-I Contract Tests', () => {
  beforeEach(() => {
    resetAnalyticsStore();
  });

  describe('Recording Selections', () => {
    it('should record a selection', () => {
      const trace = createMockTrace({ jobSheetId: 1 });
      const record = recordSelection(trace);
      
      expect(record.id).toBeDefined();
      expect(record.jobSheetId).toBe(1);
      expect(record.confidenceBand).toBe('HIGH');
    });

    it('should track override status', () => {
      const trace = createMockTrace({});
      const record = recordSelection(trace, true);
      
      expect(record.wasOverridden).toBe(true);
    });

    it('should increment record IDs', () => {
      const r1 = recordSelection(createMockTrace({ jobSheetId: 1 }));
      const r2 = recordSelection(createMockTrace({ jobSheetId: 2 }));
      
      expect(r2.id).toBeGreaterThan(r1.id);
    });
  });

  describe('Overall Analytics', () => {
    it('should calculate confidence distribution', () => {
      recordSelection(createMockTrace({ confidenceBand: 'HIGH' }));
      recordSelection(createMockTrace({ confidenceBand: 'HIGH' }));
      recordSelection(createMockTrace({ confidenceBand: 'MEDIUM' }));
      recordSelection(createMockTrace({ confidenceBand: 'LOW' }));
      
      const analytics = getSelectionAnalytics();
      
      expect(analytics.confidenceDistribution.HIGH).toBe(2);
      expect(analytics.confidenceDistribution.MEDIUM).toBe(1);
      expect(analytics.confidenceDistribution.LOW).toBe(1);
      expect(analytics.totalSelections).toBe(4);
    });

    it('should count auto-processed selections', () => {
      recordSelection(createMockTrace({ autoProcessingAllowed: true, selected: true }));
      recordSelection(createMockTrace({ autoProcessingAllowed: true, selected: true }));
      recordSelection(createMockTrace({ autoProcessingAllowed: false, selected: false }));
      
      const analytics = getSelectionAnalytics();
      
      expect(analytics.autoProcessedCount).toBe(2);
    });

    it('should count overrides', () => {
      recordSelection(createMockTrace({}), false);
      recordSelection(createMockTrace({}), true);
      recordSelection(createMockTrace({}), true);
      
      const analytics = getSelectionAnalytics();
      
      expect(analytics.overrideCount).toBe(2);
    });

    it('should count ambiguous selections', () => {
      // Ambiguous: score gap < 0.10 with multiple candidates
      recordSelection(createMockTrace({ scoreDelta: 0.05, candidateCount: 3 }));
      recordSelection(createMockTrace({ scoreDelta: 0.08, candidateCount: 2 }));
      // Not ambiguous: gap >= 0.10
      recordSelection(createMockTrace({ scoreDelta: 0.15, candidateCount: 2 }));
      
      const analytics = getSelectionAnalytics();
      
      expect(analytics.ambiguousCount).toBe(2);
    });

    it('should return empty analytics when no records', () => {
      const analytics = getSelectionAnalytics();
      
      expect(analytics.totalSelections).toBe(0);
      expect(analytics.ambiguousCount).toBe(0);
    });
  });

  describe('Ambiguous Template Pairs', () => {
    it('should identify ambiguous pairs', () => {
      // Create ambiguous selections
      recordSelection(createMockTrace({
        templateSlug: 'maintenance-v1',
        scoreDelta: 0.05,
        candidateCount: 2,
      }));
      recordSelection(createMockTrace({
        templateSlug: 'maintenance-v1',
        scoreDelta: 0.07,
        candidateCount: 2,
      }));
      
      const pairs = getAmbiguousTemplatePairs();
      
      expect(pairs.length).toBeGreaterThan(0);
    });

    it('should limit results', () => {
      // Create many ambiguous selections
      for (let i = 0; i < 20; i++) {
        recordSelection(createMockTrace({
          templateSlug: `template-${i}`,
          scoreDelta: 0.05,
          candidateCount: 2,
        }));
      }
      
      const pairs = getAmbiguousTemplatePairs(5);
      
      expect(pairs.length).toBeLessThanOrEqual(5);
    });
  });

  describe('Token Collisions', () => {
    it('should identify tokens in multiple templates', () => {
      recordSelection(createMockTrace({
        templateSlug: 'template-a',
        tokenSample: ['maintenance', 'job', 'sheet'],
        scoreDelta: 0.05,
        candidateCount: 2,
      }));
      recordSelection(createMockTrace({
        templateSlug: 'template-b',
        tokenSample: ['maintenance', 'repair'],
        scoreDelta: 0.05,
        candidateCount: 2,
      }));
      
      const collisions = getTokenCollisions();
      
      // 'maintenance' appears in both templates during ambiguous selections
      const maintenanceCollision = collisions.find(c => c.token === 'maintenance');
      expect(maintenanceCollision).toBeDefined();
    });

    it('should sort by collision count', () => {
      // Create selections with common tokens
      for (let i = 0; i < 10; i++) {
        recordSelection(createMockTrace({
          templateSlug: `template-${i % 3}`,
          tokenSample: ['common-token', 'job'],
          scoreDelta: 0.05,
          candidateCount: 2,
        }));
      }
      
      const collisions = getTokenCollisions();
      
      if (collisions.length > 1) {
        expect(collisions[0].collisionCount).toBeGreaterThanOrEqual(collisions[1].collisionCount);
      }
    });
  });

  describe('Template Analytics Summary', () => {
    it('should summarize per-template stats', () => {
      recordSelection(createMockTrace({ templateSlug: 'template-a', confidenceBand: 'HIGH' }));
      recordSelection(createMockTrace({ templateSlug: 'template-a', confidenceBand: 'HIGH' }));
      recordSelection(createMockTrace({ templateSlug: 'template-b', confidenceBand: 'MEDIUM' }));
      
      const summary = getTemplateAnalyticsSummary();
      
      expect(summary.length).toBe(2);
      
      const templateA = summary.find(s => s.templateSlug === 'template-a');
      expect(templateA?.totalSelections).toBe(2);
      expect(templateA?.highConfidenceCount).toBe(2);
    });

    it('should sort by total selections', () => {
      recordSelection(createMockTrace({ templateSlug: 'less-used' }));
      recordSelection(createMockTrace({ templateSlug: 'most-used' }));
      recordSelection(createMockTrace({ templateSlug: 'most-used' }));
      recordSelection(createMockTrace({ templateSlug: 'most-used' }));
      
      const summary = getTemplateAnalyticsSummary();
      
      expect(summary[0].templateSlug).toBe('most-used');
    });

    it('should calculate average score', () => {
      recordSelection(createMockTrace({ templateSlug: 'template-x', topScore: 0.80 }));
      recordSelection(createMockTrace({ templateSlug: 'template-x', topScore: 0.90 }));
      
      const summary = getTemplateAnalyticsSummary();
      const templateX = summary.find(s => s.templateSlug === 'template-x');
      
      // Use toBeCloseTo for floating point comparison
      expect(templateX?.avgScore).toBeCloseTo(0.85, 10);
    });
  });

  describe('Ambiguity Alert', () => {
    it('should alert when ambiguity exceeds threshold', () => {
      // 60% ambiguous selections
      recordSelection(createMockTrace({ scoreDelta: 0.05, candidateCount: 2 }));
      recordSelection(createMockTrace({ scoreDelta: 0.05, candidateCount: 2 }));
      recordSelection(createMockTrace({ scoreDelta: 0.05, candidateCount: 2 }));
      recordSelection(createMockTrace({ scoreDelta: 0.50, candidateCount: 2 }));
      recordSelection(createMockTrace({ scoreDelta: 0.50, candidateCount: 2 }));
      
      const alert = checkAmbiguityAlert(50); // 50% threshold
      
      expect(alert.alert).toBe(true);
      expect(alert.rate).toBe(60);
    });

    it('should not alert when below threshold', () => {
      recordSelection(createMockTrace({ scoreDelta: 0.50, candidateCount: 2 }));
      recordSelection(createMockTrace({ scoreDelta: 0.50, candidateCount: 2 }));
      recordSelection(createMockTrace({ scoreDelta: 0.05, candidateCount: 2 }));
      
      const alert = checkAmbiguityAlert(50);
      
      expect(alert.alert).toBe(false);
    });

    it('should handle no records gracefully', () => {
      const alert = checkAmbiguityAlert();
      
      expect(alert.alert).toBe(false);
      expect(alert.message).toContain('No selections');
    });
  });

  describe('Selection Records with Filtering', () => {
    it('should filter by template slug', () => {
      recordSelection(createMockTrace({ templateSlug: 'template-a' }));
      recordSelection(createMockTrace({ templateSlug: 'template-b' }));
      recordSelection(createMockTrace({ templateSlug: 'template-a' }));
      
      const result = getSelectionRecords({ templateSlug: 'template-a' });
      
      expect(result.total).toBe(2);
      expect(result.records.every(r => r.templateSlug === 'template-a')).toBe(true);
    });

    it('should filter by confidence band', () => {
      recordSelection(createMockTrace({ confidenceBand: 'HIGH' }));
      recordSelection(createMockTrace({ confidenceBand: 'LOW' }));
      recordSelection(createMockTrace({ confidenceBand: 'LOW' }));
      
      const result = getSelectionRecords({ confidenceBand: 'LOW' });
      
      expect(result.total).toBe(2);
    });

    it('should filter for only ambiguous', () => {
      recordSelection(createMockTrace({ scoreDelta: 0.05, candidateCount: 2 }));
      recordSelection(createMockTrace({ scoreDelta: 0.50, candidateCount: 2 }));
      
      const result = getSelectionRecords({ onlyAmbiguous: true });
      
      expect(result.total).toBe(1);
    });

    it('should paginate results', () => {
      for (let i = 0; i < 25; i++) {
        recordSelection(createMockTrace({ jobSheetId: i }));
      }
      
      const page1 = getSelectionRecords({ limit: 10, offset: 0 });
      const page2 = getSelectionRecords({ limit: 10, offset: 10 });
      
      expect(page1.records.length).toBe(10);
      expect(page2.records.length).toBe(10);
      expect(page1.total).toBe(25);
    });

    it('should return records in consistent order', () => {
      recordSelection(createMockTrace({ jobSheetId: 1 }));
      recordSelection(createMockTrace({ jobSheetId: 2 }));
      recordSelection(createMockTrace({ jobSheetId: 3 }));
      
      const result = getSelectionRecords({});
      
      // Should have all 3 records
      expect(result.total).toBe(3);
      expect(result.records.length).toBe(3);
      
      // Should be deterministic
      const result2 = getSelectionRecords({});
      expect(result.records.map(r => r.jobSheetId)).toEqual(result2.records.map(r => r.jobSheetId));
    });
  });

  describe('Deterministic Ordering', () => {
    it('should return consistent order for template summary', () => {
      recordSelection(createMockTrace({ templateSlug: 'a' }));
      recordSelection(createMockTrace({ templateSlug: 'b' }));
      recordSelection(createMockTrace({ templateSlug: 'c' }));
      
      const summary1 = getTemplateAnalyticsSummary();
      const summary2 = getTemplateAnalyticsSummary();
      
      expect(summary1.map(s => s.templateSlug)).toEqual(summary2.map(s => s.templateSlug));
    });

    it('should return consistent order for token collisions', () => {
      for (let i = 0; i < 10; i++) {
        recordSelection(createMockTrace({
          templateSlug: `t-${i % 2}`,
          tokenSample: ['token1', 'token2'],
          scoreDelta: 0.05,
          candidateCount: 2,
        }));
      }
      
      const collisions1 = getTokenCollisions();
      const collisions2 = getTokenCollisions();
      
      expect(collisions1.map(c => c.token)).toEqual(collisions2.map(c => c.token));
    });
  });

  describe('Store Management', () => {
    it('should reset store', () => {
      recordSelection(createMockTrace({}));
      recordSelection(createMockTrace({}));
      
      expect(getAnalyticsStoreStats().recordCount).toBe(2);
      
      resetAnalyticsStore();
      
      expect(getAnalyticsStoreStats().recordCount).toBe(0);
    });
  });
});
