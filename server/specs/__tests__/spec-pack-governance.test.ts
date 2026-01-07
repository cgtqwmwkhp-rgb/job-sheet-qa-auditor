/**
 * Spec Pack Governance Contract Tests
 * 
 * Validates that the spec pack follows canonical reason codes and
 * documentation-quality semantics (not asset condition).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Canonical reason codes - must match parity/runner/types.ts
const CANONICAL_REASON_CODES = [
  'VALID',
  'MISSING_FIELD',
  'UNREADABLE_FIELD',
  'LOW_CONFIDENCE',
  'INVALID_FORMAT',
  'CONFLICT',
  'OUT_OF_POLICY',
  'INCOMPLETE_EVIDENCE',
  'OCR_FAILURE',
  'PIPELINE_ERROR',
  'SPEC_GAP',
  'SECURITY_RISK',
] as const;

// Legacy codes that must be mapped
const LEGACY_CODE_MAPPINGS: Record<string, string> = {
  'MISSING_CRITICAL_FIELD': 'MISSING_FIELD',
  'INSUFFICIENT_DETAIL': 'INCOMPLETE_EVIDENCE',
  'OUT_OF_RANGE': 'OUT_OF_POLICY',
  'RANGE_ERROR': 'OUT_OF_POLICY',
  'POLICY_VIOLATION': 'OUT_OF_POLICY',
  'FIELD_MISSING': 'MISSING_FIELD',
  'MISSING_EVIDENCE': 'INCOMPLETE_EVIDENCE',
  'EXTRACTION_FAILED': 'OCR_FAILURE',
  'UNREADABLE': 'UNREADABLE_FIELD',
};

// Asset condition keywords that should NOT be in validation rules
const ASSET_CONDITION_PATTERNS = [
  /asset\s+(must|should)\s+be/i,
  /equipment\s+(must|should)\s+be/i,
  /vehicle\s+(must|should)\s+be/i,
  /GVW.*expected.*false/i,
  /expectedValue.*false.*GVW/i,
];

// Documentation quality keywords that SHOULD be in validation rules
const DOC_QUALITY_PATTERNS = [
  /documentation/i,
  /completeness/i,
  /consistency/i,
  /evidence/i,
  /follow-?up/i,
  /engineer\s+must\s+document/i,
];

interface SpecPack {
  packId: string;
  packVersion: string;
  defaults: {
    reviewQueueTriggers: string[];
    reviewQueueTriggerMappings?: Record<string, string>;
  };
  templates: Array<{
    templateId: string;
    validationRules?: Array<{
      ruleId: string;
      description: string;
    }>;
    fieldRules?: Record<string, {
      expectedValue?: unknown;
      documentationRule?: unknown;
    }>;
  }>;
}

describe('Spec Pack Governance', () => {
  let specPack: SpecPack;
  
  beforeAll(() => {
    const specPath = path.join(__dirname, '..', 'plantexpand-spec-pack.json');
    const content = fs.readFileSync(specPath, 'utf-8');
    specPack = JSON.parse(content);
  });

  describe('Canonical Reason Codes', () => {
    it('should only use canonical reason codes in reviewQueueTriggers', () => {
      const triggers = specPack.defaults.reviewQueueTriggers;
      const nonCanonical = triggers.filter(
        t => !CANONICAL_REASON_CODES.includes(t as typeof CANONICAL_REASON_CODES[number])
      );
      
      expect(nonCanonical).toEqual([]);
    });

    it('should provide mappings for legacy codes if used', () => {
      const mappings = specPack.defaults.reviewQueueTriggerMappings || {};
      
      for (const [legacy, canonical] of Object.entries(mappings)) {
        expect(LEGACY_CODE_MAPPINGS[legacy]).toBe(canonical);
        expect(CANONICAL_REASON_CODES).toContain(canonical);
      }
    });

    it('should not contain non-canonical codes anywhere in templates', () => {
      const nonCanonicalFound: string[] = [];
      
      for (const template of specPack.templates) {
        const templateJson = JSON.stringify(template);
        
        for (const legacyCode of Object.keys(LEGACY_CODE_MAPPINGS)) {
          if (templateJson.includes(`"${legacyCode}"`)) {
            nonCanonicalFound.push(`${template.templateId}: ${legacyCode}`);
          }
        }
      }
      
      expect(nonCanonicalFound).toEqual([]);
    });
  });

  describe('Documentation Quality Semantics', () => {
    it('should not encode asset condition as pass/fail in validation rules', () => {
      const assetConditionRules: string[] = [];
      
      for (const template of specPack.templates) {
        for (const rule of template.validationRules || []) {
          for (const pattern of ASSET_CONDITION_PATTERNS) {
            if (pattern.test(rule.description)) {
              assetConditionRules.push(`${template.templateId}/${rule.ruleId}: ${rule.description}`);
            }
          }
        }
      }
      
      // If any found, output SPEC_GAP
      if (assetConditionRules.length > 0) {
        console.error('SPEC_GAP: The following rules encode asset condition as pass/fail:');
        assetConditionRules.forEach(r => console.error(`  - ${r}`));
      }
      
      expect(assetConditionRules).toEqual([]);
    });

    it('should use documentation-quality semantics in validation rules', () => {
      let docQualityRuleCount = 0;
      
      for (const template of specPack.templates) {
        for (const rule of template.validationRules || []) {
          for (const pattern of DOC_QUALITY_PATTERNS) {
            if (pattern.test(rule.description)) {
              docQualityRuleCount++;
              break;
            }
          }
        }
      }
      
      // At least some rules should use documentation-quality semantics
      expect(docQualityRuleCount).toBeGreaterThan(0);
    });

    it('GVW rule should enforce documentation follow-up, not asset condition', () => {
      for (const template of specPack.templates) {
        // Find GVW-related field rules
        for (const [fieldName, fieldRule] of Object.entries(template.fieldRules || {})) {
          if (fieldName.toLowerCase().includes('gvw') || 
              (typeof fieldRule === 'object' && JSON.stringify(fieldRule).toLowerCase().includes('gvw'))) {
            
            // Should NOT have expectedValue: false (asset condition)
            if ('expectedValue' in fieldRule && fieldRule.expectedValue === false) {
              fail(`${template.templateId}/${fieldName}: GVW field uses expectedValue: false (asset condition). Should use documentationRule instead.`);
            }
            
            // Should have documentationRule (documentation quality)
            if ('documentationRule' in fieldRule) {
              expect(fieldRule.documentationRule).toBeDefined();
            }
          }
        }
        
        // Find GVW-related validation rules
        for (const rule of template.validationRules || []) {
          if (rule.ruleId.includes('GVW')) {
            // Should mention documentation, not asset condition
            expect(rule.description.toLowerCase()).toMatch(/documentation|follow-?up|engineer.*document/i);
          }
        }
      }
    });
  });

  describe('Spec Pack Structure', () => {
    it('should have auditPerspective section explaining documentation audit', () => {
      const pack = specPack as unknown as { auditPerspective?: { description: string } };
      expect(pack.auditPerspective).toBeDefined();
      expect(pack.auditPerspective?.description).toMatch(/documentation.*quality/i);
    });

    it('should have valid pack metadata', () => {
      expect(specPack.packId).toBe('PLANTEXPAND_SPEC_PACK');
      expect(specPack.packVersion).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });
});
