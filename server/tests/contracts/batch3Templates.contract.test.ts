/**
 * Template Batch 3 Onboarding Contract Tests
 * 
 * PR-Q: Tests for importing and validating batch 3 templates (5 templates).
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

// Batch 3 template definitions with standardized field labels
const BATCH_3_TEMPLATES = [
  {
    templateId: 'lift-inspection-v1',
    name: 'Lift/Elevator Inspection Report',
    specJson: {
      name: 'Lift Inspection Spec',
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
      requiredTokensAll: ['lift', 'inspection'],
      requiredTokensAny: ['elevator', 'safety'],
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
      { caseId: 'LIFT-PASS-001', description: 'Complete', inputText: 'Lift inspection job reference LIFT-123 asset id ELEV-001 date 2024-01-15 expiry date 2025-01-15 engineer sign off complete', expectedOutcome: 'pass' as const, required: true },
    ],
  },
  {
    templateId: 'legionella-test-v1',
    name: 'Legionella Water Testing Report',
    specJson: {
      name: 'Legionella Test Spec',
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
      requiredTokensAll: ['legionella', 'water'],
      requiredTokensAny: ['testing', 'quality'],
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
      { caseId: 'LEG-PASS-001', description: 'Complete', inputText: 'Legionella water testing job reference LEG-123 asset id TANK-001 date 2024-01-15 expiry date 2025-01-15 engineer sign off complete', expectedOutcome: 'pass' as const, required: true },
    ],
  },
  {
    templateId: 'ppm-schedule-v1',
    name: 'Planned Preventive Maintenance Schedule',
    specJson: {
      name: 'PPM Schedule Spec',
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
      requiredTokensAll: ['ppm', 'preventive'],
      requiredTokensAny: ['maintenance', 'schedule'],
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
      { caseId: 'PPM-PASS-001', description: 'Complete', inputText: 'PPM preventive maintenance schedule job reference PPM-123 asset id EQUIP-001 date 2024-01-15 engineer sign off complete', expectedOutcome: 'pass' as const, required: true },
    ],
  },
  {
    templateId: 'asbestos-survey-v1',
    name: 'Asbestos Survey Report',
    specJson: {
      name: 'Asbestos Survey Spec',
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
      requiredTokensAll: ['asbestos', 'survey'],
      requiredTokensAny: ['report', 'assessment'],
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
      { caseId: 'ASB-PASS-001', description: 'Complete', inputText: 'Asbestos survey report job reference ASB-123 asset id BLDG-001 date 2024-01-15 expiry date 2025-01-15 engineer sign off complete', expectedOutcome: 'pass' as const, required: true },
    ],
  },
  {
    templateId: 'roof-inspection-v1',
    name: 'Roof Inspection Report',
    specJson: {
      name: 'Roof Inspection Spec',
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
      requiredTokensAll: ['roof', 'inspection'],
      requiredTokensAny: ['survey', 'condition'],
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
      { caseId: 'ROOF-PASS-001', description: 'Complete', inputText: 'Roof inspection survey job reference ROOF-123 asset id BLDG-002 date 2024-01-15 engineer sign off complete', expectedOutcome: 'pass' as const, required: true },
    ],
  },
];

describe('Template Batch 3 Onboarding - PR-Q Contract Tests', () => {
  beforeEach(() => {
    resetRegistry();
    resetFixtureStore();
  });

  describe('Template Import', () => {
    it('should import all 5 batch 3 templates', () => {
      for (const template of BATCH_3_TEMPLATES) {
        const created = createTemplate({
          templateId: template.templateId,
          name: template.name,
          createdBy: 1,
        });
        
        expect(created.id).toBeGreaterThan(0);
        expect(created.templateId).toBe(template.templateId);
      }
    });

    it('should create versions with complete ROIs', () => {
      for (const template of BATCH_3_TEMPLATES) {
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
        
        // Verify all critical ROIs present
        const roiNames = version.roiJson?.regions.map(r => r.name) ?? [];
        expect(roiNames).toContain('jobReference');
        expect(roiNames).toContain('assetId');
        expect(roiNames).toContain('signatureBlock');
      }
    });
  });

  describe('Fixture Packs', () => {
    it('should run fixture matrix successfully for all templates', () => {
      for (const template of BATCH_3_TEMPLATES) {
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
      }
    });
  });

  describe('Activation', () => {
    it('should activate all batch 3 templates successfully', () => {
      for (const template of BATCH_3_TEMPLATES) {
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

    it('should generate activation reports with no violations', () => {
      for (const template of BATCH_3_TEMPLATES) {
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
        expect(report.policyCheck.violations).toHaveLength(0);
      }
    });
  });

  describe('Selection Token Uniqueness (Ambiguity Review)', () => {
    it('should have distinct requiredTokensAll for each template', () => {
      const allRequiredTokens = BATCH_3_TEMPLATES.map(t => 
        JSON.stringify(t.selectionConfig.requiredTokensAll.sort())
      );
      
      const uniqueTokens = new Set(allRequiredTokens);
      expect(uniqueTokens.size).toBe(BATCH_3_TEMPLATES.length);
    });

    it('should not collide with batch 2 templates', () => {
      // Batch 2 required tokens
      const batch2Tokens = [
        ['hvac'],
        ['electrical', 'safety'],
        ['plumbing'],
        ['fire', 'safety'],
        ['gas', 'boiler'],
      ];
      
      // Batch 3 required tokens
      const batch3Tokens = BATCH_3_TEMPLATES.map(t => t.selectionConfig.requiredTokensAll);
      
      // Check no batch 3 template has same requiredTokensAll as batch 2
      for (const b3 of batch3Tokens) {
        for (const b2 of batch2Tokens) {
          const b3Set = new Set(b3);
          const b2Set = new Set(b2);
          
          // They shouldn't be identical
          const identical = b3.length === b2.length && 
            b3.every(t => b2Set.has(t));
          
          expect(identical).toBe(false);
        }
      }
    });
  });
});
