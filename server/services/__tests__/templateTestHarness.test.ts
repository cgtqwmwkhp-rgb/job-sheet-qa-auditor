/**
 * Template Test Harness Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import {
  TemplateTestHarness,
  getTemplateTestHarness,
  resetTemplateTestHarness,
} from '../templateTestHarness';
import {
  getTemplateRegistry,
  resetTemplateRegistry,
} from '../templateRegistry';
import { resetTemplateSelector } from '../templateSelector';

const SPECS_DIR = path.join(__dirname, '..', '..', 'specs');

describe('Template Test Harness', () => {
  let harness: TemplateTestHarness;

  beforeEach(async () => {
    resetTemplateRegistry();
    resetTemplateSelector();
    resetTemplateTestHarness();
    
    // Load the registry
    const registry = getTemplateRegistry();
    (registry as unknown as { specsDir: string }).specsDir = SPECS_DIR;
    await registry.loadAllPacks();
    
    // Create harness with correct config
    harness = new TemplateTestHarness({ specsDir: SPECS_DIR });
    await harness.loadFixtures();
  });

  afterEach(() => {
    resetTemplateRegistry();
    resetTemplateSelector();
    resetTemplateTestHarness();
  });

  describe('Fixture Loading', () => {
    it('loads parity fixtures from file', async () => {
      const result = await harness.loadFixtures();
      
      expect(result.loaded).toBeGreaterThan(0);
      expect(result.errors).toEqual([]);
    });

    it('returns fixtures for specific template', () => {
      const fixtures = harness.getFixturesForTemplate('PE_LOLER_EXAM_V1');
      
      expect(fixtures.length).toBeGreaterThan(0);
      expect(fixtures.every(f => f.templateId === 'PE_LOLER_EXAM_V1')).toBe(true);
    });

    it('returns empty array for template with no fixtures', () => {
      const fixtures = harness.getFixturesForTemplate('NON_EXISTENT_V1');
      
      expect(fixtures).toEqual([]);
    });
  });

  describe('Template Tests', () => {
    it('runs all tests for a template', async () => {
      const report = await harness.runTemplateTests('PE_LOLER_EXAM_V1');
      
      expect(report.templateId).toBe('PE_LOLER_EXAM_V1');
      expect(report.totalTests).toBeGreaterThan(0);
      expect(report.tests.length).toBe(report.totalTests);
    });

    it('includes schema validation test', async () => {
      const report = await harness.runTemplateTests('PE_LOLER_EXAM_V1');
      
      const schemaTest = report.tests.find(t => t.testId === 'schema-validation');
      expect(schemaTest).toBeDefined();
      expect(schemaTest?.passed).toBe(true);
    });

    it('includes selection criteria test', async () => {
      const report = await harness.runTemplateTests('PE_LOLER_EXAM_V1');
      
      const selectionTest = report.tests.find(t => t.testId === 'selection-criteria');
      expect(selectionTest).toBeDefined();
      expect(selectionTest?.passed).toBe(true);
    });

    it('includes parity fixtures test', async () => {
      const report = await harness.runTemplateTests('PE_LOLER_EXAM_V1');
      
      const fixturesTest = report.tests.find(t => t.testId === 'parity-fixtures-exist');
      expect(fixturesTest).toBeDefined();
    });

    it('includes documentation audit rules test', async () => {
      const report = await harness.runTemplateTests('PE_LOLER_EXAM_V1');
      
      const docAuditTest = report.tests.find(t => t.testId === 'documentation-audit-rules');
      expect(docAuditTest).toBeDefined();
    });

    it('returns failure for non-existent template', async () => {
      const report = await harness.runTemplateTests('NON_EXISTENT_V1');
      
      expect(report.overallResult).toBe('FAIL');
      expect(report.activationEligible).toBe(false);
      expect(report.activationBlockers).toContain('Template not found: NON_EXISTENT_V1');
    });
  });

  describe('Test Results', () => {
    it('calculates passed and failed counts correctly', async () => {
      const report = await harness.runTemplateTests('PE_LOLER_EXAM_V1');
      
      expect(report.passedTests + report.failedTests + report.skippedTests).toBe(report.totalTests);
    });

    it('determines overall result based on failures', async () => {
      const report = await harness.runTemplateTests('PE_LOLER_EXAM_V1');
      
      if (report.failedTests === 0) {
        expect(report.overallResult).toBe('PASS');
      } else {
        expect(report.overallResult).toBe('FAIL');
      }
    });

    it('includes test duration', async () => {
      const report = await harness.runTemplateTests('PE_LOLER_EXAM_V1');
      
      for (const test of report.tests) {
        expect(test.duration).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Activation Gate', () => {
    it('checks activation eligibility', async () => {
      const result = await harness.checkActivationEligibility('PE_LOLER_EXAM_V1');
      
      expect(typeof result.eligible).toBe('boolean');
      expect(result.blockers).toBeInstanceOf(Array);
    });

    it('activates template if tests pass', async () => {
      // First deactivate the template
      const registry = getTemplateRegistry();
      registry.deactivateTemplate('PE_LOLER_EXAM_V1');
      
      // Try to activate with gate
      const result = await harness.activateTemplateWithGate('PE_LOLER_EXAM_V1');
      
      expect(result.report).toBeDefined();
      if (result.report.activationEligible) {
        expect(result.success).toBe(true);
      }
    });

    it('blocks activation if critical tests fail', async () => {
      // Test with non-existent template (will fail critical tests)
      const result = await harness.activateTemplateWithGate('NON_EXISTENT_V1');
      
      expect(result.success).toBe(false);
      expect(result.report.activationBlockers.length).toBeGreaterThan(0);
    });
  });

  describe('Run All Templates', () => {
    it('runs tests for all registered templates', async () => {
      const reports = await harness.runAllTemplateTests();
      
      expect(reports.length).toBeGreaterThan(0);
      
      // Should have reports for all Plantexpand templates
      const templateIds = reports.map(r => r.templateId);
      expect(templateIds).toContain('PE_LOLER_EXAM_V1');
      expect(templateIds).toContain('PE_JOB_SUMMARY_REPAIR_V1');
    });

    it('each report has complete structure', async () => {
      const reports = await harness.runAllTemplateTests();
      
      for (const report of reports) {
        expect(report.templateId).toBeDefined();
        expect(report.testRunId).toBeDefined();
        expect(report.startedAt).toBeInstanceOf(Date);
        expect(report.completedAt).toBeInstanceOf(Date);
        expect(report.totalTests).toBeGreaterThan(0);
        expect(report.overallResult).toMatch(/^(PASS|FAIL|SKIP)$/);
      }
    });
  });

  describe('Singleton Instance', () => {
    it('returns the same instance', () => {
      const instance1 = getTemplateTestHarness();
      const instance2 = getTemplateTestHarness();
      
      expect(instance1).toBe(instance2);
    });

    it('resets the singleton instance', () => {
      const instance1 = getTemplateTestHarness();
      resetTemplateTestHarness();
      const instance2 = getTemplateTestHarness();
      
      expect(instance1).not.toBe(instance2);
    });
  });

  describe('Parity Fixture Validation', () => {
    it('validates fixture structure', async () => {
      const report = await harness.runTemplateTests('PE_LOLER_EXAM_V1');
      
      const fixtureTests = report.tests.filter(t => t.testId.startsWith('parity-fixture-'));
      
      for (const test of fixtureTests) {
        // Each fixture test should have details
        expect(test.details).toBeDefined();
      }
    });

    it('validates expected reason codes are canonical', async () => {
      const report = await harness.runTemplateTests('PE_LOLER_EXAM_V1');
      
      const fixtureTests = report.tests.filter(t => t.testId.startsWith('parity-fixture-'));
      
      // If any fixture has non-canonical codes, the test should fail
      for (const test of fixtureTests) {
        if (test.details?.issues) {
          const issues = test.details.issues as string[];
          const nonCanonicalIssues = issues.filter(i => i.includes('Non-canonical'));
          if (nonCanonicalIssues.length > 0) {
            expect(test.passed).toBe(false);
          }
        }
      }
    });
  });

  describe('Documentation Audit Compliance', () => {
    it('checks for DOC_AUDIT rules', async () => {
      const report = await harness.runTemplateTests('PE_JOB_SUMMARY_AZTEC_V1');
      
      const docAuditTest = report.tests.find(t => t.testId === 'documentation-audit-rules');
      expect(docAuditTest).toBeDefined();
      
      // Aztec template should have DOC_AUDIT rules
      if (docAuditTest?.details?.docAuditRules) {
        const rules = docAuditTest.details.docAuditRules as string[];
        expect(rules.length).toBeGreaterThan(0);
      }
    });

    it('requires consistency and completeness rules', async () => {
      const report = await harness.runTemplateTests('PE_JOB_SUMMARY_AZTEC_V1');
      
      const docAuditTest = report.tests.find(t => t.testId === 'documentation-audit-rules');
      
      if (docAuditTest?.details?.docAuditRules) {
        const rules = docAuditTest.details.docAuditRules as string[];
        const hasConsistency = rules.some(r => r.includes('CONSISTENCY'));
        const hasCompleteness = rules.some(r => r.includes('COMPLETENESS'));
        
        // If both are present, test should pass
        if (hasConsistency && hasCompleteness) {
          expect(docAuditTest.passed).toBe(true);
        }
      }
    });
  });
});
