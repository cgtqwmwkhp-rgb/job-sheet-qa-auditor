/**
 * Governance Rules Engine Tests
 */

import { describe, it, expect } from 'vitest';
import {
  validateTemplate,
  runCIGate,
  getEnabledRules,
  getRulesByCategory,
  getRulesBySeverity,
  GOVERNANCE_RULES,
  type TemplateSpec,
} from '../governanceRules';

// ============================================================================
// Test Fixtures
// ============================================================================

const validTemplate: TemplateSpec = {
  templateId: 'PE_LOLER_EXAM_V1',
  version: '1.0.0',
  displayName: 'LOLER Thorough Examination Report',
  client: 'Plantexpand',
  documentType: 'LOLER Examination',
  fieldRules: [
    { field: 'jobReference', label: 'Job Reference', required: true, type: 'string' },
    { field: 'assetId', label: 'Asset ID', required: true, type: 'string' },
    { field: 'examDate', label: 'Examination Date', required: true, type: 'date' },
    { field: 'expiryDate', label: 'Expiry Date', required: true, type: 'date' },
    { field: 'engineerName', label: 'Engineer Name', required: true, type: 'string' },
    { field: 'engineerSignature', label: 'Engineer Signature', required: true, type: 'signature' },
  ],
  validationRules: [
    { ruleId: 'RULE_001', field: 'jobReference', type: 'required' },
    { ruleId: 'RULE_002', field: 'assetId', type: 'required' },
    { ruleId: 'RULE_003', field: 'examDate', type: 'date_format' },
    { ruleId: 'RULE_004', field: 'expiryDate', type: 'date_format' },
    { ruleId: 'RULE_005', field: 'engineerName', type: 'required' },
    { ruleId: 'RULE_006', field: 'engineerSignature', type: 'required' },
  ],
  selection: {
    method: 'fingerprint',
    requiredTokensAll: ['LOLER', 'Examination'],
  },
};

const invalidTemplate: TemplateSpec = {
  templateId: 'invalid-template', // Wrong format
  version: '1.0', // Wrong format
  displayName: '',
  client: '',
  documentType: '',
  fieldRules: [
    { field: 'job_reference', label: 'Job Reference', required: false, type: 'string' }, // Wrong naming
    { field: 'job_reference', label: 'Duplicate', required: false, type: 'string' }, // Duplicate
  ],
  validationRules: [
    { ruleId: 'rule1', field: 'job_reference', type: 'required', reasonCode: 'INVALID_CODE' }, // Wrong naming, invalid code
    { ruleId: 'rule1', field: 'other', type: 'required' }, // Duplicate
  ],
};

// ============================================================================
// Tests
// ============================================================================

