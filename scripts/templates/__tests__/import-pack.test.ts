/**
 * Import Pack Script Tests
 */

import { describe, it, expect } from 'vitest';
import {
  validatePackSchema,
  validateTemplate,
  checkCriticalFields,
  generateVersionHash,
  CRITICAL_FIELDS,
} from '../import-pack';

describe('Import Pack Script', () => {
  describe('validatePackSchema', () => {
    it('validates correct pack schema', () => {
      const pack = {
        packId: 'plantexpand-spec-pack',
        packVersion: '1.0.0',
        client: 'Plantexpand',
        templates: [],
      };

      const result = validatePackSchema(pack);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects missing packId', () => {
      const pack = {
        packVersion: '1.0.0',
        client: 'Plantexpand',
        templates: [],
      };

      const result = validatePackSchema(pack);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('packId is required and must be a string');
    });

    it('rejects missing templates array', () => {
      const pack = {
        packId: 'test',
        packVersion: '1.0.0',
        client: 'Test',
      };

      const result = validatePackSchema(pack);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('templates must be an array');
    });

    it('rejects non-object input', () => {
      const result = validatePackSchema(null);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Pack must be an object');
    });
  });

  describe('validateTemplate', () => {
    const validTemplate = {
      templateId: 'PE_LOLER_EXAM_V1',
      displayName: 'LOLER Thorough Examination Report',
      version: '1.0.0',
      documentType: 'compliance',
      client: 'Plantexpand',
      fieldRules: [
        { field: 'jobReference', label: 'Job Reference', required: true, type: 'string' },
      ],
      validationRules: [
        { ruleId: 'JOB_REF_REQUIRED', field: 'jobReference', type: 'required' },
      ],
    };

    it('validates correct template', () => {
      const result = validateTemplate(validTemplate);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects missing templateId', () => {
      const template = { ...validTemplate, templateId: undefined };
      const result = validateTemplate(template);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('templateId'))).toBe(true);
    });

    it('rejects missing displayName', () => {
      const template = { ...validTemplate, displayName: undefined };
      const result = validateTemplate(template);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('displayName'))).toBe(true);
    });

    it('rejects missing version', () => {
      const template = { ...validTemplate, version: undefined };
      const result = validateTemplate(template);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('version'))).toBe(true);
    });

    it('rejects duplicate field names', () => {
      const template = {
        ...validTemplate,
        fieldRules: [
          { field: 'jobReference', label: 'Job Reference', required: true, type: 'string' },
          { field: 'jobReference', label: 'Job Ref Duplicate', required: true, type: 'string' },
        ],
      };
      const result = validateTemplate(template);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Duplicate field'))).toBe(true);
    });

    it('rejects duplicate ruleIds', () => {
      const template = {
        ...validTemplate,
        validationRules: [
          { ruleId: 'RULE_1', field: 'jobReference', type: 'required' },
          { ruleId: 'RULE_1', field: 'assetId', type: 'required' },
        ],
      };
      const result = validateTemplate(template);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Duplicate ruleId'))).toBe(true);
    });
  });

  describe('checkCriticalFields', () => {
    it('identifies configured critical fields', () => {
      const template = {
        templateId: 'TEST',
        displayName: 'Test',
        version: '1.0.0',
        documentType: 'test',
        client: 'Test',
        fieldRules: [
          { field: 'jobReference', label: 'Job Reference', required: true, type: 'string' },
          { field: 'assetId', label: 'Asset ID', required: true, type: 'string' },
          { field: 'completionDate', label: 'Completion Date', required: true, type: 'date' },
        ],
        validationRules: [],
      };

      const result = checkCriticalFields(template);
      expect(result.configured).toContain('jobReference');
      expect(result.configured).toContain('assetId');
      expect(result.configured).toContain('completionDate');
    });

    it('identifies missing critical fields', () => {
      const template = {
        templateId: 'TEST',
        displayName: 'Test',
        version: '1.0.0',
        documentType: 'test',
        client: 'Test',
        fieldRules: [
          { field: 'jobReference', label: 'Job Reference', required: true, type: 'string' },
        ],
        validationRules: [],
      };

      const result = checkCriticalFields(template);
      expect(result.configured).toContain('jobReference');
      expect(result.missing.length).toBeGreaterThan(0);
    });

    it('handles case-insensitive matching', () => {
      const template = {
        templateId: 'TEST',
        displayName: 'Test',
        version: '1.0.0',
        documentType: 'test',
        client: 'Test',
        fieldRules: [
          { field: 'JobReference', label: 'Job Reference', required: true, type: 'string' },
          { field: 'ASSET_ID', label: 'Asset ID', required: true, type: 'string' },
        ],
        validationRules: [],
      };

      const result = checkCriticalFields(template);
      expect(result.configured).toContain('jobReference');
      expect(result.configured).toContain('assetId');
    });
  });

  describe('generateVersionHash', () => {
    it('generates consistent hash for same template', () => {
      const template = {
        templateId: 'TEST',
        displayName: 'Test',
        version: '1.0.0',
        documentType: 'test',
        client: 'Test',
        fieldRules: [{ field: 'test', label: 'Test', required: true, type: 'string' }],
        validationRules: [{ ruleId: 'TEST', field: 'test', type: 'required' }],
      };

      const hash1 = generateVersionHash(template);
      const hash2 = generateVersionHash(template);
      expect(hash1).toBe(hash2);
    });

    it('generates different hash for different templates', () => {
      const template1 = {
        templateId: 'TEST_1',
        displayName: 'Test 1',
        version: '1.0.0',
        documentType: 'test',
        client: 'Test',
        fieldRules: [{ field: 'test', label: 'Test', required: true, type: 'string' }],
        validationRules: [],
      };

      const template2 = {
        templateId: 'TEST_2',
        displayName: 'Test 2',
        version: '1.0.0',
        documentType: 'test',
        client: 'Test',
        fieldRules: [{ field: 'test', label: 'Test', required: true, type: 'string' }],
        validationRules: [],
      };

      const hash1 = generateVersionHash(template1);
      const hash2 = generateVersionHash(template2);
      expect(hash1).not.toBe(hash2);
    });

    it('generates 12-character hex hash', () => {
      const template = {
        templateId: 'TEST',
        displayName: 'Test',
        version: '1.0.0',
        documentType: 'test',
        client: 'Test',
        fieldRules: [],
        validationRules: [],
      };

      const hash = generateVersionHash(template);
      expect(hash).toMatch(/^[0-9a-f]{12}$/);
    });
  });

  describe('CRITICAL_FIELDS constant', () => {
    it('includes all required critical fields', () => {
      expect(CRITICAL_FIELDS).toContain('jobReference');
      expect(CRITICAL_FIELDS).toContain('assetId');
      expect(CRITICAL_FIELDS).toContain('completionDate');
      expect(CRITICAL_FIELDS).toContain('expiryDate');
      expect(CRITICAL_FIELDS).toContain('engineerSignature');
      expect(CRITICAL_FIELDS).toContain('checklistStatus');
    });

    it('has exactly 6 critical fields', () => {
      expect(CRITICAL_FIELDS.length).toBe(6);
    });
  });
});
