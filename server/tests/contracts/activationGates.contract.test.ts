/**
 * Activation Gates Contract Tests
 * 
 * PR-D: Tests for activation preconditions and selection trace always-on.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createTemplate,
  uploadTemplateVersion,
  activateVersion,
  resetRegistry,
  checkActivationPreconditions,
  formatActivationError,
  CRITICAL_FIELDS,
  type SpecJson,
  type SelectionConfig,
} from '../../services/templateRegistry';
import {
  selectTemplateWithTrace,
} from '../../services/templateSelector';

// Valid spec with all critical fields
const validSpecJson: SpecJson = {
  name: 'Valid Spec',
  version: '1.0.0',
  fields: [
    { field: 'jobReference', label: 'Job Reference', type: 'string', required: true },
    { field: 'assetId', label: 'Asset ID', type: 'string', required: true },
    { field: 'date', label: 'Date', type: 'date', required: true },
    { field: 'engineerSignOff', label: 'Engineer Sign Off', type: 'boolean', required: true },
    { field: 'customerName', label: 'Customer', type: 'string', required: false },
  ],
  rules: [
    { ruleId: 'R001', field: 'jobReference', description: 'Required', severity: 'critical', type: 'required', enabled: true },
    { ruleId: 'R002', field: 'assetId', description: 'Required', severity: 'critical', type: 'required', enabled: true },
  ],
};

// Valid selection config
const validSelectionConfig: SelectionConfig = {
  requiredTokensAll: ['job', 'sheet'],
  requiredTokensAny: ['repair', 'maintenance'],
  optionalTokens: ['customer'],
};

// Invalid spec missing critical fields
const invalidSpecJson: SpecJson = {
  name: 'Invalid Spec',
  version: '1.0.0',
  fields: [
    { field: 'customerName', label: 'Customer', type: 'string', required: false },
  ],
  rules: [
    { ruleId: 'R001', field: 'customerName', description: 'Test', severity: 'minor', type: 'required', enabled: true },
  ],
};

// Empty selection config
const emptySelectionConfig: SelectionConfig = {
  requiredTokensAll: [],
  requiredTokensAny: [],
  optionalTokens: [],
};

describe('Activation Gates - PR-D Contract Tests', () => {
  beforeEach(() => {
    resetRegistry();
  });

  describe('Activation Precondition Checks', () => {
    it('should pass with valid spec and selection config', () => {
      const result = checkActivationPreconditions(validSpecJson, validSelectionConfig);
      
      expect(result.allowed).toBe(true);
      expect(result.blockingIssues).toHaveLength(0);
    });

    it('should fail when all critical fields are missing', () => {
      const result = checkActivationPreconditions(invalidSpecJson, validSelectionConfig);
      
      expect(result.allowed).toBe(false);
      expect(result.blockingIssues.length).toBeGreaterThan(0);
      
      // Check that each critical field is flagged
      const missingFieldIssues = result.blockingIssues.filter(i => i.code === 'MISSING_CRITICAL_FIELD');
      expect(missingFieldIssues.length).toBeGreaterThan(0);
    });

    it('should fail when selection config is empty', () => {
      const result = checkActivationPreconditions(validSpecJson, emptySelectionConfig);
      
      expect(result.allowed).toBe(false);
      expect(result.blockingIssues.some(i => i.code === 'SELECTION_CONFIG_EMPTY')).toBe(true);
    });

    it('should pass when only requiredTokensAll is set', () => {
      const config: SelectionConfig = {
        requiredTokensAll: ['job'],
        requiredTokensAny: [],
        optionalTokens: [],
      };
      
      const result = checkActivationPreconditions(validSpecJson, config);
      
      expect(result.allowed).toBe(true);
    });

    it('should pass when only requiredTokensAny is set', () => {
      const config: SelectionConfig = {
        requiredTokensAll: [],
        requiredTokensAny: ['repair'],
        optionalTokens: [],
      };
      
      const result = checkActivationPreconditions(validSpecJson, config);
      
      expect(result.allowed).toBe(true);
    });

    it('should pass when only formCodeRegex is set', () => {
      const config: SelectionConfig = {
        requiredTokensAll: [],
        requiredTokensAny: [],
        formCodeRegex: '^FORM-\\d+$',
        optionalTokens: [],
      };
      
      const result = checkActivationPreconditions(validSpecJson, config);
      
      expect(result.allowed).toBe(true);
    });

    it('should fail when spec has no rules', () => {
      const noRulesSpec: SpecJson = {
        ...validSpecJson,
        rules: [],
      };
      
      const result = checkActivationPreconditions(noRulesSpec, validSelectionConfig);
      
      expect(result.allowed).toBe(false);
      expect(result.blockingIssues.some(i => i.code === 'NO_VALIDATION_RULES')).toBe(true);
    });

    it('should provide fix paths for all blocking issues', () => {
      const result = checkActivationPreconditions(invalidSpecJson, emptySelectionConfig);
      
      expect(Object.keys(result.fixPaths).length).toBeGreaterThan(0);
    });

    it('should generate warnings for missing recommended fields', () => {
      const result = checkActivationPreconditions(validSpecJson, validSelectionConfig);
      
      // Recommended fields should be in warnings
      const recommendedWarnings = result.warnings.filter(w => w.code === 'MISSING_RECOMMENDED_FIELD');
      expect(recommendedWarnings.length).toBeGreaterThan(0);
    });
  });

  describe('Activation Gate Enforcement', () => {
    it('should block activation when preconditions fail', () => {
      const template = createTemplate({
        templateId: 'invalid-template',
        name: 'Invalid',
        createdBy: 1,
      });
      
      const version = uploadTemplateVersion({
        templateId: template.id,
        version: '1.0.0',
        specJson: invalidSpecJson,
        selectionConfigJson: emptySelectionConfig,
        createdBy: 1,
      });
      
      expect(() => activateVersion(version.id)).toThrow('PIPELINE_ERROR');
    });

    it('should allow activation when preconditions pass', () => {
      const template = createTemplate({
        templateId: 'valid-template',
        name: 'Valid',
        createdBy: 1,
      });
      
      const version = uploadTemplateVersion({
        templateId: template.id,
        version: '1.0.0',
        specJson: validSpecJson,
        selectionConfigJson: validSelectionConfig,
        createdBy: 1,
      });
      
      const activated = activateVersion(version.id);
      
      expect(activated.isActive).toBe(true);
    });

    it('should allow bypass for testing with skipPreconditions flag', () => {
      const template = createTemplate({
        templateId: 'bypass-template',
        name: 'Bypass',
        createdBy: 1,
      });
      
      const version = uploadTemplateVersion({
        templateId: template.id,
        version: '1.0.0',
        specJson: invalidSpecJson,
        selectionConfigJson: emptySelectionConfig,
        createdBy: 1,
      });
      
      // Should work with skip flag
      const activated = activateVersion(version.id, true);
      
      expect(activated.isActive).toBe(true);
    });
  });

  describe('Error Formatting', () => {
    it('should format error with all blocking issues and fix paths', () => {
      const result = checkActivationPreconditions(invalidSpecJson, emptySelectionConfig);
      const errorMessage = formatActivationError(result);
      
      expect(errorMessage).toContain('PIPELINE_ERROR');
      expect(errorMessage).toContain('Blocking Issues');
      expect(errorMessage).toContain('Fix Paths');
    });
  });

  describe('Selection Trace Always-On', () => {
    it('should include trace on HIGH confidence selection', () => {
      const template = createTemplate({
        templateId: 'trace-test',
        name: 'Trace Test',
        createdBy: 1,
      });
      
      const version = uploadTemplateVersion({
        templateId: template.id,
        version: '1.0.0',
        specJson: validSpecJson,
        selectionConfigJson: {
          requiredTokensAll: ['job', 'sheet'],
          requiredTokensAny: ['repair'],
          optionalTokens: ['customer', 'signature'],
        },
        createdBy: 1,
      });
      
      activateVersion(version.id);
      
      const result = selectTemplateWithTrace(
        'Job Sheet Repair Report with Customer Signature',
        123
      );
      
      expect(result.trace).toBeDefined();
      expect(result.trace.artifactVersion).toBe('1.0.0');
      expect(result.trace.jobSheetId).toBe(123);
      expect(result.trace.outcome.selected).toBe(true);
      expect(result.trace.outcome.confidenceBand).toBe('HIGH');
    });

    it('should include trace on LOW confidence block', () => {
      const template = createTemplate({
        templateId: 'low-conf-template',
        name: 'Low Conf',
        createdBy: 1,
      });
      
      const version = uploadTemplateVersion({
        templateId: template.id,
        version: '1.0.0',
        specJson: validSpecJson,
        selectionConfigJson: {
          requiredTokensAll: ['very', 'specific', 'tokens'],
          requiredTokensAny: ['rare'],
          optionalTokens: [],
        },
        createdBy: 1,
      });
      
      activateVersion(version.id);
      
      const result = selectTemplateWithTrace(
        'Generic document with random content',
        456
      );
      
      expect(result.trace).toBeDefined();
      expect(result.trace.jobSheetId).toBe(456);
      expect(result.trace.outcome.selected).toBe(false);
      expect(result.trace.outcome.confidenceBand).toBe('LOW');
      expect(result.trace.outcome.blockReason).not.toBeNull();
    });

    it('should include input signals in trace', () => {
      const result = selectTemplateWithTrace(
        'This is a test document with some tokens',
        789
      );
      
      expect(result.trace.inputSignals).toBeDefined();
      expect(result.trace.inputSignals.tokenCount).toBeGreaterThan(0);
      expect(result.trace.inputSignals.documentLength).toBeGreaterThan(0);
      expect(Array.isArray(result.trace.inputSignals.tokenSample)).toBe(true);
    });

    it('should include all candidates in trace with deterministic order', () => {
      // Create multiple templates
      const t1 = createTemplate({ templateId: 'template-a', name: 'A', createdBy: 1 });
      const t2 = createTemplate({ templateId: 'template-b', name: 'B', createdBy: 1 });
      
      const v1 = uploadTemplateVersion({
        templateId: t1.id,
        version: '1.0.0',
        specJson: validSpecJson,
        selectionConfigJson: validSelectionConfig,
        createdBy: 1,
      });
      
      const v2 = uploadTemplateVersion({
        templateId: t2.id,
        version: '1.0.0',
        specJson: { ...validSpecJson, name: 'B Spec' },
        selectionConfigJson: validSelectionConfig,
        createdBy: 1,
      });
      
      activateVersion(v1.id);
      activateVersion(v2.id);
      
      const result = selectTemplateWithTrace(
        'Job sheet repair document',
        999
      );
      
      expect(result.trace.candidates.length).toBe(2);
      
      // Verify deterministic order (score desc, templateSlug asc)
      for (let i = 1; i < result.trace.candidates.length; i++) {
        const prev = result.trace.candidates[i - 1];
        const curr = result.trace.candidates[i];
        
        if (prev.score === curr.score) {
          expect(prev.templateSlug.localeCompare(curr.templateSlug)).toBeLessThanOrEqual(0);
        } else {
          expect(prev.score).toBeGreaterThanOrEqual(curr.score);
        }
      }
    });
  });

  describe('Critical Fields Constant', () => {
    it('should export critical fields constant', () => {
      expect(CRITICAL_FIELDS).toContain('jobReference');
      expect(CRITICAL_FIELDS).toContain('assetId');
      expect(CRITICAL_FIELDS).toContain('date');
      expect(CRITICAL_FIELDS).toContain('engineerSignOff');
    });
  });
});