describe('Governance Rules Engine', () => {
  describe('validateTemplate', () => {
    it('passes valid template', () => {
      const report = validateTemplate(validTemplate);
      
      expect(report.passed).toBe(true);
      expect(report.blockingViolations.length).toBe(0);
      expect(report.templateId).toBe('PE_LOLER_EXAM_V1');
      expect(report.templateVersion).toBe('1.0.0');
    });

    it('fails invalid template with blocking violations', () => {
      const report = validateTemplate(invalidTemplate);
      
      expect(report.passed).toBe(false);
      expect(report.blockingViolations.length).toBeGreaterThan(0);
    });

    it('detects template ID format violation', () => {
      const report = validateTemplate(invalidTemplate);
      
      const violation = report.blockingViolations.find(v => v.ruleId === 'GOV-001');
      expect(violation).toBeDefined();
      expect(violation?.message).toContain('invalid-template');
    });

    it('detects version format violation', () => {
      const report = validateTemplate(invalidTemplate);
      
      const violation = report.blockingViolations.find(v => v.ruleId === 'GOV-002');
      expect(violation).toBeDefined();
      expect(violation?.message).toContain('1.0');
    });

    it('detects missing metadata', () => {
      const report = validateTemplate(invalidTemplate);
      
      const violations = report.blockingViolations.filter(v => v.ruleId === 'GOV-003');
      expect(violations.length).toBeGreaterThan(0);
    });

    it('detects minimum field count violation', () => {
      const report = validateTemplate(invalidTemplate);
      
      const violation = report.blockingViolations.find(v => v.ruleId === 'GOV-004');
      expect(violation).toBeDefined();
    });

    it('detects minimum validation rules violation', () => {
      const report = validateTemplate(invalidTemplate);
      
      const violation = report.blockingViolations.find(v => v.ruleId === 'GOV-005');
      expect(violation).toBeDefined();
    });

    it('detects field naming convention violation', () => {
      const report = validateTemplate(invalidTemplate);
      
      const violation = report.warnings.find(v => v.ruleId === 'GOV-010');
      expect(violation).toBeDefined();
      expect(violation?.message).toContain('job_reference');
    });

    it('detects duplicate fields', () => {
      const report = validateTemplate(invalidTemplate);
      
      const violation = report.blockingViolations.find(v => v.ruleId === 'GOV-042');
      expect(violation).toBeDefined();
      expect(violation?.message).toContain('job_reference');
    });

    it('detects duplicate rule IDs', () => {
      const report = validateTemplate(invalidTemplate);
      
      const violation = report.blockingViolations.find(v => v.ruleId === 'GOV-043');
      expect(violation).toBeDefined();
      expect(violation?.message).toContain('rule1');
    });

    it('detects non-canonical reason codes', () => {
      const report = validateTemplate(invalidTemplate);
      
      const violation = report.blockingViolations.find(v => v.ruleId === 'GOV-031');
      expect(violation).toBeDefined();
      expect(violation?.message).toContain('INVALID_CODE');
    });

    it('includes summary statistics', () => {
      const report = validateTemplate(validTemplate);
      
      expect(report.summary.totalRules).toBeGreaterThan(0);
      expect(report.summary.passedRules).toBeGreaterThan(0);
      expect(typeof report.summary.failedRules).toBe('number');
    });
  });

  describe('runCIGate', () => {
    it('passes when all templates are valid', () => {
      const result = runCIGate([validTemplate]);
      
      expect(result.passed).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.summary).toContain('✅');
    });

    it('fails when any template is invalid', () => {
      const result = runCIGate([validTemplate, invalidTemplate]);
      
      expect(result.passed).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(result.summary).toContain('❌');
    });

    it('returns reports for all templates', () => {
      const result = runCIGate([validTemplate, invalidTemplate]);
      
      expect(result.reports.length).toBe(2);
    });

    it('handles empty template list', () => {
      const result = runCIGate([]);
      
      expect(result.passed).toBe(true);
      expect(result.reports.length).toBe(0);
    });
  });

  describe('Rule Management', () => {
    it('getEnabledRules returns only enabled rules', () => {
      const rules = getEnabledRules();
      
      expect(rules.every(r => r.enabled)).toBe(true);
    });

    it('getRulesByCategory filters correctly', () => {
      const schemaRules = getRulesByCategory('schema');
      
      expect(schemaRules.every(r => r.category === 'schema')).toBe(true);
    });

    it('getRulesBySeverity filters correctly', () => {
      const blockingRules = getRulesBySeverity('blocking');
      
      expect(blockingRules.every(r => r.severity === 'blocking')).toBe(true);
    });
  });

  describe('GOVERNANCE_RULES', () => {
    it('has unique rule IDs', () => {
      const ids = GOVERNANCE_RULES.map(r => r.ruleId);
      const uniqueIds = new Set(ids);
      
      expect(ids.length).toBe(uniqueIds.size);
    });

    it('all rules have required properties', () => {
      for (const rule of GOVERNANCE_RULES) {
        expect(rule.ruleId).toBeDefined();
        expect(rule.name).toBeDefined();
        expect(rule.description).toBeDefined();
        expect(rule.severity).toBeDefined();
        expect(rule.category).toBeDefined();
        expect(typeof rule.enabled).toBe('boolean');
      }
    });

    it('has at least one blocking rule', () => {
      const blockingRules = GOVERNANCE_RULES.filter(r => r.severity === 'blocking');
      
      expect(blockingRules.length).toBeGreaterThan(0);
    });

    it('covers all categories', () => {
      const categories = new Set(GOVERNANCE_RULES.map(r => r.category));
      
      expect(categories.has('schema')).toBe(true);
      expect(categories.has('naming')).toBe(true);
      expect(categories.has('coverage')).toBe(true);
      expect(categories.has('security')).toBe(true);
      expect(categories.has('quality')).toBe(true);
    });
  });

  describe('Specific Rule Validations', () => {
    it('GOV-020: detects low required field ratio', () => {
      const template: TemplateSpec = {
        ...validTemplate,
        fieldRules: [
          { field: 'field1', label: 'Field 1', required: true, type: 'string' },
          { field: 'field2', label: 'Field 2', required: false, type: 'string' },
          { field: 'field3', label: 'Field 3', required: false, type: 'string' },
          { field: 'field4', label: 'Field 4', required: false, type: 'string' },
          { field: 'field5', label: 'Field 5', required: false, type: 'string' },
        ],
        validationRules: [
          { ruleId: 'RULE_001', field: 'field1', type: 'required' },
          { ruleId: 'RULE_002', field: 'field2', type: 'required' },
          { ruleId: 'RULE_003', field: 'field3', type: 'required' },
        ],
      };

      const report = validateTemplate(template);
      
      const violation = report.warnings.find(v => v.ruleId === 'GOV-020');
      expect(violation).toBeDefined();
    });

    it('GOV-021: detects required field without validation', () => {
      const template: TemplateSpec = {
        ...validTemplate,
        fieldRules: [
          { field: 'field1', label: 'Field 1', required: true, type: 'string' },
          { field: 'field2', label: 'Field 2', required: true, type: 'string' },
          { field: 'field3', label: 'Field 3', required: true, type: 'string' },
          { field: 'field4', label: 'Field 4', required: true, type: 'string' },
          { field: 'field5', label: 'Field 5', required: true, type: 'string' },
        ],
        validationRules: [
          { ruleId: 'RULE_001', field: 'field1', type: 'required' },
          { ruleId: 'RULE_002', field: 'field2', type: 'required' },
          { ruleId: 'RULE_003', field: 'field3', type: 'required' },
          // field4 and field5 have no validation rules
        ],
      };

      const report = validateTemplate(template);
      
      const violations = report.blockingViolations.filter(v => v.ruleId === 'GOV-021');
      expect(violations.length).toBe(2);
    });

    it('GOV-022: detects missing selection criteria', () => {
      const template: TemplateSpec = {
        ...validTemplate,
        selection: undefined,
      };

      const report = validateTemplate(template);
      
      const violation = report.warnings.find(v => v.ruleId === 'GOV-022');
      expect(violation).toBeDefined();
    });

    it('GOV-030: detects potential PII in field names', () => {
      const template: TemplateSpec = {
        ...validTemplate,
        fieldRules: [
          ...validTemplate.fieldRules,
          { field: 'socialSecurityNumber', label: 'SSN', required: false, type: 'string' },
        ],
      };

      const report = validateTemplate(template);
      
      const violation = report.warnings.find(v => v.ruleId === 'GOV-030');
      expect(violation).toBeDefined();
    });
  });
});
