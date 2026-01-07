/**
 * Template Registry Service Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import {
  TemplateRegistry,
  getTemplateRegistry,
  resetTemplateRegistry,
  validateTemplate,
  validateSpecPack,
  type Template,
  type SpecPack,
} from '../templateRegistry';

const SPECS_DIR = path.join(__dirname, '..', '..', 'specs');

describe('Template Registry Service', () => {
  let registry: TemplateRegistry;

  beforeEach(() => {
    resetTemplateRegistry();
    registry = new TemplateRegistry(SPECS_DIR);
  });

  afterEach(() => {
    resetTemplateRegistry();
  });

  describe('Schema Validation', () => {
    it('validates a well-formed template', () => {
      const template: Template = {
        templateId: 'TEST_TEMPLATE_V1',
        displayName: 'Test Template',
        version: '1.0.0',
        client: 'TEST',
        documentType: 'test',
        description: 'A test template',
        fieldRules: {
          testField: { required: true },
        },
        validationRules: [
          { ruleId: 'TEST_RULE', description: 'A test rule' },
        ],
      };

      const errors = validateTemplate(template);
      expect(errors).toEqual([]);
    });

    it('rejects template with missing required fields', () => {
      const template = {
        templateId: 'TEST_TEMPLATE_V1',
        displayName: 'Test Template',
        // missing version, client, documentType, fieldRules, validationRules
      };

      const errors = validateTemplate(template);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.includes('version'))).toBe(true);
    });

    it('rejects template with invalid templateId format', () => {
      const template = {
        templateId: 'invalid-template-id',
        displayName: 'Test Template',
        version: '1.0.0',
        client: 'TEST',
        documentType: 'test',
        description: 'A test template',
        fieldRules: {},
        validationRules: [],
      };

      const errors = validateTemplate(template);
      expect(errors.some(e => e.includes('Invalid templateId format'))).toBe(true);
    });

    it('rejects template with invalid version format', () => {
      const template = {
        templateId: 'TEST_TEMPLATE_V1',
        displayName: 'Test Template',
        version: 'v1',
        client: 'TEST',
        documentType: 'test',
        description: 'A test template',
        fieldRules: {},
        validationRules: [],
      };

      const errors = validateTemplate(template);
      expect(errors.some(e => e.includes('Invalid version format'))).toBe(true);
    });

    it('validates a well-formed spec pack', () => {
      const pack: SpecPack = {
        packVersion: '1.0.0',
        packId: 'TEST_PACK',
        displayName: 'Test Pack',
        client: 'TEST',
        createdAt: '2026-01-07',
        defaults: {
          dateFormat: 'DD/MM/YYYY',
          timezone: 'Europe/London',
          reviewQueueTriggers: ['LOW_CONFIDENCE'],
          criticalFields: ['testField'],
        },
        templates: [
          {
            templateId: 'TEST_TEMPLATE_V1',
            displayName: 'Test Template',
            version: '1.0.0',
            client: 'TEST',
            documentType: 'test',
            description: 'A test template',
            fieldRules: {
              testField: { required: true },
            },
            validationRules: [
              { ruleId: 'TEST_RULE', description: 'A test rule' },
            ],
          },
        ],
      };

      const errors = validateSpecPack(pack);
      expect(errors).toEqual([]);
    });

    it('rejects spec pack with missing required fields', () => {
      const pack = {
        packVersion: '1.0.0',
        packId: 'TEST_PACK',
        // missing displayName, client, defaults, templates
      };

      const errors = validateSpecPack(pack);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('Pack Loading', () => {
    it('loads all packs from specs directory', async () => {
      const result = await registry.loadAllPacks();
      
      expect(result.loaded).toBeGreaterThan(0);
      expect(result.errors).toEqual([]);
    });

    it('registers templates from loaded packs', async () => {
      await registry.loadAllPacks();
      
      const templateIds = registry.getTemplateIds();
      expect(templateIds.length).toBeGreaterThan(0);
      expect(templateIds).toContain('PE_LOLER_EXAM_V1');
    });

    it('provides registry statistics', async () => {
      await registry.loadAllPacks();
      
      const stats = registry.getStats();
      expect(stats.totalPacks).toBeGreaterThan(0);
      expect(stats.totalTemplates).toBeGreaterThan(0);
      expect(stats.activeTemplates).toBeGreaterThan(0);
    });
  });

  describe('Template Lookup', () => {
    beforeEach(async () => {
      await registry.loadAllPacks();
    });

    it('retrieves template by ID', () => {
      const template = registry.getTemplate('PE_LOLER_EXAM_V1');
      
      expect(template).not.toBeNull();
      expect(template?.templateId).toBe('PE_LOLER_EXAM_V1');
      expect(template?.displayName).toBe('LOLER Thorough Examination Report v1');
    });

    it('returns null for non-existent template', () => {
      const template = registry.getTemplate('NON_EXISTENT_V1');
      expect(template).toBeNull();
    });

    it('retrieves templates by client', () => {
      const templates = registry.getTemplatesByClient('PLANTEXPAND');
      
      expect(templates.length).toBeGreaterThan(0);
      expect(templates.every(t => t.client === 'PLANTEXPAND')).toBe(true);
    });

    it('retrieves all active templates', () => {
      const templates = registry.getActiveTemplates();
      
      expect(templates.length).toBeGreaterThan(0);
    });

    it('retrieves template registration with metadata', () => {
      const registration = registry.getRegistration('PE_LOLER_EXAM_V1');
      
      expect(registration).not.toBeNull();
      expect(registration?.status).toBe('active');
      expect(registration?.packId).toBe('PLANTEXPAND_SPEC_PACK');
      expect(registration?.hash).toBeDefined();
    });
  });

  describe('Activation Gate', () => {
    beforeEach(async () => {
      await registry.loadAllPacks();
    });

    it('deactivates a template', () => {
      const result = registry.deactivateTemplate('PE_LOLER_EXAM_V1');
      expect(result).toBe(true);
      
      const template = registry.getTemplate('PE_LOLER_EXAM_V1');
      expect(template).toBeNull(); // Inactive templates are not returned
      
      const registration = registry.getRegistration('PE_LOLER_EXAM_V1');
      expect(registration?.status).toBe('inactive');
    });

    it('activates a deactivated template', () => {
      registry.deactivateTemplate('PE_LOLER_EXAM_V1');
      
      const result = registry.activateTemplate('PE_LOLER_EXAM_V1');
      expect(result.success).toBe(true);
      expect(result.errors).toEqual([]);
      
      const template = registry.getTemplate('PE_LOLER_EXAM_V1');
      expect(template).not.toBeNull();
    });

    it('deprecates a template', () => {
      const result = registry.deprecateTemplate('PE_LOLER_EXAM_V1');
      expect(result).toBe(true);
      
      const registration = registry.getRegistration('PE_LOLER_EXAM_V1');
      expect(registration?.status).toBe('deprecated');
    });

    it('returns false when deactivating non-existent template', () => {
      const result = registry.deactivateTemplate('NON_EXISTENT_V1');
      expect(result).toBe(false);
    });
  });

  describe('Change Detection', () => {
    beforeEach(async () => {
      await registry.loadAllPacks();
    });

    it('detects when template has not changed', () => {
      const template = registry.getTemplate('PE_LOLER_EXAM_V1');
      expect(template).not.toBeNull();
      
      const hasChanged = registry.hasTemplateChanged('PE_LOLER_EXAM_V1', template!);
      expect(hasChanged).toBe(false);
    });

    it('detects when template has changed', () => {
      const template = registry.getTemplate('PE_LOLER_EXAM_V1');
      expect(template).not.toBeNull();
      
      const modifiedTemplate = { ...template!, version: '2.0.0' };
      const hasChanged = registry.hasTemplateChanged('PE_LOLER_EXAM_V1', modifiedTemplate);
      expect(hasChanged).toBe(true);
    });
  });

  describe('Singleton Instance', () => {
    it('returns the same instance', () => {
      const instance1 = getTemplateRegistry();
      const instance2 = getTemplateRegistry();
      
      expect(instance1).toBe(instance2);
    });

    it('resets the singleton instance', () => {
      const instance1 = getTemplateRegistry();
      resetTemplateRegistry();
      const instance2 = getTemplateRegistry();
      
      expect(instance1).not.toBe(instance2);
    });
  });

  describe('Pack Retrieval', () => {
    beforeEach(async () => {
      await registry.loadAllPacks();
    });

    it('retrieves spec pack by ID', () => {
      const pack = registry.getPack('PLANTEXPAND_SPEC_PACK');
      
      expect(pack).not.toBeNull();
      expect(pack?.packId).toBe('PLANTEXPAND_SPEC_PACK');
      expect(pack?.templates.length).toBeGreaterThan(0);
    });

    it('returns null for non-existent pack', () => {
      const pack = registry.getPack('NON_EXISTENT_PACK');
      expect(pack).toBeNull();
    });

    it('pack contains audit perspective', () => {
      const pack = registry.getPack('PLANTEXPAND_SPEC_PACK');
      
      expect(pack?.auditPerspective).toBeDefined();
      expect(pack?.auditPerspective?.description?.toLowerCase()).toContain('documentation');
    });
  });

  describe('Clear Registry', () => {
    it('clears all registrations', async () => {
      await registry.loadAllPacks();
      expect(registry.getTemplateIds().length).toBeGreaterThan(0);
      
      registry.clear();
      
      expect(registry.getTemplateIds().length).toBe(0);
      expect(registry.getStats().totalPacks).toBe(0);
    });
  });
});
