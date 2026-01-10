/**
 * Fixture Runner Contract Tests
 * 
 * PR-E: Tests for fixture matrix runner and activation gating.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createTemplate,
  uploadTemplateVersion,
  activateVersion,
  resetRegistry,
  createFixturePack,
  getFixturePack,
  hasFixturePack,
  runFixtureMatrix,
  checkFixturesForActivation,
  resetFixtureStore,
  computeFixturePackHash,
  type SpecJson,
  type SelectionConfig,
  type FixtureCase,
} from '../../services/templateRegistry';

// Valid spec with all critical fields
const validSpecJson: SpecJson = {
  name: 'Valid Spec',
  version: '1.0.0',
  fields: [
    { field: 'jobReference', label: 'Job Reference', type: 'string', required: true },
    { field: 'assetId', label: 'Asset ID', type: 'string', required: true },
    { field: 'date', label: 'Date', type: 'date', required: true },
    { field: 'engineerSignOff', label: 'Engineer Sign Off', type: 'boolean', required: true },
    { field: 'customerName', label: 'Customer Name', type: 'string', required: false },
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

// Passing fixture cases (document contains required field labels)
const passingFixtureCases: FixtureCase[] = [
  {
    caseId: 'PASS-001',
    description: 'Standard job sheet with all fields',
    inputText: 'Job Reference: JOB-123\nAsset ID: ASSET-456\nDate: 2024-01-01\nEngineer Sign Off: Yes\nCustomer Name: Test Corp',
    expectedOutcome: 'pass',
    required: true,
  },
  {
    caseId: 'PASS-002',
    description: 'Job sheet with minimal fields',
    inputText: 'Job Reference JOB-789 Asset ID ASSET-001 Date 2024-02-01 Engineer Sign Off complete',
    expectedOutcome: 'pass',
    required: true,
  },
];

// Fixture cases that will FAIL the runner (outcome mismatch)
const failingFixtureCases: FixtureCase[] = [
  {
    caseId: 'FAIL-001',
    description: 'Expects pass but document is missing fields',
    inputText: 'Random document with no matching fields',
    expectedOutcome: 'pass', // Expects pass, but will get 'fail' - so fixture fails
    required: true,
  },
];

// Fixture cases that correctly expect failure (outcome matches)
const correctlyExpectingFailureCases: FixtureCase[] = [
  {
    caseId: 'EXPECT-FAIL-001',
    description: 'Correctly expects failure for missing fields',
    inputText: 'Random document with no matching fields',
    expectedOutcome: 'fail', // Correctly expects fail
    expectedReasonCodes: ['MISSING_FIELD'],
    required: true,
  },
];

// Mixed fixture pack (some pass, some fail)
const mixedFixtureCases: FixtureCase[] = [
  ...passingFixtureCases,
  {
    caseId: 'OPT-001',
    description: 'Optional failure case',
    inputText: 'Some content without fields',
    expectedOutcome: 'pass', // Will fail but not required
    required: false,
  },
];

describe('Fixture Runner - PR-E Contract Tests', () => {
  beforeEach(() => {
    resetRegistry();
    resetFixtureStore();
  });

  describe('Fixture Pack Management', () => {
    it('should create a fixture pack for a template version', () => {
      const template = createTemplate({
        templateId: 'fix-test',
        name: 'Fixture Test',
        createdBy: 1,
      });
      
      const version = uploadTemplateVersion({
        templateId: template.id,
        version: '1.0.0',
        specJson: validSpecJson,
        selectionConfigJson: validSelectionConfig,
        createdBy: 1,
      });
      
      const pack = createFixturePack(version.id, passingFixtureCases, 1);
      
      expect(pack.templateVersionId).toBe(version.id);
      expect(pack.cases).toHaveLength(2);
      expect(pack.hashSha256).toBeDefined();
      expect(pack.hashSha256.length).toBe(64); // SHA-256 hex
    });

    it('should retrieve fixture pack by version ID', () => {
      const template = createTemplate({
        templateId: 'fix-get-test',
        name: 'Get Test',
        createdBy: 1,
      });
      
      const version = uploadTemplateVersion({
        templateId: template.id,
        version: '1.0.0',
        specJson: validSpecJson,
        selectionConfigJson: validSelectionConfig,
        createdBy: 1,
      });
      
      createFixturePack(version.id, passingFixtureCases, 1);
      
      const retrieved = getFixturePack(version.id);
      
      expect(retrieved).not.toBeNull();
      expect(retrieved?.templateVersionId).toBe(version.id);
    });

    it('should check if fixture pack exists', () => {
      const template = createTemplate({
        templateId: 'fix-exists-test',
        name: 'Exists Test',
        createdBy: 1,
      });
      
      const version = uploadTemplateVersion({
        templateId: template.id,
        version: '1.0.0',
        specJson: validSpecJson,
        selectionConfigJson: validSelectionConfig,
        createdBy: 1,
      });
      
      expect(hasFixturePack(version.id)).toBe(false);
      
      createFixturePack(version.id, passingFixtureCases, 1);
      
      expect(hasFixturePack(version.id)).toBe(true);
    });

    it('should compute deterministic hash for fixture pack', () => {
      const hash1 = computeFixturePackHash(passingFixtureCases);
      const hash2 = computeFixturePackHash([...passingFixtureCases].reverse());
      
      // Should be same regardless of order (sorted by caseId)
      expect(hash1).toBe(hash2);
    });

    it('should sort cases by caseId in fixture pack', () => {
      const template = createTemplate({
        templateId: 'fix-sort-test',
        name: 'Sort Test',
        createdBy: 1,
      });
      
      const version = uploadTemplateVersion({
        templateId: template.id,
        version: '1.0.0',
        specJson: validSpecJson,
        selectionConfigJson: validSelectionConfig,
        createdBy: 1,
      });
      
      const unsortedCases = [...passingFixtureCases].reverse();
      const pack = createFixturePack(version.id, unsortedCases, 1);
      
      // Cases should be sorted by caseId
      for (let i = 1; i < pack.cases.length; i++) {
        expect(pack.cases[i - 1].caseId.localeCompare(pack.cases[i].caseId)).toBeLessThan(0);
      }
    });
  });

  describe('Fixture Matrix Execution', () => {
    it('should run fixture matrix and return PASS for all passing cases', () => {
      const template = createTemplate({
        templateId: 'fix-run-pass',
        name: 'Run Pass',
        createdBy: 1,
      });
      
      const version = uploadTemplateVersion({
        templateId: template.id,
        version: '1.0.0',
        specJson: validSpecJson,
        selectionConfigJson: validSelectionConfig,
        createdBy: 1,
      });
      
      createFixturePack(version.id, passingFixtureCases, 1);
      
      const report = runFixtureMatrix(version.id, validSpecJson, validSelectionConfig);
      
      expect(report.overallResult).toBe('PASS');
      expect(report.passedCases).toBe(2);
      expect(report.failedCases).toBe(0);
      expect(report.requiredCasesFailed).toBe(0);
    });

    it('should run fixture matrix and return FAIL for failing required cases', () => {
      const template = createTemplate({
        templateId: 'fix-run-fail',
        name: 'Run Fail',
        createdBy: 1,
      });
      
      const version = uploadTemplateVersion({
        templateId: template.id,
        version: '1.0.0',
        specJson: validSpecJson,
        selectionConfigJson: validSelectionConfig,
        createdBy: 1,
      });
      
      createFixturePack(version.id, failingFixtureCases, 1);
      
      const report = runFixtureMatrix(version.id, validSpecJson, validSelectionConfig);
      
      expect(report.overallResult).toBe('FAIL');
      expect(report.requiredCasesFailed).toBeGreaterThan(0);
    });

    it('should return deterministic results (same order)', () => {
      const template = createTemplate({
        templateId: 'fix-deterministic',
        name: 'Deterministic',
        createdBy: 1,
      });
      
      const version = uploadTemplateVersion({
        templateId: template.id,
        version: '1.0.0',
        specJson: validSpecJson,
        selectionConfigJson: validSelectionConfig,
        createdBy: 1,
      });
      
      createFixturePack(version.id, passingFixtureCases, 1);
      
      const report1 = runFixtureMatrix(version.id, validSpecJson, validSelectionConfig);
      const report2 = runFixtureMatrix(version.id, validSpecJson, validSelectionConfig);
      
      // Results should be in same order
      expect(report1.results.map(r => r.caseId)).toEqual(report2.results.map(r => r.caseId));
    });

    it('should include pack hash in report', () => {
      const template = createTemplate({
        templateId: 'fix-hash-report',
        name: 'Hash Report',
        createdBy: 1,
      });
      
      const version = uploadTemplateVersion({
        templateId: template.id,
        version: '1.0.0',
        specJson: validSpecJson,
        selectionConfigJson: validSelectionConfig,
        createdBy: 1,
      });
      
      const pack = createFixturePack(version.id, passingFixtureCases, 1);
      const report = runFixtureMatrix(version.id, validSpecJson, validSelectionConfig);
      
      expect(report.packHash).toBe(pack.hashSha256);
    });

    it('should throw error if no fixture pack exists', () => {
      expect(() => runFixtureMatrix(999, validSpecJson, validSelectionConfig))
        .toThrow('No fixture pack found');
    });
  });

  describe('Activation with Fixtures', () => {
    it('should block activation when no fixtures exist (if checking enabled)', () => {
      const template = createTemplate({
        templateId: 'no-fixtures',
        name: 'No Fixtures',
        createdBy: 1,
      });
      
      const version = uploadTemplateVersion({
        templateId: template.id,
        version: '1.0.0',
        specJson: validSpecJson,
        selectionConfigJson: validSelectionConfig,
        createdBy: 1,
      });
      
      // Check directly with checkFixturesForActivation
      const result = checkFixturesForActivation(version.id, validSpecJson, validSelectionConfig);
      
      expect(result.allowed).toBe(false);
      expect(result.error).toContain('No fixture pack found');
    });

    it('should block activation when fixtures fail', () => {
      const template = createTemplate({
        templateId: 'failing-fixtures',
        name: 'Failing Fixtures',
        createdBy: 1,
      });
      
      const version = uploadTemplateVersion({
        templateId: template.id,
        version: '1.0.0',
        specJson: validSpecJson,
        selectionConfigJson: validSelectionConfig,
        createdBy: 1,
      });
      
      createFixturePack(version.id, failingFixtureCases, 1);
      
      const result = checkFixturesForActivation(version.id, validSpecJson, validSelectionConfig);
      
      expect(result.allowed).toBe(false);
      expect(result.error).toContain('Fixture validation failed');
      expect(result.report).not.toBeNull();
    });

    it('should allow activation when fixtures pass', () => {
      const template = createTemplate({
        templateId: 'passing-fixtures',
        name: 'Passing Fixtures',
        createdBy: 1,
      });
      
      const version = uploadTemplateVersion({
        templateId: template.id,
        version: '1.0.0',
        specJson: validSpecJson,
        selectionConfigJson: validSelectionConfig,
        createdBy: 1,
      });
      
      createFixturePack(version.id, passingFixtureCases, 1);
      
      const result = checkFixturesForActivation(version.id, validSpecJson, validSelectionConfig);
      
      expect(result.allowed).toBe(true);
      expect(result.report?.overallResult).toBe('PASS');
    });

    it('should integrate with activateVersion when fixtures exist', () => {
      const template = createTemplate({
        templateId: 'integrated-activation',
        name: 'Integrated Activation',
        createdBy: 1,
      });
      
      const version = uploadTemplateVersion({
        templateId: template.id,
        version: '1.0.0',
        specJson: validSpecJson,
        selectionConfigJson: validSelectionConfig,
        createdBy: 1,
      });
      
      createFixturePack(version.id, passingFixtureCases, 1);
      
      // Should activate successfully with passing fixtures
      const activated = activateVersion(version.id, { skipPreconditions: false, skipFixtures: false });
      
      expect(activated.isActive).toBe(true);
    });

    it('should fail activateVersion when fixtures fail', () => {
      const template = createTemplate({
        templateId: 'failed-activation',
        name: 'Failed Activation',
        createdBy: 1,
      });
      
      const version = uploadTemplateVersion({
        templateId: template.id,
        version: '1.0.0',
        specJson: validSpecJson,
        selectionConfigJson: validSelectionConfig,
        createdBy: 1,
      });
      
      createFixturePack(version.id, failingFixtureCases, 1);
      
      // Should throw when fixtures fail
      expect(() => activateVersion(version.id, { skipPreconditions: false, skipFixtures: false }))
        .toThrow('Fixture validation failed');
    });
  });

  describe('Case Result Details', () => {
    it('should include error details for failed cases', () => {
      const template = createTemplate({
        templateId: 'error-details',
        name: 'Error Details',
        createdBy: 1,
      });
      
      const version = uploadTemplateVersion({
        templateId: template.id,
        version: '1.0.0',
        specJson: validSpecJson,
        selectionConfigJson: validSelectionConfig,
        createdBy: 1,
      });
      
      // Use cases that will fail (expected 'pass' but actual is 'fail')
      createFixturePack(version.id, failingFixtureCases, 1);
      
      const report = runFixtureMatrix(version.id, validSpecJson, validSelectionConfig);
      
      // Should have a failed case (outcome mismatch)
      expect(report.overallResult).toBe('FAIL');
      const failedCase = report.results.find(r => !r.passed);
      
      expect(failedCase).toBeDefined();
      expect(failedCase?.errors.length).toBeGreaterThan(0);
      expect(failedCase?.expectedOutcome).toBe('pass');
      expect(failedCase?.actualOutcome).toBe('fail');
    });

    it('should include duration for each case', () => {
      const template = createTemplate({
        templateId: 'case-duration',
        name: 'Case Duration',
        createdBy: 1,
      });
      
      const version = uploadTemplateVersion({
        templateId: template.id,
        version: '1.0.0',
        specJson: validSpecJson,
        selectionConfigJson: validSelectionConfig,
        createdBy: 1,
      });
      
      createFixturePack(version.id, passingFixtureCases, 1);
      
      const report = runFixtureMatrix(version.id, validSpecJson, validSelectionConfig);
      
      for (const result of report.results) {
        expect(typeof result.durationMs).toBe('number');
        expect(result.durationMs).toBeGreaterThanOrEqual(0);
      }
    });
  });
});
