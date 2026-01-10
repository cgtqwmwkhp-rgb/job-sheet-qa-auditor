/**
 * Template Batch 2 Onboarding Contract Tests
 * 
 * PR-O: Tests for importing and validating batch 2 templates (5 templates).
 * Verifies fixture packs pass and activation reports are generated.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  resetRegistry,
  resetFixtureStore,
  createTemplate,
  uploadTemplateVersion,
  createFixturePack,
  activateVersion,
  runFixtureMatrix,
  generateActivationReport,
  type SpecJson,
  type SelectionConfig,
  type RoiConfig,
  type FixtureCase,
} from '../../services/templateRegistry';

// Batch 2 template definitions
const BATCH_2_TEMPLATES = [
  {
    templateId: 'hvac-service-v1',
    name: 'HVAC Service Report',
    specJson: {
      name: 'HVAC Service Spec',
      version: '1.0.0',
      fields: [
        { field: 'jobReference', label: 'Job Reference', type: 'string', required: true },
        { field: 'assetId', label: 'Asset ID', type: 'string', required: true },
        { field: 'date', label: 'Date', type: 'date', required: true },
        { field: 'engineerSignOff', label: 'Engineer Sign Off', type: 'boolean', required: true },
      ],
      rules: [
        { ruleId: 'R001', field: 'jobReference', description: 'Required', severity: 'critical', type: 'required', enabled: true },
        { ruleId: 'R002', field: 'assetId', description: 'Required', severity: 'critical', type: 'required', enabled: true },
        { ruleId: 'R003', field: 'date', description: 'Required', severity: 'critical', type: 'required', enabled: true },
        { ruleId: 'R004', field: 'engineerSignOff', description: 'Required', severity: 'critical', type: 'required', enabled: true },
      ],
    },
    selectionConfig: {
      requiredTokensAll: ['hvac'],
      requiredTokensAny: ['service', 'air conditioning'],
    },
    roiJson: {
      regions: [
        { name: 'jobReference', page: 1, bounds: { x: 0.05, y: 0.1, width: 0.4, height: 0.05 } },
        { name: 'assetId', page: 1, bounds: { x: 0.5, y: 0.1, width: 0.45, height: 0.05 } },
        { name: 'date', page: 1, bounds: { x: 0.7, y: 0.02, width: 0.25, height: 0.04 } },
        { name: 'expiryDate', page: 1, bounds: { x: 0.7, y: 0.08, width: 0.25, height: 0.04 } },
        { name: 'tickboxBlock', page: 1, bounds: { x: 0.05, y: 0.25, width: 0.9, height: 0.35 } },
        { name: 'signatureBlock', page: 1, bounds: { x: 0, y: 0.85, width: 1, height: 0.15 } },
      ],
    },
    fixtures: [
      { caseId: 'HVAC-PASS-001', description: 'Complete', inputText: 'HVAC service job reference HVAC-123 asset id UNIT-001 date 2024-01-15 engineer sign off complete', expectedOutcome: 'pass' as const, required: true },
    ],
  },
  {
    templateId: 'electrical-safety-v1',
    name: 'Electrical Safety Certificate',
    specJson: {
      name: 'Electrical Safety Spec',
      version: '1.0.0',
      fields: [
        { field: 'jobReference', label: 'Job Reference', type: 'string', required: true },
        { field: 'assetId', label: 'Asset ID', type: 'string', required: true },
        { field: 'date', label: 'Date', type: 'date', required: true },
        { field: 'expiryDate', label: 'Expiry Date', type: 'date', required: true },
        { field: 'engineerSignOff', label: 'Engineer Sign Off', type: 'boolean', required: true },
      ],
      rules: [
        { ruleId: 'R001', field: 'jobReference', description: 'Required', severity: 'critical', type: 'required', enabled: true },
        { ruleId: 'R002', field: 'assetId', description: 'Required', severity: 'critical', type: 'required', enabled: true },
        { ruleId: 'R003', field: 'date', description: 'Required', severity: 'critical', type: 'required', enabled: true },
        { ruleId: 'R004', field: 'expiryDate', description: 'Required', severity: 'critical', type: 'required', enabled: true },
        { ruleId: 'R005', field: 'engineerSignOff', description: 'Required', severity: 'critical', type: 'required', enabled: true },
      ],
    },
    selectionConfig: {
      requiredTokensAll: ['electrical', 'safety'],
      requiredTokensAny: ['certificate', 'inspection'],
    },
    roiJson: {
      regions: [
        { name: 'jobReference', page: 1, bounds: { x: 0.05, y: 0.1, width: 0.4, height: 0.05 } },
        { name: 'assetId', page: 1, bounds: { x: 0.5, y: 0.1, width: 0.45, height: 0.05 } },
        { name: 'date', page: 1, bounds: { x: 0.7, y: 0.02, width: 0.25, height: 0.04 } },
        { name: 'expiryDate', page: 1, bounds: { x: 0.7, y: 0.08, width: 0.25, height: 0.04 } },
        { name: 'tickboxBlock', page: 1, bounds: { x: 0.05, y: 0.3, width: 0.9, height: 0.4 } },
        { name: 'signatureBlock', page: 1, bounds: { x: 0, y: 0.85, width: 1, height: 0.15 } },
      ],
    },
    fixtures: [
      { caseId: 'ELEC-PASS-001', description: 'Complete', inputText: 'Electrical safety job reference ELEC-555 asset id PROP-123 date 2024-01-15 expiry date 2025-01-15 engineer sign off complete', expectedOutcome: 'pass' as const, required: true },
    ],
  },
  {
    templateId: 'plumbing-repair-v1',
    name: 'Plumbing Repair Order',
    specJson: {
      name: 'Plumbing Repair Spec',
      version: '1.0.0',
      fields: [
        { field: 'jobReference', label: 'Job Reference', type: 'string', required: true },
        { field: 'assetId', label: 'Asset ID', type: 'string', required: true },
        { field: 'date', label: 'Date', type: 'date', required: true },
        { field: 'engineerSignOff', label: 'Engineer Sign Off', type: 'boolean', required: true },
      ],
      rules: [
        { ruleId: 'R001', field: 'jobReference', description: 'Required', severity: 'critical', type: 'required', enabled: true },
        { ruleId: 'R002', field: 'assetId', description: 'Required', severity: 'critical', type: 'required', enabled: true },
        { ruleId: 'R003', field: 'date', description: 'Required', severity: 'critical', type: 'required', enabled: true },
        { ruleId: 'R004', field: 'engineerSignOff', description: 'Required', severity: 'critical', type: 'required', enabled: true },
      ],
    },
    selectionConfig: {
      requiredTokensAll: ['plumbing'],
      requiredTokensAny: ['repair', 'drainage', 'water'],
    },
    roiJson: {
      regions: [
        { name: 'jobReference', page: 1, bounds: { x: 0.05, y: 0.1, width: 0.4, height: 0.05 } },
        { name: 'assetId', page: 1, bounds: { x: 0.5, y: 0.1, width: 0.45, height: 0.05 } },
        { name: 'date', page: 1, bounds: { x: 0.7, y: 0.02, width: 0.25, height: 0.04 } },
        { name: 'expiryDate', page: 1, bounds: { x: 0.7, y: 0.08, width: 0.25, height: 0.04 } },
        { name: 'tickboxBlock', page: 1, bounds: { x: 0.05, y: 0.25, width: 0.9, height: 0.3 } },
        { name: 'signatureBlock', page: 1, bounds: { x: 0, y: 0.85, width: 1, height: 0.15 } },
      ],
    },
    fixtures: [
      { caseId: 'PLUMB-PASS-001', description: 'Complete', inputText: 'Plumbing repair job reference PLUMB-777 asset id HOUSE-456 date 2024-01-15 engineer sign off complete', expectedOutcome: 'pass' as const, required: true },
    ],
  },
  {
    templateId: 'fire-safety-v1',
    name: 'Fire Safety Inspection',
    specJson: {
      name: 'Fire Safety Spec',
      version: '1.0.0',
      fields: [
        { field: 'jobReference', label: 'Job Reference', type: 'string', required: true },
        { field: 'assetId', label: 'Asset ID', type: 'string', required: true },
        { field: 'date', label: 'Date', type: 'date', required: true },
        { field: 'expiryDate', label: 'Expiry Date', type: 'date', required: true },
        { field: 'engineerSignOff', label: 'Engineer Sign Off', type: 'boolean', required: true },
      ],
      rules: [
        { ruleId: 'R001', field: 'jobReference', description: 'Required', severity: 'critical', type: 'required', enabled: true },
        { ruleId: 'R002', field: 'assetId', description: 'Required', severity: 'critical', type: 'required', enabled: true },
        { ruleId: 'R003', field: 'date', description: 'Required', severity: 'critical', type: 'required', enabled: true },
        { ruleId: 'R004', field: 'expiryDate', description: 'Required', severity: 'critical', type: 'required', enabled: true },
        { ruleId: 'R005', field: 'engineerSignOff', description: 'Required', severity: 'critical', type: 'required', enabled: true },
      ],
    },
    selectionConfig: {
      requiredTokensAll: ['fire', 'safety'],
      requiredTokensAny: ['inspection', 'alarm'],
    },
    roiJson: {
      regions: [
        { name: 'jobReference', page: 1, bounds: { x: 0.05, y: 0.1, width: 0.4, height: 0.05 } },
        { name: 'assetId', page: 1, bounds: { x: 0.5, y: 0.1, width: 0.45, height: 0.05 } },
        { name: 'date', page: 1, bounds: { x: 0.7, y: 0.02, width: 0.25, height: 0.04 } },
        { name: 'expiryDate', page: 1, bounds: { x: 0.7, y: 0.08, width: 0.25, height: 0.04 } },
        { name: 'tickboxBlock', page: 1, bounds: { x: 0.05, y: 0.25, width: 0.9, height: 0.4 } },
        { name: 'signatureBlock', page: 1, bounds: { x: 0, y: 0.85, width: 1, height: 0.15 } },
      ],
    },
    fixtures: [
      { caseId: 'FIRE-PASS-001', description: 'Complete', inputText: 'Fire safety job reference FIRE-333 asset id BLDG-789 date 2024-01-15 expiry date 2024-07-15 engineer sign off complete', expectedOutcome: 'pass' as const, required: true },
    ],
  },
  {
    templateId: 'gas-boiler-v1',
    name: 'Gas Boiler Service Certificate',
    specJson: {
      name: 'Gas Boiler Service Spec',
      version: '1.0.0',
      fields: [
        { field: 'jobReference', label: 'Job Reference', type: 'string', required: true },
        { field: 'assetId', label: 'Asset ID', type: 'string', required: true },
        { field: 'date', label: 'Service Date', type: 'date', required: true },
        { field: 'expiryDate', label: 'Next Service Due', type: 'date', required: true },
        { field: 'engineerSignOff', label: 'Engineer Sign Off', type: 'boolean', required: true },
      ],
      rules: [
        { ruleId: 'R001', field: 'jobReference', description: 'Required', severity: 'critical', type: 'required', enabled: true },
        { ruleId: 'R002', field: 'assetId', description: 'Required', severity: 'critical', type: 'required', enabled: true },
        { ruleId: 'R003', field: 'date', description: 'Required', severity: 'critical', type: 'required', enabled: true },
        { ruleId: 'R004', field: 'expiryDate', description: 'Required', severity: 'critical', type: 'required', enabled: true },
        { ruleId: 'R005', field: 'engineerSignOff', description: 'Required', severity: 'critical', type: 'required', enabled: true },
      ],
    },
    selectionConfig: {
      requiredTokensAll: ['gas', 'boiler'],
      requiredTokensAny: ['service', 'safety', 'certificate'],
    },
    roiJson: {
      regions: [
        { name: 'jobReference', page: 1, bounds: { x: 0.05, y: 0.1, width: 0.4, height: 0.05 } },
        { name: 'assetId', page: 1, bounds: { x: 0.5, y: 0.1, width: 0.45, height: 0.05 } },
        { name: 'date', page: 1, bounds: { x: 0.7, y: 0.02, width: 0.25, height: 0.04 } },
        { name: 'expiryDate', page: 1, bounds: { x: 0.7, y: 0.08, width: 0.25, height: 0.04 } },
        { name: 'tickboxBlock', page: 1, bounds: { x: 0.05, y: 0.25, width: 0.9, height: 0.35 } },
        { name: 'signatureBlock', page: 1, bounds: { x: 0, y: 0.85, width: 1, height: 0.15 } },
      ],
    },
    fixtures: [
      { caseId: 'GAS-PASS-001', description: 'Complete', inputText: 'Gas boiler service job reference GAS-111 asset id BLR-001 date 2024-01-15 expiry date 2025-01-15 engineer sign off complete', expectedOutcome: 'pass' as const, required: true },
    ],
  },
];

describe('Template Batch 2 Onboarding - PR-O Contract Tests', () => {
  beforeEach(() => {
    resetRegistry();
    resetFixtureStore();
  });

  describe('Template Import', () => {
    it('should import all 5 batch 2 templates', () => {
      for (const template of BATCH_2_TEMPLATES) {
        const created = createTemplate({
          templateId: template.templateId,
          name: template.name,
          createdBy: 1,
        });
        
        expect(created.id).toBeGreaterThan(0);
        expect(created.templateId).toBe(template.templateId);
      }
    });

    it('should create versions with specs and selection configs', () => {
      for (const template of BATCH_2_TEMPLATES) {
        const created = createTemplate({
          templateId: template.templateId,
          name: template.name,
          createdBy: 1,
        });
        
        const version = uploadTemplateVersion({
          templateId: created.id,
          version: '1.0.0',
          specJson: template.specJson as SpecJson,
          selectionConfigJson: template.selectionConfig as SelectionConfig,
          roiJson: template.roiJson as RoiConfig,
          createdBy: 1,
        });
        
        expect(version.id).toBeGreaterThan(0);
        expect(version.version).toBe('1.0.0');
        expect(version.specJson).toBeDefined();
        expect(version.selectionConfigJson).toBeDefined();
        expect(version.roiJson).toBeDefined();
      }
    });

    it('should create ROIs for all templates with all critical regions', () => {
      for (const template of BATCH_2_TEMPLATES) {
        const roiRegionNames = template.roiJson.regions.map(r => r.name);
        
        // All templates should have critical ROIs
        expect(roiRegionNames).toContain('jobReference');
        expect(roiRegionNames).toContain('assetId');
        expect(roiRegionNames).toContain('date');
        expect(roiRegionNames).toContain('signatureBlock');
      }
    });
  });

  describe('Fixture Packs', () => {
    it('should create fixture packs for all templates', () => {
      for (const template of BATCH_2_TEMPLATES) {
        const created = createTemplate({
          templateId: template.templateId,
          name: template.name,
          createdBy: 1,
        });
        
        const version = uploadTemplateVersion({
          templateId: created.id,
          version: '1.0.0',
          specJson: template.specJson as SpecJson,
          selectionConfigJson: template.selectionConfig as SelectionConfig,
          roiJson: template.roiJson as RoiConfig,
          createdBy: 1,
        });
        
        const pack = createFixturePack(version.id, template.fixtures as FixtureCase[], 1);
        
        expect(pack).toBeDefined();
        expect(pack.cases.length).toBeGreaterThan(0);
      }
    });

    it('should run fixture matrix successfully for all templates', () => {
      for (const template of BATCH_2_TEMPLATES) {
        const created = createTemplate({
          templateId: template.templateId,
          name: template.name,
          createdBy: 1,
        });
        
        const version = uploadTemplateVersion({
          templateId: created.id,
          version: '1.0.0',
          specJson: template.specJson as SpecJson,
          selectionConfigJson: template.selectionConfig as SelectionConfig,
          roiJson: template.roiJson as RoiConfig,
          createdBy: 1,
        });
        
        createFixturePack(version.id, template.fixtures as FixtureCase[], 1);
        
        const report = runFixtureMatrix(
          version.id,
          template.specJson as SpecJson,
          template.selectionConfig as SelectionConfig
        );
        
        expect(report.overallResult).toBe('PASS');
        expect(report.passedCases).toBe(report.totalCases);
      }
    });
  });

  describe('Activation with Fixtures', () => {
    it('should activate all batch 2 templates successfully', () => {
      for (const template of BATCH_2_TEMPLATES) {
        const created = createTemplate({
          templateId: template.templateId,
          name: template.name,
          createdBy: 1,
        });
        
        const version = uploadTemplateVersion({
          templateId: created.id,
          version: '1.0.0',
          specJson: template.specJson as SpecJson,
          selectionConfigJson: template.selectionConfig as SelectionConfig,
          roiJson: template.roiJson as RoiConfig,
          createdBy: 1,
        });
        
        createFixturePack(version.id, template.fixtures as FixtureCase[], 1);
        
        const activated = activateVersion(version.id);
        
        expect(activated.isActive).toBe(true);
      }
    });
  });

  describe('Activation Reports', () => {
    it('should generate activation reports for all templates', () => {
      for (const template of BATCH_2_TEMPLATES) {
        const created = createTemplate({
          templateId: template.templateId,
          name: template.name,
          createdBy: 1,
        });
        
        const version = uploadTemplateVersion({
          templateId: created.id,
          version: '1.0.0',
          specJson: template.specJson as SpecJson,
          selectionConfigJson: template.selectionConfig as SelectionConfig,
          roiJson: template.roiJson as RoiConfig,
          createdBy: 1,
        });
        
        createFixturePack(version.id, template.fixtures as FixtureCase[], 1);
        
        const report = generateActivationReport(
          version.id,
          template.specJson as SpecJson,
          template.selectionConfig as SelectionConfig,
          template.roiJson as RoiConfig
        );
        
        expect(report.allowed).toBe(true);
        expect(report.fixtureSummary.hasFixturePack).toBe(true);
        expect(report.fixtureSummary.overallResult).toBe('PASS');
        expect(report.roiPresence.hasRoiConfig).toBe(true);
        expect(report.selectionConfigSummary.hasRequiredTokens).toBe(true);
      }
    });

    it('should report no policy violations for properly configured templates', () => {
      for (const template of BATCH_2_TEMPLATES) {
        const created = createTemplate({
          templateId: template.templateId,
          name: template.name,
          createdBy: 1,
        });
        
        const version = uploadTemplateVersion({
          templateId: created.id,
          version: '1.0.0',
          specJson: template.specJson as SpecJson,
          selectionConfigJson: template.selectionConfig as SelectionConfig,
          roiJson: template.roiJson as RoiConfig,
          createdBy: 1,
        });
        
        createFixturePack(version.id, template.fixtures as FixtureCase[], 1);
        
        const report = generateActivationReport(
          version.id,
          template.specJson as SpecJson,
          template.selectionConfig as SelectionConfig,
          template.roiJson as RoiConfig
        );
        
        expect(report.policyCheck.violations).toHaveLength(0);
      }
    });
  });

  describe('Selection Token Uniqueness (Ambiguity Review)', () => {
    it('should have distinct requiredTokensAll for each template', () => {
      const allRequiredTokens = BATCH_2_TEMPLATES.map(t => 
        JSON.stringify(t.selectionConfig.requiredTokensAll.sort())
      );
      
      const uniqueTokens = new Set(allRequiredTokens);
      
      // Each template should have a unique set of requiredTokensAll
      expect(uniqueTokens.size).toBe(BATCH_2_TEMPLATES.length);
    });

    it('should not have overlapping token fingerprints', () => {
      // Check each pair of templates
      for (let i = 0; i < BATCH_2_TEMPLATES.length; i++) {
        for (let j = i + 1; j < BATCH_2_TEMPLATES.length; j++) {
          const t1 = BATCH_2_TEMPLATES[i];
          const t2 = BATCH_2_TEMPLATES[j];
          
          const t1AllSet = new Set(t1.selectionConfig.requiredTokensAll);
          const t2AllSet = new Set(t2.selectionConfig.requiredTokensAll);
          
          // Check if t1's required tokens are a subset/superset of t2's
          const overlap = [...t1AllSet].filter(x => t2AllSet.has(x));
          
          // Some overlap is OK, but complete overlap is a problem
          expect(overlap.length).toBeLessThan(
            Math.min(t1AllSet.size, t2AllSet.size)
          );
        }
      }
    });
  });

  describe('Determinism', () => {
    it('should produce consistent fixture results across runs', () => {
      const template = BATCH_2_TEMPLATES[0];
      
      const created = createTemplate({
        templateId: template.templateId,
        name: template.name,
        createdBy: 1,
      });
      
      const version = uploadTemplateVersion({
        templateId: created.id,
        version: '1.0.0',
        specJson: template.specJson as SpecJson,
        selectionConfigJson: template.selectionConfig as SelectionConfig,
        roiJson: template.roiJson as RoiConfig,
        createdBy: 1,
      });
      
      createFixturePack(version.id, template.fixtures as FixtureCase[], 1);
      
      const report1 = runFixtureMatrix(version.id, template.specJson as SpecJson, template.selectionConfig as SelectionConfig);
      const report2 = runFixtureMatrix(version.id, template.specJson as SpecJson, template.selectionConfig as SelectionConfig);
      
      expect(report1.overallResult).toBe(report2.overallResult);
      expect(report1.passedCases).toBe(report2.passedCases);
      expect(report1.failedCases).toBe(report2.failedCases);
    });
  });
});
