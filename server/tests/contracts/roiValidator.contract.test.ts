/**
 * ROI Validator Contract Tests
 * 
 * PR-H: Tests for ROI validation and persistence.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  resetRegistry,
  createTemplate,
  uploadTemplateVersion,
  getTemplateVersion,
  updateVersionRoi,
  validateRoiConfig,
  normalizeRoiConfig,
  createEmptyRoiConfig,
  createStandardJobSheetRoi,
  STANDARD_ROI_TYPES,
  type SpecJson,
  type SelectionConfig,
  type RoiConfig,
} from '../../services/templateRegistry';

// Test fixtures
const testSpec: SpecJson = {
  name: 'Test Spec',
  version: '1.0.0',
  fields: [
    { field: 'jobReference', label: 'Job Ref', type: 'string', required: true },
    { field: 'assetId', label: 'Asset ID', type: 'string', required: true },
    { field: 'date', label: 'Date', type: 'date', required: true },
    { field: 'engineerSignOff', label: 'Sign Off', type: 'boolean', required: true },
  ],
  rules: [
    { ruleId: 'R001', field: 'jobReference', description: 'Required', severity: 'critical', type: 'required', enabled: true },
  ],
};

const testSelectionConfig: SelectionConfig = {
  requiredTokensAll: ['job'],
  requiredTokensAny: ['test'],
  optionalTokens: [],
};

// Valid ROI config
const validRoiConfig: RoiConfig = {
  regions: [
    { name: 'header', page: 1, bounds: { x: 0, y: 0, width: 1, height: 0.1 } },
    { name: 'jobReference', page: 1, bounds: { x: 0.05, y: 0.1, width: 0.4, height: 0.05 } },
    { name: 'signatureBlock', page: 1, bounds: { x: 0, y: 0.85, width: 1, height: 0.15 } },
  ],
};

describe('ROI Validator - PR-H Contract Tests', () => {
  beforeEach(() => {
    resetRegistry();
  });

  describe('ROI Validation', () => {
    it('should validate correct ROI config', () => {
      const result = validateRoiConfig(validRoiConfig);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject ROI with coordinates outside 0-1 range', () => {
      const invalid: RoiConfig = {
        regions: [
          { name: 'test', page: 1, bounds: { x: 1.5, y: 0, width: 0.5, height: 0.1 } },
        ],
      };
      
      const result = validateRoiConfig(invalid);
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('x'))).toBe(true);
    });

    it('should reject ROI with negative coordinates', () => {
      const invalid: RoiConfig = {
        regions: [
          { name: 'test', page: 1, bounds: { x: -0.1, y: 0, width: 0.5, height: 0.1 } },
        ],
      };
      
      const result = validateRoiConfig(invalid);
      
      expect(result.valid).toBe(false);
    });

    it('should reject ROI with page < 1', () => {
      const invalid: RoiConfig = {
        regions: [
          { name: 'test', page: 0, bounds: { x: 0, y: 0, width: 0.5, height: 0.1 } },
        ],
      };
      
      const result = validateRoiConfig(invalid);
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('page'))).toBe(true);
    });

    it('should reject ROI region without name', () => {
      const invalid: RoiConfig = {
        regions: [
          { name: '', page: 1, bounds: { x: 0, y: 0, width: 0.5, height: 0.1 } },
        ],
      };
      
      const result = validateRoiConfig(invalid);
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('name'))).toBe(true);
    });

    it('should reject ROI with zero width', () => {
      const invalid: RoiConfig = {
        regions: [
          { name: 'test', page: 1, bounds: { x: 0.5, y: 0.5, width: 0, height: 0.1 } },
        ],
      };
      
      const result = validateRoiConfig(invalid);
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('width'))).toBe(true);
    });

    it('should warn about duplicate region names', () => {
      const withDuplicates: RoiConfig = {
        regions: [
          { name: 'header', page: 1, bounds: { x: 0, y: 0, width: 1, height: 0.1 } },
          { name: 'header', page: 1, bounds: { x: 0, y: 0.5, width: 1, height: 0.1 } },
        ],
      };
      
      const result = validateRoiConfig(withDuplicates);
      
      expect(result.warnings.some(w => w.includes('Duplicate'))).toBe(true);
    });

    it('should warn about overlapping regions', () => {
      const overlapping: RoiConfig = {
        regions: [
          { name: 'region1', page: 1, bounds: { x: 0, y: 0, width: 0.6, height: 0.3 } },
          { name: 'region2', page: 1, bounds: { x: 0.4, y: 0.1, width: 0.5, height: 0.3 } },
        ],
      };
      
      const result = validateRoiConfig(overlapping);
      
      expect(result.warnings.some(w => w.includes('overlap'))).toBe(true);
    });

    it('should warn about non-standard region types', () => {
      const nonStandard: RoiConfig = {
        regions: [
          { name: 'customRegion', page: 1, bounds: { x: 0, y: 0, width: 0.5, height: 0.1 } },
        ],
      };
      
      const result = validateRoiConfig(nonStandard);
      
      expect(result.warnings.some(w => w.includes('not a standard'))).toBe(true);
    });
  });

  describe('ROI Normalization', () => {
    it('should clamp coordinates to 0-1 range', () => {
      const outOfRange: RoiConfig = {
        regions: [
          { name: 'test', page: 1, bounds: { x: -0.1, y: 1.2, width: 2, height: 0.5 } },
        ],
      };
      
      const normalized = normalizeRoiConfig(outOfRange);
      
      expect(normalized.regions[0].bounds.x).toBe(0);
      expect(normalized.regions[0].bounds.y).toBe(1);
      expect(normalized.regions[0].bounds.width).toBe(1);
      expect(normalized.regions[0].bounds.height).toBe(0.5);
    });

    it('should ensure minimum width and height', () => {
      const tooSmall: RoiConfig = {
        regions: [
          { name: 'test', page: 1, bounds: { x: 0.5, y: 0.5, width: 0, height: 0 } },
        ],
      };
      
      const normalized = normalizeRoiConfig(tooSmall);
      
      expect(normalized.regions[0].bounds.width).toBeGreaterThanOrEqual(0.01);
      expect(normalized.regions[0].bounds.height).toBeGreaterThanOrEqual(0.01);
    });
  });

  describe('ROI Templates', () => {
    it('should create empty ROI config', () => {
      const empty = createEmptyRoiConfig();
      
      expect(empty.regions).toHaveLength(0);
    });

    it('should create standard job sheet ROI template', () => {
      const standard = createStandardJobSheetRoi();
      
      expect(standard.regions.length).toBeGreaterThan(0);
      
      // Check has common regions
      const regionNames = standard.regions.map(r => r.name);
      expect(regionNames).toContain('header');
      expect(regionNames).toContain('jobReference');
      expect(regionNames).toContain('signatureBlock');
    });

    it('should have valid standard template', () => {
      const standard = createStandardJobSheetRoi();
      const result = validateRoiConfig(standard);
      
      expect(result.valid).toBe(true);
    });
  });

  describe('Standard ROI Types', () => {
    it('should export standard ROI types constant', () => {
      expect(STANDARD_ROI_TYPES).toContain('header');
      expect(STANDARD_ROI_TYPES).toContain('jobReference');
      expect(STANDARD_ROI_TYPES).toContain('assetId');
      expect(STANDARD_ROI_TYPES).toContain('signatureBlock');
      expect(STANDARD_ROI_TYPES).toContain('tickboxBlock');
    });
  });

  describe('ROI Persistence', () => {
    it('should save ROI to template version', () => {
      const template = createTemplate({
        templateId: 'roi-test',
        name: 'ROI Test',
        createdBy: 1,
      });
      
      const version = uploadTemplateVersion({
        templateId: template.id,
        version: '1.0.0',
        specJson: testSpec,
        selectionConfigJson: testSelectionConfig,
        createdBy: 1,
      });
      
      // Initially no ROI
      expect(version.roiJson).toBeNull();
      
      // Update ROI
      const updated = updateVersionRoi(version.id, validRoiConfig);
      
      expect(updated.roiJson).not.toBeNull();
      expect(updated.roiJson?.regions).toHaveLength(3);
    });

    it('should retrieve saved ROI from version', () => {
      const template = createTemplate({
        templateId: 'roi-retrieve',
        name: 'ROI Retrieve',
        createdBy: 1,
      });
      
      const version = uploadTemplateVersion({
        templateId: template.id,
        version: '1.0.0',
        specJson: testSpec,
        selectionConfigJson: testSelectionConfig,
        createdBy: 1,
      });
      
      updateVersionRoi(version.id, validRoiConfig);
      
      // Retrieve
      const retrieved = getTemplateVersion(version.id);
      
      expect(retrieved?.roiJson).not.toBeNull();
      expect(retrieved?.roiJson?.regions.map(r => r.name)).toContain('header');
    });

    it('should throw error when updating non-existent version', () => {
      expect(() => updateVersionRoi(999, validRoiConfig)).toThrow('Version not found');
    });
  });
});
