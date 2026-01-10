/**
 * Template Registry Contract Tests
 * 
 * PR-A: Validates template registry foundation.
 * - Deterministic hash computation
 * - Template CRUD operations
 * - Version management
 * - No-secrets CI compatible (in-memory store)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createTemplate,
  uploadTemplateVersion,
  listTemplates,
  listVersions,
  getTemplateVersion,
  getTemplate,
  getTemplateBySlug,
  activateVersion,
  getActiveVersion,
  getActiveTemplates,
  resetRegistry,
  getRegistryStats,
  computeVersionHash,
  type SpecJson,
  type SelectionConfig,
} from '../../services/templateRegistry';

// Test fixtures
const testSpecJson: SpecJson = {
  name: 'Test Spec',
  version: '1.0.0',
  fields: [
    {
      field: 'customer_name',
      label: 'Customer Name',
      type: 'string',
      required: true,
    },
    {
      field: 'job_number',
      label: 'Job Number',
      type: 'string',
      required: true,
      extractionHints: ['Job No', 'Job #', 'Work Order'],
    },
  ],
  rules: [
    {
      ruleId: 'R001',
      field: 'customer_name',
      description: 'Customer name must be present',
      severity: 'critical',
      type: 'required',
      enabled: true,
    },
    {
      ruleId: 'R002',
      field: 'job_number',
      description: 'Job number must match pattern',
      severity: 'major',
      type: 'pattern',
      pattern: '^JOB-\\d{6}$',
      enabled: true,
    },
  ],
};

const testSelectionConfig: SelectionConfig = {
  requiredTokensAll: ['job', 'sheet'],
  requiredTokensAny: ['repair', 'maintenance', 'service'],
  optionalTokens: ['customer', 'signature', 'date'],
};

describe('Template Registry - PR-A Contract Tests', () => {
  beforeEach(() => {
    resetRegistry();
  });

  describe('Hash Computation', () => {
    it('should compute deterministic SHA-256 hash', () => {
      const hash1 = computeVersionHash(testSpecJson, testSelectionConfig);
      const hash2 = computeVersionHash(testSpecJson, testSelectionConfig);
      
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 hex length
      expect(hash1).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should produce different hash for different content', () => {
      const hash1 = computeVersionHash(testSpecJson, testSelectionConfig);
      
      // Modify something that affects the hash
      const modifiedSpec: SpecJson = {
        ...testSpecJson,
        name: 'Modified Spec Name',
        rules: [
          ...testSpecJson.rules,
          {
            ruleId: 'R999',
            field: 'new_field',
            description: 'New rule',
            severity: 'minor',
            type: 'required',
            enabled: true,
          },
        ],
      };
      const hash2 = computeVersionHash(modifiedSpec, testSelectionConfig);
      
      expect(hash1).not.toBe(hash2);
    });

    it('should be stable regardless of object key order', () => {
      const spec1: SpecJson = {
        name: 'Test',
        version: '1.0.0',
        fields: [],
        rules: [],
      };
      
      // Same content, different key order
      const spec2 = {
        version: '1.0.0',
        rules: [],
        name: 'Test',
        fields: [],
      } as SpecJson;
      
      const hash1 = computeVersionHash(spec1, testSelectionConfig);
      const hash2 = computeVersionHash(spec2, testSelectionConfig);
      
      expect(hash1).toBe(hash2);
    });
  });

  describe('Template CRUD', () => {
    it('should create a template', () => {
      const template = createTemplate({
        templateId: 'job-sheet-standard',
        name: 'Standard Job Sheet',
        client: 'ACME Corp',
        assetType: 'vehicle',
        workType: 'repair',
        description: 'Standard job sheet template',
        createdBy: 1,
      });
      
      expect(template.id).toBe(1);
      expect(template.templateId).toBe('job-sheet-standard');
      expect(template.status).toBe('draft');
      expect(template.client).toBe('ACME Corp');
    });

    it('should list templates in deterministic order', () => {
      createTemplate({ templateId: 'template-c', name: 'C', createdBy: 1 });
      createTemplate({ templateId: 'template-a', name: 'A', createdBy: 1 });
      createTemplate({ templateId: 'template-b', name: 'B', createdBy: 1 });
      
      const templates = listTemplates();
      
      expect(templates).toHaveLength(3);
      expect(templates[0].templateId).toBe('template-a');
      expect(templates[1].templateId).toBe('template-b');
      expect(templates[2].templateId).toBe('template-c');
    });

    it('should get template by ID', () => {
      const created = createTemplate({
        templateId: 'test-template',
        name: 'Test',
        createdBy: 1,
      });
      
      const template = getTemplate(created.id);
      
      expect(template).not.toBeNull();
      expect(template?.templateId).toBe('test-template');
    });

    it('should get template by slug', () => {
      createTemplate({
        templateId: 'my-unique-slug',
        name: 'Test',
        createdBy: 1,
      });
      
      const template = getTemplateBySlug('my-unique-slug');
      
      expect(template).not.toBeNull();
      expect(template?.name).toBe('Test');
    });

    it('should return null for non-existent template', () => {
      expect(getTemplate(999)).toBeNull();
      expect(getTemplateBySlug('non-existent')).toBeNull();
    });
  });

  describe('Version Management', () => {
    it('should upload a template version', () => {
      const template = createTemplate({
        templateId: 'test-template',
        name: 'Test',
        createdBy: 1,
      });
      
      const version = uploadTemplateVersion({
        templateId: template.id,
        version: '1.0.0',
        specJson: testSpecJson,
        selectionConfigJson: testSelectionConfig,
        changeNotes: 'Initial version',
        createdBy: 1,
      });
      
      expect(version.id).toBe(1);
      expect(version.version).toBe('1.0.0');
      expect(version.hashSha256).toHaveLength(64);
      expect(version.isActive).toBe(false);
    });

    it('should reject duplicate content', () => {
      const template = createTemplate({
        templateId: 'test-template',
        name: 'Test',
        createdBy: 1,
      });
      
      uploadTemplateVersion({
        templateId: template.id,
        version: '1.0.0',
        specJson: testSpecJson,
        selectionConfigJson: testSelectionConfig,
        createdBy: 1,
      });
      
      // Same content, different version number
      expect(() => {
        uploadTemplateVersion({
          templateId: template.id,
          version: '1.0.1',
          specJson: testSpecJson,
          selectionConfigJson: testSelectionConfig,
          createdBy: 1,
        });
      }).toThrow(/identical content/);
    });

    it('should list versions for a template', () => {
      const template = createTemplate({
        templateId: 'test-template',
        name: 'Test',
        createdBy: 1,
      });
      
      // Make specs actually different (not just version field)
      const spec1: SpecJson = { ...testSpecJson, name: 'Spec Version 1' };
      const spec2: SpecJson = { ...testSpecJson, name: 'Spec Version 2' };
      
      uploadTemplateVersion({
        templateId: template.id,
        version: '1.0.0',
        specJson: spec1,
        selectionConfigJson: testSelectionConfig,
        createdBy: 1,
      });
      
      uploadTemplateVersion({
        templateId: template.id,
        version: '1.1.0',
        specJson: spec2,
        selectionConfigJson: testSelectionConfig,
        createdBy: 1,
      });
      
      const versions = listVersions(template.id);
      
      expect(versions).toHaveLength(2);
    });

    it('should get version by ID', () => {
      const template = createTemplate({
        templateId: 'test-template',
        name: 'Test',
        createdBy: 1,
      });
      
      const created = uploadTemplateVersion({
        templateId: template.id,
        version: '1.0.0',
        specJson: testSpecJson,
        selectionConfigJson: testSelectionConfig,
        createdBy: 1,
      });
      
      const version = getTemplateVersion(created.id);
      
      expect(version).not.toBeNull();
      expect(version?.specJson).toEqual(testSpecJson);
    });
  });

  describe('Version Activation', () => {
    it('should activate a version', () => {
      const template = createTemplate({
        templateId: 'test-template',
        name: 'Test',
        createdBy: 1,
      });
      
      const version = uploadTemplateVersion({
        templateId: template.id,
        version: '1.0.0',
        specJson: testSpecJson,
        selectionConfigJson: testSelectionConfig,
        createdBy: 1,
      });
      
      expect(version.isActive).toBe(false);
      
      // Skip preconditions for basic activation test (PR-D tests cover preconditions)
      const activated = activateVersion(version.id, true);
      
      expect(activated.isActive).toBe(true);
    });

    it('should deactivate other versions when activating', () => {
      const template = createTemplate({
        templateId: 'test-template',
        name: 'Test',
        createdBy: 1,
      });
      
      // Make specs actually different
      const spec1: SpecJson = { ...testSpecJson, name: 'Spec V1' };
      const spec2: SpecJson = { ...testSpecJson, name: 'Spec V2' };
      
      const v1 = uploadTemplateVersion({
        templateId: template.id,
        version: '1.0.0',
        specJson: spec1,
        selectionConfigJson: testSelectionConfig,
        createdBy: 1,
      });
      
      const v2 = uploadTemplateVersion({
        templateId: template.id,
        version: '1.1.0',
        specJson: spec2,
        selectionConfigJson: testSelectionConfig,
        createdBy: 1,
      });
      
      activateVersion(v1.id, true);
      expect(getTemplateVersion(v1.id)?.isActive).toBe(true);
      
      activateVersion(v2.id, true);
      expect(getTemplateVersion(v1.id)?.isActive).toBe(false);
      expect(getTemplateVersion(v2.id)?.isActive).toBe(true);
    });

    it('should get active version for template', () => {
      const template = createTemplate({
        templateId: 'test-template',
        name: 'Test',
        createdBy: 1,
      });
      
      const version = uploadTemplateVersion({
        templateId: template.id,
        version: '1.0.0',
        specJson: testSpecJson,
        selectionConfigJson: testSelectionConfig,
        createdBy: 1,
      });
      
      expect(getActiveVersion(template.id)).toBeNull();
      
      activateVersion(version.id, true);
      
      const active = getActiveVersion(template.id);
      expect(active).not.toBeNull();
      expect(active?.version).toBe('1.0.0');
    });

    it('should activate template when version is activated', () => {
      const template = createTemplate({
        templateId: 'test-template',
        name: 'Test',
        createdBy: 1,
      });
      
      expect(template.status).toBe('draft');
      
      const version = uploadTemplateVersion({
        templateId: template.id,
        version: '1.0.0',
        specJson: testSpecJson,
        selectionConfigJson: testSelectionConfig,
        createdBy: 1,
      });
      
      activateVersion(version.id, true);
      
      const updated = getTemplate(template.id);
      expect(updated?.status).toBe('active');
    });
  });

  describe('Active Templates', () => {
    it('should list only active templates with active versions', () => {
      const t1 = createTemplate({
        templateId: 'template-1',
        name: 'Template 1',
        createdBy: 1,
      });
      
      const t2 = createTemplate({
        templateId: 'template-2',
        name: 'Template 2',
        createdBy: 1,
      });
      
      const v1 = uploadTemplateVersion({
        templateId: t1.id,
        version: '1.0.0',
        specJson: testSpecJson,
        selectionConfigJson: testSelectionConfig,
        createdBy: 1,
      });
      
      // Only activate t1's version
      activateVersion(v1.id, true);
      
      const active = getActiveTemplates();
      
      expect(active).toHaveLength(1);
      expect(active[0].templateId).toBe('template-1');
    });
  });

  describe('Registry Stats', () => {
    it('should track template and version counts', () => {
      expect(getRegistryStats()).toEqual({ templates: 0, versions: 0 });
      
      const template = createTemplate({
        templateId: 'test',
        name: 'Test',
        createdBy: 1,
      });
      
      expect(getRegistryStats()).toEqual({ templates: 1, versions: 0 });
      
      uploadTemplateVersion({
        templateId: template.id,
        version: '1.0.0',
        specJson: testSpecJson,
        selectionConfigJson: testSelectionConfig,
        createdBy: 1,
      });
      
      expect(getRegistryStats()).toEqual({ templates: 1, versions: 1 });
    });

    it('should reset registry for testing', () => {
      createTemplate({ templateId: 'test', name: 'Test', createdBy: 1 });
      
      expect(getRegistryStats().templates).toBe(1);
      
      resetRegistry();
      
      expect(getRegistryStats()).toEqual({ templates: 0, versions: 0 });
    });
  });

  describe('Template List Includes Version Info', () => {
    it('should include version count in template list', () => {
      const template = createTemplate({
        templateId: 'test-template',
        name: 'Test',
        createdBy: 1,
      });
      
      // Make specs actually different
      const spec1: SpecJson = { ...testSpecJson, name: 'Spec Version 1' };
      const spec2: SpecJson = { ...testSpecJson, name: 'Spec Version 2' };
      
      uploadTemplateVersion({
        templateId: template.id,
        version: '1.0.0',
        specJson: spec1,
        selectionConfigJson: testSelectionConfig,
        createdBy: 1,
      });
      
      uploadTemplateVersion({
        templateId: template.id,
        version: '1.1.0',
        specJson: spec2,
        selectionConfigJson: testSelectionConfig,
        createdBy: 1,
      });
      
      const templates = listTemplates();
      
      expect(templates[0].versionCount).toBe(2);
    });

    it('should include active version info in template list', () => {
      const template = createTemplate({
        templateId: 'test-template',
        name: 'Test',
        createdBy: 1,
      });
      
      const version = uploadTemplateVersion({
        templateId: template.id,
        version: '1.0.0',
        specJson: testSpecJson,
        selectionConfigJson: testSelectionConfig,
        createdBy: 1,
      });
      
      let templates = listTemplates();
      expect(templates[0].activeVersionId).toBeNull();
      expect(templates[0].activeVersion).toBeNull();
      
      activateVersion(version.id, true);
      
      templates = listTemplates();
      expect(templates[0].activeVersionId).toBe(version.id);
      expect(templates[0].activeVersion).toBe('1.0.0');
    });
  });
});
