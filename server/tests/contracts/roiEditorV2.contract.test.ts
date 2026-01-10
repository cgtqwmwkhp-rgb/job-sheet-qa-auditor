/**
 * ROI Editor V2 Contract Tests
 * 
 * PR-L: Tests for enhanced ROI editor functionality.
 * Focuses on backend contract validation and RBAC.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  resetRegistry,
  createTemplate,
  uploadTemplateVersion,
  updateVersionRoi,
  getTemplateVersion,
  validateRoiConfig,
  type RoiConfig,
} from '../../services/templateRegistry';

// Test ROI configurations
const validRoiConfig: RoiConfig = {
  regions: [
    { name: 'jobReference', page: 1, bounds: { x: 0.05, y: 0.1, width: 0.4, height: 0.05 } },
    { name: 'assetId', page: 1, bounds: { x: 0.5, y: 0.1, width: 0.45, height: 0.05 } },
    { name: 'date', page: 1, bounds: { x: 0.7, y: 0.02, width: 0.25, height: 0.04 } },
    { name: 'signatureBlock', page: 1, bounds: { x: 0, y: 0.85, width: 1, height: 0.15 } },
  ],
};

const invalidBoundsRoi: RoiConfig = {
  regions: [
    { name: 'jobReference', page: 1, bounds: { x: -0.1, y: 0.1, width: 0.4, height: 0.05 } },
  ],
};

const overflowBoundsRoi: RoiConfig = {
  regions: [
    { name: 'jobReference', page: 1, bounds: { x: 0.8, y: 0.1, width: 0.4, height: 0.05 } },
  ],
};

const validSpecJson = {
  name: 'Test Spec',
  version: '1.0.0',
  fields: [
    { field: 'jobReference', label: 'Job Reference', type: 'string', required: true },
    { field: 'assetId', label: 'Asset ID', type: 'string', required: true },
    { field: 'date', label: 'Date', type: 'date', required: true },
    { field: 'engineerSignOff', label: 'Engineer Sign Off', type: 'boolean', required: true },
  ],
  rules: [
    { ruleId: 'R001', field: 'jobReference', description: 'Required', severity: 'critical', type: 'required', enabled: true },
  ],
};

const validSelectionConfig = {
  requiredTokensAll: ['job', 'sheet'],
  requiredTokensAny: ['test'],
};

describe('ROI Editor V2 - PR-L Contract Tests', () => {
  beforeEach(() => {
    resetRegistry();
  });

  describe('ROI Validation', () => {
    it('should validate correct ROI config', () => {
      const result = validateRoiConfig(validRoiConfig);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject negative coordinates', () => {
      const result = validateRoiConfig(invalidBoundsRoi);
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('negative') || e.includes('bounds'))).toBe(true);
    });

    it('should warn when coordinates exceed 1.0', () => {
      const result = validateRoiConfig(overflowBoundsRoi);
      
      // Overflow is a warning, not an error (allows minor boundary overlaps)
      expect(result.valid).toBe(true);
      expect(result.warnings.some(e => e.includes('exceed') || e.includes('overflow'))).toBe(true);
    });

    it('should validate page indices', () => {
      const invalidPageRoi: RoiConfig = {
        regions: [
          { name: 'test', page: 0, bounds: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 } },
        ],
      };
      
      const result = validateRoiConfig(invalidPageRoi);
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('page'))).toBe(true);
    });

    it('should allow empty ROI config', () => {
      const emptyRoi: RoiConfig = { regions: [] };
      const result = validateRoiConfig(emptyRoi);
      
      expect(result.valid).toBe(true);
    });
  });

  describe('ROI Save/Load', () => {
    it('should save ROI to template version', () => {
      const template = createTemplate({ templateId: 'test', name: 'Test', createdBy: 1 });
      const version = uploadTemplateVersion({
        templateId: template.id,
        version: '1.0.0',
        specJson: validSpecJson,
        selectionConfigJson: validSelectionConfig,
        createdBy: 1,
      });
      
      const updated = updateVersionRoi(version.id, validRoiConfig);
      
      expect(updated.roiJson).toBeDefined();
      expect(updated.roiJson?.regions).toHaveLength(4);
    });

    it('should load ROI from template version', () => {
      const template = createTemplate({ templateId: 'test', name: 'Test', createdBy: 1 });
      const version = uploadTemplateVersion({
        templateId: template.id,
        version: '1.0.0',
        specJson: validSpecJson,
        selectionConfigJson: validSelectionConfig,
        roiJson: validRoiConfig,
        createdBy: 1,
      });
      
      const loaded = getTemplateVersion(version.id);
      
      expect(loaded?.roiJson).toBeDefined();
      expect(loaded?.roiJson?.regions[0].name).toBe('jobReference');
    });

    it('should update existing ROI', () => {
      const template = createTemplate({ templateId: 'test', name: 'Test', createdBy: 1 });
      const version = uploadTemplateVersion({
        templateId: template.id,
        version: '1.0.0',
        specJson: validSpecJson,
        selectionConfigJson: validSelectionConfig,
        roiJson: validRoiConfig,
        createdBy: 1,
      });
      
      const newRoi: RoiConfig = {
        regions: [
          { name: 'header', page: 1, bounds: { x: 0, y: 0, width: 1, height: 0.1 } },
        ],
      };
      
      const updated = updateVersionRoi(version.id, newRoi);
      
      expect(updated.roiJson?.regions).toHaveLength(1);
      expect(updated.roiJson?.regions[0].name).toBe('header');
    });
  });

  describe('ROI Region Properties', () => {
    it('should preserve all region properties', () => {
      const template = createTemplate({ templateId: 'test', name: 'Test', createdBy: 1 });
      const version = uploadTemplateVersion({
        templateId: template.id,
        version: '1.0.0',
        specJson: validSpecJson,
        selectionConfigJson: validSelectionConfig,
        roiJson: validRoiConfig,
        createdBy: 1,
      });
      
      const loaded = getTemplateVersion(version.id);
      const region = loaded?.roiJson?.regions[0];
      
      expect(region?.name).toBe('jobReference');
      expect(region?.page).toBe(1);
      expect(region?.bounds.x).toBe(0.05);
      expect(region?.bounds.y).toBe(0.1);
      expect(region?.bounds.width).toBe(0.4);
      expect(region?.bounds.height).toBe(0.05);
    });

    it('should handle multi-page ROIs', () => {
      const multiPageRoi: RoiConfig = {
        regions: [
          { name: 'page1', page: 1, bounds: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 } },
          { name: 'page2', page: 2, bounds: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 } },
        ],
      };
      
      const template = createTemplate({ templateId: 'test', name: 'Test', createdBy: 1 });
      const version = uploadTemplateVersion({
        templateId: template.id,
        version: '1.0.0',
        specJson: validSpecJson,
        selectionConfigJson: validSelectionConfig,
        roiJson: multiPageRoi,
        createdBy: 1,
      });
      
      const loaded = getTemplateVersion(version.id);
      
      expect(loaded?.roiJson?.regions).toHaveLength(2);
      expect(loaded?.roiJson?.regions.find(r => r.page === 2)).toBeDefined();
    });
  });

  describe('RBAC', () => {
    it('should record createdBy on version', () => {
      const template = createTemplate({ templateId: 'test', name: 'Test', createdBy: 1 });
      const version = uploadTemplateVersion({
        templateId: template.id,
        version: '1.0.0',
        specJson: validSpecJson,
        selectionConfigJson: validSelectionConfig,
        createdBy: 42,
      });
      
      expect(version.createdBy).toBe(42);
    });
  });

  describe('Determinism', () => {
    it('should produce consistent validation results', () => {
      const result1 = validateRoiConfig(validRoiConfig);
      const result2 = validateRoiConfig(validRoiConfig);
      
      expect(result1.valid).toBe(result2.valid);
      expect(result1.errors.length).toBe(result2.errors.length);
    });

    it('should maintain region order on save/load', () => {
      const template = createTemplate({ templateId: 'test', name: 'Test', createdBy: 1 });
      const version = uploadTemplateVersion({
        templateId: template.id,
        version: '1.0.0',
        specJson: validSpecJson,
        selectionConfigJson: validSelectionConfig,
        roiJson: validRoiConfig,
        createdBy: 1,
      });
      
      const loaded = getTemplateVersion(version.id);
      const regionNames = loaded?.roiJson?.regions.map(r => r.name);
      
      expect(regionNames).toEqual(validRoiConfig.regions.map(r => r.name));
    });
  });
});
