/**
 * Activation Policy Contract Tests
 * 
 * PR-K: Tests for comprehensive activation governance gates.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  resetRegistry,
  resetFixtureStore,
  createTemplate,
  uploadTemplateVersion,
  createFixturePack,
  runPolicyCheck,
  generateActivationReport,
  formatPolicyError,
  DEFAULT_POLICY_CONFIG,
  type SpecJson,
  type SelectionConfig,
  type RoiConfig,
  type ActivationPolicyConfig,
  type FixtureCase,
} from '../../services/templateRegistry';

// Valid spec with all critical fields
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

// Full ROI config with all critical fields
const fullRoiConfig: RoiConfig = {
  regions: [
    { name: 'jobReference', page: 1, bounds: { x: 0.05, y: 0.1, width: 0.4, height: 0.05 } },
    { name: 'assetId', page: 1, bounds: { x: 0.5, y: 0.1, width: 0.45, height: 0.05 } },
    { name: 'date', page: 1, bounds: { x: 0.7, y: 0.02, width: 0.25, height: 0.04 } },
    { name: 'expiryDate', page: 1, bounds: { x: 0.7, y: 0.08, width: 0.25, height: 0.04 } },
    { name: 'tickboxBlock', page: 1, bounds: { x: 0.05, y: 0.3, width: 0.9, height: 0.3 } },
    { name: 'signatureBlock', page: 1, bounds: { x: 0, y: 0.85, width: 1, height: 0.15 } },
  ],
};

// Partial ROI config (missing some critical ROIs)
const partialRoiConfig: RoiConfig = {
  regions: [
    { name: 'jobReference', page: 1, bounds: { x: 0.05, y: 0.1, width: 0.4, height: 0.05 } },
    { name: 'assetId', page: 1, bounds: { x: 0.5, y: 0.1, width: 0.45, height: 0.05 } },
  ],
};

// Passing fixture cases
const passingFixtures: FixtureCase[] = [
  {
    caseId: 'PASS-001',
    description: 'Standard pass case',
    inputText: 'Job Reference JOB-001 Asset ID ASSET-001 Date 2024-01-01 Engineer Sign Off Yes',
    expectedOutcome: 'pass',
    required: true,
  },
];

describe('Activation Policy - PR-K Contract Tests', () => {
  beforeEach(() => {
    resetRegistry();
    resetFixtureStore();
  });

  describe('Policy Check - Fixtures', () => {
    it('should fail when fixture pack is missing', () => {
      const template = createTemplate({ templateId: 'test', name: 'Test', createdBy: 1 });
      const version = uploadTemplateVersion({
        templateId: template.id,
        version: '1.0.0',
        specJson: validSpecJson,
        selectionConfigJson: validSelectionConfig,
        createdBy: 1,
      });
      
      const result = runPolicyCheck(
        version.id,
        validSpecJson,
        validSelectionConfig,
        fullRoiConfig
      );
      
      expect(result.allowed).toBe(false);
      expect(result.violations.some(v => v.code === 'MISSING_FIXTURE_PACK')).toBe(true);
    });

    it('should pass when fixture pack exists and passes', () => {
      const template = createTemplate({ templateId: 'test', name: 'Test', createdBy: 1 });
      const version = uploadTemplateVersion({
        templateId: template.id,
        version: '1.0.0',
        specJson: validSpecJson,
        selectionConfigJson: validSelectionConfig,
        createdBy: 1,
      });
      
      createFixturePack(version.id, passingFixtures, 1);
      
      const result = runPolicyCheck(
        version.id,
        validSpecJson,
        validSelectionConfig,
        fullRoiConfig
      );
      
      expect(result.violations.some(v => v.code === 'MISSING_FIXTURE_PACK')).toBe(false);
    });

    it('should allow skipping fixture requirement via config', () => {
      const template = createTemplate({ templateId: 'test', name: 'Test', createdBy: 1 });
      const version = uploadTemplateVersion({
        templateId: template.id,
        version: '1.0.0',
        specJson: validSpecJson,
        selectionConfigJson: validSelectionConfig,
        createdBy: 1,
      });
      
      const config: ActivationPolicyConfig = {
        ...DEFAULT_POLICY_CONFIG,
        requireFixturePack: false,
      };
      
      const result = runPolicyCheck(
        version.id,
        validSpecJson,
        validSelectionConfig,
        fullRoiConfig,
        config
      );
      
      expect(result.violations.some(v => v.code === 'MISSING_FIXTURE_PACK')).toBe(false);
    });
  });

  describe('Policy Check - ROIs', () => {
    it('should fail when critical ROIs are missing', () => {
      const template = createTemplate({ templateId: 'test', name: 'Test', createdBy: 1 });
      const version = uploadTemplateVersion({
        templateId: template.id,
        version: '1.0.0',
        specJson: validSpecJson,
        selectionConfigJson: validSelectionConfig,
        createdBy: 1,
      });
      
      createFixturePack(version.id, passingFixtures, 1);
      
      const result = runPolicyCheck(
        version.id,
        validSpecJson,
        validSelectionConfig,
        partialRoiConfig // Missing date, expiry, tickbox, signature
      );
      
      expect(result.allowed).toBe(false);
      expect(result.violations.some(v => v.code === 'MISSING_CRITICAL_ROIS')).toBe(true);
    });

    it('should fail when ROI config is null', () => {
      const template = createTemplate({ templateId: 'test', name: 'Test', createdBy: 1 });
      const version = uploadTemplateVersion({
        templateId: template.id,
        version: '1.0.0',
        specJson: validSpecJson,
        selectionConfigJson: validSelectionConfig,
        createdBy: 1,
      });
      
      createFixturePack(version.id, passingFixtures, 1);
      
      const result = runPolicyCheck(
        version.id,
        validSpecJson,
        validSelectionConfig,
        null
      );
      
      expect(result.allowed).toBe(false);
      expect(result.violations.some(v => v.code === 'MISSING_CRITICAL_ROIS')).toBe(true);
    });

    it('should allow specific ROIs to be missing via policy', () => {
      const template = createTemplate({ templateId: 'test', name: 'Test', createdBy: 1 });
      const version = uploadTemplateVersion({
        templateId: template.id,
        version: '1.0.0',
        specJson: validSpecJson,
        selectionConfigJson: validSelectionConfig,
        createdBy: 1,
      });
      
      createFixturePack(version.id, passingFixtures, 1);
      
      // Allow all missing ROIs
      const config: ActivationPolicyConfig = {
        ...DEFAULT_POLICY_CONFIG,
        allowedMissingRois: ['date', 'expiryDate', 'tickboxBlock', 'signatureBlock'],
      };
      
      const result = runPolicyCheck(
        version.id,
        validSpecJson,
        validSelectionConfig,
        partialRoiConfig,
        config
      );
      
      // Should have warning instead of violation
      expect(result.violations.some(v => v.code === 'MISSING_CRITICAL_ROIS')).toBe(false);
      expect(result.warnings.some(w => w.code === 'ALLOWED_MISSING_ROIS')).toBe(true);
    });
  });

  describe('Policy Check - Selection Config', () => {
    it('should fail when selection config is empty', () => {
      const template = createTemplate({ templateId: 'test', name: 'Test', createdBy: 1 });
      const version = uploadTemplateVersion({
        templateId: template.id,
        version: '1.0.0',
        specJson: validSpecJson,
        selectionConfigJson: {
          requiredTokensAll: [],
          requiredTokensAny: [],
          optionalTokens: [],
        },
        createdBy: 1,
      });
      
      createFixturePack(version.id, passingFixtures, 1);
      
      const result = runPolicyCheck(
        version.id,
        validSpecJson,
        { requiredTokensAll: [], requiredTokensAny: [], optionalTokens: [] },
        fullRoiConfig
      );
      
      expect(result.allowed).toBe(false);
      expect(result.violations.some(v => 
        v.code === 'INSUFFICIENT_SELECTION_TOKENS' || v.code === 'SELECTION_CONFIG_EMPTY'
      )).toBe(true);
    });
  });

  describe('Activation Report', () => {
    it('should generate comprehensive report', () => {
      const template = createTemplate({ templateId: 'test', name: 'Test', createdBy: 1 });
      const version = uploadTemplateVersion({
        templateId: template.id,
        version: '1.0.0',
        specJson: validSpecJson,
        selectionConfigJson: validSelectionConfig,
        createdBy: 1,
      });
      
      createFixturePack(version.id, passingFixtures, 1);
      
      const report = generateActivationReport(
        version.id,
        validSpecJson,
        validSelectionConfig,
        fullRoiConfig
      );
      
      expect(report.reportVersion).toBe('1.0.0');
      expect(report.templateVersionId).toBe(version.id);
      expect(report.timestamp).toBeDefined();
      expect(report.policyCheck).toBeDefined();
      expect(report.fixtureSummary).toBeDefined();
      expect(report.roiPresence).toBeDefined();
      expect(report.selectionConfigSummary).toBeDefined();
    });

    it('should include fixture summary', () => {
      const template = createTemplate({ templateId: 'test', name: 'Test', createdBy: 1 });
      const version = uploadTemplateVersion({
        templateId: template.id,
        version: '1.0.0',
        specJson: validSpecJson,
        selectionConfigJson: validSelectionConfig,
        createdBy: 1,
      });
      
      createFixturePack(version.id, passingFixtures, 1);
      
      const report = generateActivationReport(
        version.id,
        validSpecJson,
        validSelectionConfig,
        fullRoiConfig
      );
      
      expect(report.fixtureSummary.hasFixturePack).toBe(true);
      expect(report.fixtureSummary.totalCases).toBe(1);
    });

    it('should include ROI presence details', () => {
      const template = createTemplate({ templateId: 'test', name: 'Test', createdBy: 1 });
      const version = uploadTemplateVersion({
        templateId: template.id,
        version: '1.0.0',
        specJson: validSpecJson,
        selectionConfigJson: validSelectionConfig,
        createdBy: 1,
      });
      
      createFixturePack(version.id, passingFixtures, 1);
      
      const report = generateActivationReport(
        version.id,
        validSpecJson,
        validSelectionConfig,
        partialRoiConfig
      );
      
      expect(report.roiPresence.hasRoiConfig).toBe(true);
      expect(report.roiPresence.criticalRoisPresent).toContain('jobReference');
      expect(report.roiPresence.criticalRoisMissing).toContain('signatureBlock');
    });

    it('should indicate when no fixture pack', () => {
      const template = createTemplate({ templateId: 'test', name: 'Test', createdBy: 1 });
      const version = uploadTemplateVersion({
        templateId: template.id,
        version: '1.0.0',
        specJson: validSpecJson,
        selectionConfigJson: validSelectionConfig,
        createdBy: 1,
      });
      
      const report = generateActivationReport(
        version.id,
        validSpecJson,
        validSelectionConfig,
        fullRoiConfig
      );
      
      expect(report.fixtureSummary.hasFixturePack).toBe(false);
      expect(report.fixtureSummary.overallResult).toBe('NOT_RUN');
    });
  });

  describe('Error Formatting', () => {
    it('should format policy errors with fix paths', () => {
      const result = runPolicyCheck(
        999,
        validSpecJson,
        validSelectionConfig,
        null
      );
      
      const errorMessage = formatPolicyError(result);
      
      expect(errorMessage).toContain('ACTIVATION_POLICY_ERROR');
      expect(errorMessage).toContain('Violations');
      expect(errorMessage).toContain('Fix Paths');
    });
  });

  describe('Full Policy Pass', () => {
    it('should pass when all requirements met', () => {
      const template = createTemplate({ templateId: 'test', name: 'Test', createdBy: 1 });
      const version = uploadTemplateVersion({
        templateId: template.id,
        version: '1.0.0',
        specJson: validSpecJson,
        selectionConfigJson: validSelectionConfig,
        createdBy: 1,
      });
      
      createFixturePack(version.id, passingFixtures, 1);
      
      const result = runPolicyCheck(
        version.id,
        validSpecJson,
        validSelectionConfig,
        fullRoiConfig
      );
      
      expect(result.allowed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });
  });

  describe('Deterministic Policy Checks', () => {
    it('should produce consistent results', () => {
      const template = createTemplate({ templateId: 'test', name: 'Test', createdBy: 1 });
      const version = uploadTemplateVersion({
        templateId: template.id,
        version: '1.0.0',
        specJson: validSpecJson,
        selectionConfigJson: validSelectionConfig,
        createdBy: 1,
      });
      
      createFixturePack(version.id, passingFixtures, 1);
      
      const result1 = runPolicyCheck(version.id, validSpecJson, validSelectionConfig, fullRoiConfig);
      const result2 = runPolicyCheck(version.id, validSpecJson, validSelectionConfig, fullRoiConfig);
      
      expect(result1.allowed).toBe(result2.allowed);
      expect(result1.violations.length).toBe(result2.violations.length);
    });
  });
});
