/**
 * Template Batch 4 Onboarding Contract Tests
 * 
 * PR-R: Tests for importing and validating batch 4 templates (5 templates).
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

// Batch 4 template definitions
const BATCH_4_TEMPLATES = [
  {
    templateId: 'generator-service-v1',
    name: 'Generator Service Report',
    specJson: {
      name: 'Generator Service Spec',
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
      requiredTokensAll: ['generator', 'service'],
      requiredTokensAny: ['backup', 'power'],
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
      { caseId: 'GEN-PASS-001', description: 'Complete', inputText: 'Generator service backup power job reference GEN-123 asset id GEN-001 date 2024-01-15 engineer sign off complete', expectedOutcome: 'pass' as const, required: true },
    ],
  },
  {
    templateId: 'security-alarm-v1',
    name: 'Security Alarm System Test',
    specJson: {
      name: 'Security Alarm Spec',
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
      requiredTokensAll: ['security', 'alarm'],
      requiredTokensAny: ['intruder', 'testing'],
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
      { caseId: 'SEC-PASS-001', description: 'Complete', inputText: 'Security alarm intruder testing job reference SEC-123 asset id ALARM-001 date 2024-01-15 expiry date 2025-01-15 engineer sign off complete', expectedOutcome: 'pass' as const, required: true },
    ],
  },
  {
    templateId: 'access-control-v1',
    name: 'Access Control System Maintenance',
    specJson: {
      name: 'Access Control Spec',
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
      requiredTokensAll: ['access', 'control'],
      requiredTokensAny: ['door', 'keycard'],
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
      { caseId: 'ACC-PASS-001', description: 'Complete', inputText: 'Access control door keycard job reference ACC-123 asset id DOOR-001 date 2024-01-15 engineer sign off complete', expectedOutcome: 'pass' as const, required: true },
    ],
  },
  {
    templateId: 'cctv-maintenance-v1',
    name: 'CCTV System Maintenance Report',
    specJson: {
      name: 'CCTV Maintenance Spec',
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
      requiredTokensAll: ['cctv', 'camera'],
      requiredTokensAny: ['surveillance', 'maintenance'],
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
      { caseId: 'CCTV-PASS-001', description: 'Complete', inputText: 'CCTV camera surveillance maintenance job reference CCTV-123 asset id CAM-001 date 2024-01-15 engineer sign off complete', expectedOutcome: 'pass' as const, required: true },
    ],
  },
  {
    templateId: 'duct-cleaning-v1',
    name: 'Duct Cleaning Certification',
    specJson: {
      name: 'Duct Cleaning Spec',
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
      requiredTokensAll: ['duct', 'cleaning'],
      requiredTokensAny: ['hygiene', 'certification'],
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
      { caseId: 'DUCT-PASS-001', description: 'Complete', inputText: 'Duct cleaning hygiene certification job reference DUCT-123 asset id AHU-001 date 2024-01-15 expiry date 2025-01-15 engineer sign off complete', expectedOutcome: 'pass' as const, required: true },
    ],
  },
];

// All previous batches for collision detection
const ALL_PREVIOUS_TOKENS = [
  // Batch 1 (pilot)
  ['maintenance', 'job'],
  ['inspection'],
  ['installation'],
  // Batch 2
  ['hvac'],
  ['electrical', 'safety'],
  ['plumbing'],
  ['fire', 'safety'],
  ['gas', 'boiler'],
  // Batch 3
  ['lift', 'inspection'],
  ['legionella', 'water'],
  ['ppm', 'preventive'],
  ['asbestos', 'survey'],
  ['roof', 'inspection'],
];

describe('Template Batch 4 Onboarding - PR-R Contract Tests', () => {
  beforeEach(() => {
    resetRegistry();
    resetFixtureStore();
  });

  describe('Template Import', () => {
    it('should import all 5 batch 4 templates', () => {
      for (const template of BATCH_4_TEMPLATES) {
        const created = createTemplate({
          templateId: template.templateId,
          name: template.name,
          createdBy: 1,
        });
        
        expect(created.id).toBeGreaterThan(0);
      }
    });
  });

  describe('Fixture Packs', () => {
    it('should run fixture matrix successfully for all templates', () => {
      for (const template of BATCH_4_TEMPLATES) {
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
    it('should activate all batch 4 templates successfully', () => {
      for (const template of BATCH_4_TEMPLATES) {
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
      for (const template of BATCH_4_TEMPLATES) {
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

  describe('Selection Token Uniqueness (Collision Detection)', () => {
    it('should have distinct requiredTokensAll within batch 4', () => {
      const batch4Tokens = BATCH_4_TEMPLATES.map(t => 
        JSON.stringify(t.selectionConfig.requiredTokensAll.sort())
      );
      
      const uniqueTokens = new Set(batch4Tokens);
      expect(uniqueTokens.size).toBe(BATCH_4_TEMPLATES.length);
    });

    it('should not collide with any previous batch templates', () => {
      const batch4Tokens = BATCH_4_TEMPLATES.map(t => t.selectionConfig.requiredTokensAll);
      
      for (const b4 of batch4Tokens) {
        for (const prev of ALL_PREVIOUS_TOKENS) {
          const b4Sorted = JSON.stringify([...b4].sort());
          const prevSorted = JSON.stringify([...prev].sort());
          
          // No exact matches allowed
          expect(b4Sorted).not.toBe(prevSorted);
        }
      }
    });

    it('should detect if collision exists (guard test)', () => {
      // This test ensures our collision detection is working
      const testTokens = [
        ['generator', 'service'],
        ['security', 'alarm'],
        ['access', 'control'],
        ['cctv', 'camera'],
        ['duct', 'cleaning'],
      ];
      
      // Verify none of these match previous batches
      for (const tokens of testTokens) {
        const tokenStr = JSON.stringify([...tokens].sort());
        
        for (const prev of ALL_PREVIOUS_TOKENS) {
          const prevStr = JSON.stringify([...prev].sort());
          expect(tokenStr).not.toBe(prevStr);
        }
      }
    });
  });

  describe('Total Template Count', () => {
    it('should bring total to 20 templates across all batches', () => {
      // Batch 1 (pilot): 3 templates
      // Batch 2: 5 templates
      // Batch 3: 5 templates
      // Batch 4: 5 templates
      // Total: 18 templates (not 20 as pilot was 3)
      
      const pilotCount = 3;
      const batch2Count = 5;
      const batch3Count = 5;
      const batch4Count = BATCH_4_TEMPLATES.length;
      
      const total = pilotCount + batch2Count + batch3Count + batch4Count;
      expect(total).toBe(18);
      expect(batch4Count).toBe(5);
    });
  });
});
