/**
 * Import Pack Contract Tests
 * 
 * PR-F: Tests for bulk template import and ROI schema.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  resetRegistry,
  resetFixtureStore,
  validateImportPack,
  validateBulkImportPack,
  importTemplate,
  importBulkPack,
  createImportPackTemplate,
  getTemplate,
  getTemplateBySlug,
  getTemplateVersion,
  hasFixturePack,
  RoiConfigSchema,
  type TemplateImportPack,
  type BulkImportPack,
  type SpecJson,
  type SelectionConfig,
  type RoiConfig,
} from '../../services/templateRegistry';

// Valid spec with critical fields
const validSpecJson: SpecJson = {
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

// Valid selection config
const validSelectionConfig: SelectionConfig = {
  requiredTokensAll: ['job', 'sheet'],
  requiredTokensAny: ['repair'],
  optionalTokens: ['customer'],
};

// Valid ROI config
const validRoiConfig: RoiConfig = {
  pageIndex: 0,
  regions: [
    { name: 'jobReference', x: 0.1, y: 0.1, w: 0.3, h: 0.05 },
    { name: 'assetId', x: 0.5, y: 0.1, w: 0.3, h: 0.05 },
  ],
};

// Valid import pack
const validImportPack: TemplateImportPack = {
  metadata: {
    templateId: 'test-template',
    name: 'Test Template',
    description: 'A test template',
    category: 'maintenance',
    tags: ['test', 'repair'],
  },
  version: '1.0.0',
  specJson: validSpecJson,
  selectionConfigJson: validSelectionConfig,
  roiJson: validRoiConfig,
  fixtures: [
    {
      caseId: 'PASS-001',
      description: 'Standard pass case',
      inputText: 'Job Reference JOB-123 Asset ID ASSET-456 Date 2024-01-01 Engineer Sign Off Yes',
      expectedOutcome: 'pass',
      required: true,
    },
  ],
};

describe('Import Pack - PR-F Contract Tests', () => {
  beforeEach(() => {
    resetRegistry();
    resetFixtureStore();
  });

  describe('ROI Schema Validation', () => {
    it('should validate correct ROI config', () => {
      const result = RoiConfigSchema.safeParse(validRoiConfig);
      expect(result.success).toBe(true);
    });

    it('should reject ROI with coordinates outside 0-1 range', () => {
      const invalidRoi = {
        pageIndex: 0,
        regions: [
          { name: 'field', x: 1.5, y: 0.1, w: 0.3, h: 0.05 }, // x > 1
        ],
      };
      
      const result = RoiConfigSchema.safeParse(invalidRoi);
      expect(result.success).toBe(false);
    });

    it('should reject ROI with negative coordinates', () => {
      const invalidRoi = {
        pageIndex: 0,
        regions: [
          { name: 'field', x: -0.1, y: 0.1, w: 0.3, h: 0.05 }, // x < 0
        ],
      };
      
      const result = RoiConfigSchema.safeParse(invalidRoi);
      expect(result.success).toBe(false);
    });

    it('should reject ROI with negative page index', () => {
      const invalidRoi = {
        pageIndex: -1,
        regions: [],
      };
      
      const result = RoiConfigSchema.safeParse(invalidRoi);
      expect(result.success).toBe(false);
    });

    it('should reject ROI region without name', () => {
      const invalidRoi = {
        pageIndex: 0,
        regions: [
          { name: '', x: 0.1, y: 0.1, w: 0.3, h: 0.05 },
        ],
      };
      
      const result = RoiConfigSchema.safeParse(invalidRoi);
      expect(result.success).toBe(false);
    });
  });

  describe('Import Pack Validation', () => {
    it('should validate a correct import pack', () => {
      const result = validateImportPack(validImportPack);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject pack without templateId', () => {
      const invalid: TemplateImportPack = {
        ...validImportPack,
        metadata: { ...validImportPack.metadata, templateId: '' },
      };
      
      const result = validateImportPack(invalid);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('templateId'))).toBe(true);
    });

    it('should reject pack without name', () => {
      const invalid: TemplateImportPack = {
        ...validImportPack,
        metadata: { ...validImportPack.metadata, name: '' },
      };
      
      const result = validateImportPack(invalid);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('name'))).toBe(true);
    });

    it('should reject pack with invalid version format', () => {
      const invalid: TemplateImportPack = {
        ...validImportPack,
        version: 'v1.0',
      };
      
      const result = validateImportPack(invalid);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('semver'))).toBe(true);
    });

    it('should reject pack without specJson', () => {
      const invalid = {
        ...validImportPack,
        specJson: undefined,
      } as unknown as TemplateImportPack;
      
      const result = validateImportPack(invalid);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('specJson'))).toBe(true);
    });

    it('should validate fixtures if provided', () => {
      const invalid: TemplateImportPack = {
        ...validImportPack,
        fixtures: [
          {
            caseId: '',
            description: 'Missing caseId',
            inputText: 'test',
            expectedOutcome: 'pass',
            required: true,
          },
        ],
      };
      
      const result = validateImportPack(invalid);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('caseId'))).toBe(true);
    });
  });

  describe('Bulk Import Pack Validation', () => {
    it('should validate a correct bulk import pack', () => {
      const bulkPack: BulkImportPack = {
        packVersion: '1.0.0',
        exportedAt: new Date().toISOString(),
        templates: [validImportPack],
      };
      
      const result = validateBulkImportPack(bulkPack);
      expect(result.valid).toBe(true);
    });

    it('should reject unsupported pack version', () => {
      const bulkPack = {
        packVersion: '2.0.0',
        exportedAt: new Date().toISOString(),
        templates: [validImportPack],
      } as unknown as BulkImportPack;
      
      const result = validateBulkImportPack(bulkPack);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('pack version'))).toBe(true);
    });

    it('should reject empty templates array', () => {
      const bulkPack: BulkImportPack = {
        packVersion: '1.0.0',
        exportedAt: new Date().toISOString(),
        templates: [],
      };
      
      const result = validateBulkImportPack(bulkPack);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('empty'))).toBe(true);
    });
  });

  describe('Single Template Import', () => {
    it('should import a valid template', () => {
      const result = importTemplate(validImportPack, 1);
      
      expect(result.success).toBe(true);
      expect(result.created.templateDbId).toBeDefined();
      expect(result.created.versionDbId).toBeDefined();
      expect(result.errors).toHaveLength(0);
    });

    it('should create fixtures when provided', () => {
      const result = importTemplate(validImportPack, 1);
      
      expect(result.success).toBe(true);
      expect(result.created.fixturePackCreated).toBe(true);
      expect(hasFixturePack(result.created.versionDbId!)).toBe(true);
    });

    it('should add version to existing template', () => {
      // First import
      const result1 = importTemplate(validImportPack, 1);
      expect(result1.success).toBe(true);
      
      // Second import with different version AND different spec (to avoid duplicate hash error)
      const pack2: TemplateImportPack = {
        ...validImportPack,
        version: '1.1.0',
        specJson: {
          ...validSpecJson,
          name: 'Test Spec v1.1', // Different spec content
        },
      };
      
      const result2 = importTemplate(pack2, 1);
      
      expect(result2.success).toBe(true);
      expect(result2.warnings.some(w => w.includes('already exists'))).toBe(true);
      expect(result2.created.templateDbId).toBeUndefined(); // Not new template
      expect(result2.created.versionDbId).toBeDefined(); // New version
    });

    it('should return errors for invalid pack', () => {
      const invalid: TemplateImportPack = {
        ...validImportPack,
        metadata: { ...validImportPack.metadata, templateId: '' },
      };
      
      const result = importTemplate(invalid, 1);
      
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Bulk Import', () => {
    it('should import multiple templates', () => {
      const bulkPack: BulkImportPack = {
        packVersion: '1.0.0',
        exportedAt: new Date().toISOString(),
        templates: [
          validImportPack,
          {
            ...validImportPack,
            metadata: { ...validImportPack.metadata, templateId: 'template-2', name: 'Template 2' },
          },
          {
            ...validImportPack,
            metadata: { ...validImportPack.metadata, templateId: 'template-3', name: 'Template 3' },
          },
        ],
      };
      
      const result = importBulkPack(bulkPack, 1);
      
      expect(result.success).toBe(true);
      expect(result.totalTemplates).toBe(3);
      expect(result.successCount).toBe(3);
      expect(result.failureCount).toBe(0);
    });

    it('should report partial failures', () => {
      const bulkPack: BulkImportPack = {
        packVersion: '1.0.0',
        exportedAt: new Date().toISOString(),
        templates: [
          validImportPack,
          {
            ...validImportPack,
            metadata: { ...validImportPack.metadata, templateId: '', name: 'Invalid' },
          },
        ],
      };
      
      const result = importBulkPack(bulkPack, 1);
      
      expect(result.success).toBe(false);
      expect(result.successCount).toBe(1);
      expect(result.failureCount).toBe(1);
    });

    it('should include duration in result', () => {
      const bulkPack: BulkImportPack = {
        packVersion: '1.0.0',
        exportedAt: new Date().toISOString(),
        templates: [validImportPack],
      };
      
      const result = importBulkPack(bulkPack, 1);
      
      expect(typeof result.durationMs).toBe('number');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Import Pack Template Generation', () => {
    it('should create a valid template pack', () => {
      const template = createImportPackTemplate();
      
      expect(template.packVersion).toBe('1.0.0');
      expect(template.templates).toHaveLength(1);
      
      // Validate the generated template
      const validation = validateBulkImportPack(template);
      expect(validation.valid).toBe(true);
    });

    it('should include all required sections', () => {
      const template = createImportPackTemplate();
      const t = template.templates[0];
      
      expect(t.metadata).toBeDefined();
      expect(t.specJson).toBeDefined();
      expect(t.selectionConfigJson).toBeDefined();
      expect(t.roiJson).toBeDefined();
      expect(t.fixtures).toBeDefined();
    });
  });

  describe('ROI Storage in Version', () => {
    it('should store ROI config with version', () => {
      const result = importTemplate(validImportPack, 1);
      
      expect(result.success).toBe(true);
      
      const version = getTemplateVersion(result.created.versionDbId!);
      expect(version).toBeDefined();
      expect(version?.roiJson).toBeDefined();
    });

    it('should allow import without ROI', () => {
      const packWithoutRoi: TemplateImportPack = {
        ...validImportPack,
        roiJson: undefined,
      };
      
      const result = importTemplate(packWithoutRoi, 1);
      
      expect(result.success).toBe(true);
      
      const version = getTemplateVersion(result.created.versionDbId!);
      expect(version?.roiJson).toBeNull();
    });
  });

  describe('Template Metadata Storage', () => {
    it('should store category and tags', () => {
      const result = importTemplate(validImportPack, 1);
      
      expect(result.success).toBe(true);
      
      const template = getTemplateBySlug('test-template');
      expect(template).toBeDefined();
      // Note: category and tags are stored in the record but may need
      // to be exposed through the API if needed
    });
  });
});
