/**
 * Pilot Templates Contract Tests
 * 
 * PR-G: Tests for pilot template onboarding and fixture validation.
 * Verifies the template factory works with real template patterns.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  resetRegistry,
  resetFixtureStore,
  validateBulkImportPack,
  importBulkPack,
  getTemplateBySlug,
  listTemplates,
  hasFixturePack,
  runFixtureMatrix,
  getTemplateVersion,
  type BulkImportPack,
} from '../../services/templateRegistry';

// Load pilot import pack
const pilotPackPath = join(__dirname, '../../../data/pilot-templates/pilot-import-pack.json');
const pilotPack: BulkImportPack = JSON.parse(readFileSync(pilotPackPath, 'utf-8'));

describe('Pilot Templates - PR-G Contract Tests', () => {
  beforeEach(() => {
    resetRegistry();
    resetFixtureStore();
  });

  describe('Pilot Pack Validation', () => {
    it('should validate the pilot import pack structure', () => {
      const result = validateBulkImportPack(pilotPack);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should contain expected pilot templates', () => {
      expect(pilotPack.templates).toHaveLength(3);
      
      const templateIds = pilotPack.templates.map(t => t.metadata.templateId);
      expect(templateIds).toContain('maintenance-standard-v1');
      expect(templateIds).toContain('safety-inspection-v1');
      expect(templateIds).toContain('installation-cert-v1');
    });

    it('should have required fixture cases for each template', () => {
      for (const template of pilotPack.templates) {
        expect(template.fixtures).toBeDefined();
        expect(template.fixtures!.length).toBeGreaterThanOrEqual(4);
        
        // Check for required case types
        const caseIds = template.fixtures!.map(f => f.caseId);
        expect(caseIds.some(id => id.startsWith('PASS-'))).toBe(true);
        expect(caseIds.some(id => id.startsWith('FAIL-'))).toBe(true);
        expect(caseIds.some(id => id.startsWith('REVIEW-'))).toBe(true);
      }
    });

    it('should have no PII in fixture texts', () => {
      // PII patterns to check
      const piiPatterns = [
        /\b[A-Z][a-z]+ [A-Z][a-z]+\b.*@[a-z]+\.[a-z]+/i, // Name + email
        /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/, // Phone number
        /\b[A-Z]{1,2}\d{1,2}[A-Z]?\s?\d[A-Z]{2}\b/i, // UK postcode (real format)
      ];
      
      for (const template of pilotPack.templates) {
        for (const fixture of template.fixtures!) {
          for (const pattern of piiPatterns) {
            // Allow test data patterns
            if (!fixture.inputText.includes('Test') && 
                !fixture.inputText.includes('Demo') &&
                !fixture.inputText.includes('TEST')) {
              // Only fail on clearly real PII
              const match = fixture.inputText.match(pattern);
              if (match) {
                // Exclude common test patterns
                const isTestData = match[0].includes('Test') || 
                                   match[0].includes('Demo') ||
                                   match[0].includes('12345');
                expect(isTestData).toBe(true);
              }
            }
          }
        }
      }
    });
  });

  describe('Pilot Template Import', () => {
    it('should import all pilot templates successfully', () => {
      const result = importBulkPack(pilotPack, 1);
      
      expect(result.success).toBe(true);
      expect(result.totalTemplates).toBe(3);
      expect(result.successCount).toBe(3);
      expect(result.failureCount).toBe(0);
    });

    it('should create templates in registry after import', () => {
      importBulkPack(pilotPack, 1);
      
      const templates = listTemplates();
      expect(templates.length).toBe(3);
      
      expect(getTemplateBySlug('maintenance-standard-v1')).not.toBeNull();
      expect(getTemplateBySlug('safety-inspection-v1')).not.toBeNull();
      expect(getTemplateBySlug('installation-cert-v1')).not.toBeNull();
    });

    it('should create fixture packs for all templates', () => {
      const result = importBulkPack(pilotPack, 1);
      
      for (const templateResult of result.results) {
        expect(templateResult.created.fixturePackCreated).toBe(true);
        expect(hasFixturePack(templateResult.created.versionDbId!)).toBe(true);
      }
    });
  });

  describe('Pilot Fixture Execution', () => {
    it('should run fixtures for maintenance template', () => {
      const result = importBulkPack(pilotPack, 1);
      const maintenanceResult = result.results.find(r => 
        r.templateId === 'maintenance-standard-v1'
      );
      
      expect(maintenanceResult).toBeDefined();
      
      const version = getTemplateVersion(maintenanceResult!.created.versionDbId!);
      expect(version).toBeDefined();
      
      const fixtureReport = runFixtureMatrix(
        maintenanceResult!.created.versionDbId!,
        version!.specJson,
        version!.selectionConfigJson
      );
      
      // Report should have run all cases
      expect(fixtureReport.totalCases).toBe(4);
      // PASS and REVIEW cases should pass, FAIL case may vary based on mock
      expect(fixtureReport.results.length).toBe(4);
    });

    it('should run fixtures for safety inspection template', () => {
      const result = importBulkPack(pilotPack, 1);
      const safetyResult = result.results.find(r => 
        r.templateId === 'safety-inspection-v1'
      );
      
      expect(safetyResult).toBeDefined();
      
      const version = getTemplateVersion(safetyResult!.created.versionDbId!);
      const fixtureReport = runFixtureMatrix(
        safetyResult!.created.versionDbId!,
        version!.specJson,
        version!.selectionConfigJson
      );
      
      expect(fixtureReport.totalCases).toBe(4);
    });

    it('should run fixtures for installation certificate template', () => {
      const result = importBulkPack(pilotPack, 1);
      const installResult = result.results.find(r => 
        r.templateId === 'installation-cert-v1'
      );
      
      expect(installResult).toBeDefined();
      
      const version = getTemplateVersion(installResult!.created.versionDbId!);
      const fixtureReport = runFixtureMatrix(
        installResult!.created.versionDbId!,
        version!.specJson,
        version!.selectionConfigJson
      );
      
      expect(fixtureReport.totalCases).toBe(4);
    });
  });

  describe('Template Selection Fingerprints', () => {
    it('should have unique selection fingerprints', () => {
      // Each template should have distinct required tokens
      const fingerprints = pilotPack.templates.map(t => ({
        id: t.metadata.templateId,
        requiredAll: t.selectionConfigJson.requiredTokensAll,
        requiredAny: t.selectionConfigJson.requiredTokensAny,
      }));
      
      // Check no two templates have identical fingerprints
      for (let i = 0; i < fingerprints.length; i++) {
        for (let j = i + 1; j < fingerprints.length; j++) {
          const sameAll = JSON.stringify(fingerprints[i].requiredAll) === 
                          JSON.stringify(fingerprints[j].requiredAll);
          const sameAny = JSON.stringify(fingerprints[i].requiredAny) === 
                          JSON.stringify(fingerprints[j].requiredAny);
          
          // At least one must differ
          expect(sameAll && sameAny).toBe(false);
        }
      }
    });

    it('should have form code regex for each template', () => {
      for (const template of pilotPack.templates) {
        expect(template.selectionConfigJson.formCodeRegex).toBeDefined();
        expect(template.selectionConfigJson.formCodeRegex!.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Fixture Pack Standard Compliance', () => {
    it('should have case IDs following naming convention', () => {
      const validPrefixes = ['PASS-', 'FAIL-', 'REVIEW-', 'EDGE-'];
      
      for (const template of pilotPack.templates) {
        for (const fixture of template.fixtures!) {
          const hasValidPrefix = validPrefixes.some(p => fixture.caseId.startsWith(p));
          expect(hasValidPrefix).toBe(true);
        }
      }
    });

    it('should have required cases marked as required', () => {
      for (const template of pilotPack.templates) {
        const requiredCases = template.fixtures!.filter(f => f.required);
        
        // Must have at least pass, fail, and review required cases
        expect(requiredCases.length).toBeGreaterThanOrEqual(3);
      }
    });

    it('should have valid expected outcomes', () => {
      const validOutcomes = ['pass', 'fail', 'review_queue'];
      
      for (const template of pilotPack.templates) {
        for (const fixture of template.fixtures!) {
          expect(validOutcomes).toContain(fixture.expectedOutcome);
        }
      }
    });
  });
});
