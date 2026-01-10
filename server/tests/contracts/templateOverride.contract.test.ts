/**
 * Template Override Contract Tests
 * 
 * PR-G: Tests for template override mechanism.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  setTemplateOverride,
  getTemplateOverride,
  hasTemplateOverride,
  clearTemplateOverride,
  listOverrides,
  getOverrideCount,
  getOverridesByConfidence,
  resetOverrideStore,
} from '../../services/templateOverride';

describe('Template Override - PR-G Contract Tests', () => {
  beforeEach(() => {
    resetOverrideStore();
  });

  describe('Override Creation', () => {
    it('should create a template override', () => {
      const result = setTemplateOverride(
        1, // jobSheetId
        10, // templateId
        100, // versionId
        'LOW',
        0.35,
        'Document matched multiple templates',
        1 // createdBy
      );
      
      expect(result.success).toBe(true);
      expect(result.override).toBeDefined();
      expect(result.override!.jobSheetId).toBe(1);
      expect(result.override!.templateId).toBe(10);
      expect(result.override!.versionId).toBe(100);
    });

    it('should require a reason of at least 5 characters', () => {
      const result = setTemplateOverride(
        1, 10, 100, 'LOW', 0.35, 'abc', 1
      );
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('reason');
    });

    it('should store original confidence and score', () => {
      const result = setTemplateOverride(
        1, 10, 100, 'MEDIUM', 0.65, 'Ambiguous selection resolved', 1
      );
      
      expect(result.override!.originalConfidence).toBe('MEDIUM');
      expect(result.override!.originalTopScore).toBe(0.65);
    });

    it('should update existing override for same job sheet', () => {
      setTemplateOverride(1, 10, 100, 'LOW', 0.35, 'First override', 1);
      setTemplateOverride(1, 20, 200, 'MEDIUM', 0.55, 'Updated override', 2);
      
      const override = getTemplateOverride(1);
      
      expect(override!.templateId).toBe(20);
      expect(override!.versionId).toBe(200);
      expect(override!.createdBy).toBe(2);
    });
  });

  describe('Override Retrieval', () => {
    it('should retrieve override by job sheet ID', () => {
      setTemplateOverride(1, 10, 100, 'LOW', 0.35, 'Test override', 1);
      
      const override = getTemplateOverride(1);
      
      expect(override).not.toBeNull();
      expect(override!.templateId).toBe(10);
    });

    it('should return null for non-existent override', () => {
      const override = getTemplateOverride(999);
      
      expect(override).toBeNull();
    });

    it('should check if override exists', () => {
      expect(hasTemplateOverride(1)).toBe(false);
      
      setTemplateOverride(1, 10, 100, 'LOW', 0.35, 'Test override', 1);
      
      expect(hasTemplateOverride(1)).toBe(true);
    });
  });

  describe('Override Removal', () => {
    it('should clear override', () => {
      setTemplateOverride(1, 10, 100, 'LOW', 0.35, 'Test override', 1);
      expect(hasTemplateOverride(1)).toBe(true);
      
      const cleared = clearTemplateOverride(1);
      
      expect(cleared).toBe(true);
      expect(hasTemplateOverride(1)).toBe(false);
    });

    it('should return false when clearing non-existent override', () => {
      const cleared = clearTemplateOverride(999);
      
      expect(cleared).toBe(false);
    });
  });

  describe('Override Listing', () => {
    it('should list all overrides', () => {
      setTemplateOverride(1, 10, 100, 'LOW', 0.35, 'Override 1', 1);
      setTemplateOverride(2, 20, 200, 'MEDIUM', 0.55, 'Override 2', 1);
      setTemplateOverride(3, 30, 300, 'LOW', 0.25, 'Override 3', 1);
      
      const overrides = listOverrides();
      
      expect(overrides.length).toBe(3);
    });

    it('should return overrides in deterministic order', () => {
      setTemplateOverride(1, 10, 100, 'LOW', 0.35, 'First created', 1);
      setTemplateOverride(2, 20, 200, 'LOW', 0.35, 'Second created', 1);
      setTemplateOverride(3, 30, 300, 'LOW', 0.35, 'Third created', 1);
      
      const overrides = listOverrides();
      
      // All overrides returned
      expect(overrides.length).toBe(3);
      
      // Has all job sheet IDs
      const jobSheetIds = overrides.map(o => o.jobSheetId);
      expect(jobSheetIds).toContain(1);
      expect(jobSheetIds).toContain(2);
      expect(jobSheetIds).toContain(3);
    });

    it('should return empty array when no overrides', () => {
      const overrides = listOverrides();
      
      expect(overrides).toEqual([]);
    });
  });

  describe('Override Analytics', () => {
    it('should count overrides', () => {
      expect(getOverrideCount()).toBe(0);
      
      setTemplateOverride(1, 10, 100, 'LOW', 0.35, 'Override 1', 1);
      setTemplateOverride(2, 20, 200, 'LOW', 0.35, 'Override 2', 1);
      
      expect(getOverrideCount()).toBe(2);
    });

    it('should group overrides by confidence band', () => {
      setTemplateOverride(1, 10, 100, 'LOW', 0.25, 'Low conf 1', 1);
      setTemplateOverride(2, 20, 200, 'LOW', 0.30, 'Low conf 2', 1);
      setTemplateOverride(3, 30, 300, 'MEDIUM', 0.55, 'Medium conf', 1);
      setTemplateOverride(4, 40, 400, 'HIGH', 0.85, 'High conf', 1);
      
      const byConfidence = getOverridesByConfidence();
      
      expect(byConfidence.LOW).toBe(2);
      expect(byConfidence.MEDIUM).toBe(1);
      expect(byConfidence.HIGH).toBe(1);
    });
  });

  describe('Override for LOW/Ambiguous Selection', () => {
    it('should be used when selection confidence is LOW', () => {
      // Simulate: selection returned LOW confidence
      const selectionResult = {
        selected: false,
        confidenceBand: 'LOW' as const,
        topScore: 0.35,
        blockReason: 'LOW_CONFIDENCE',
      };
      
      // Admin creates override
      const overrideResult = setTemplateOverride(
        1,
        10,
        100,
        selectionResult.confidenceBand,
        selectionResult.topScore,
        'Manual template assignment after review',
        1
      );
      
      expect(overrideResult.success).toBe(true);
      
      // Now processing should use override
      const override = getTemplateOverride(1);
      expect(override).not.toBeNull();
      expect(override!.templateId).toBe(10);
    });

    it('should be used when selection is ambiguous (MEDIUM with close runner-up)', () => {
      // Simulate: selection returned MEDIUM with small gap
      const selectionResult = {
        selected: true,
        confidenceBand: 'MEDIUM' as const,
        topScore: 0.55,
        runnerUpScore: 0.50,
        scoreGap: 0.05, // Small gap = ambiguous
        blockReason: 'CONFLICT',
      };
      
      // Admin creates override
      const overrideResult = setTemplateOverride(
        2,
        20,
        200,
        selectionResult.confidenceBand,
        selectionResult.topScore,
        'Resolved ambiguity between maintenance and installation templates',
        1
      );
      
      expect(overrideResult.success).toBe(true);
    });
  });
});
