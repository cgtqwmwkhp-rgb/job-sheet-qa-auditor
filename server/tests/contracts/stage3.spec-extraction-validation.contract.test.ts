/**
 * Stage 3 Contract Tests: Spec Resolver + Extraction + Validation
 * 
 * Tests for:
 * - Spec pack layering and resolution
 * - Field extraction from OCR text
 * - Rule validation with deterministic ordering
 * - Review queue management
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createSpecResolver,
  resetSpecResolver,
  getBaseSpec,
  baseSpecPack,
  type SpecPack,
  type ValidationRule,
} from '../../services/specResolver';
import {
  extractFields,
  generateExtractionArtifact,
  type PageContent,
  type ExtractionOptions,
} from '../../services/extraction';
import {
  validateFields,
  generateValidationArtifact,
  queueForReview,
  clearReviewQueue,
  getPendingReviews,
  getReviewQueueStats,
} from '../../services/validation';

describe('Stage 3: Spec Resolver + Extraction + Validation', () => {
  beforeEach(() => {
    resetSpecResolver();
    clearReviewQueue();
  });

  describe('Spec Resolver Contract', () => {
    it('registers and retrieves base pack', () => {
      const resolver = createSpecResolver();
      resolver.registerPack(baseSpecPack);
      
      const pack = resolver.getPack('base');
      expect(pack).toBeDefined();
      expect(pack?.id).toBe('base');
      expect(pack?.version).toBe('1.0.0');
    });

    it('resolves pack with deterministic rule ordering', () => {
      const resolver = createSpecResolver();
      resolver.registerPack(baseSpecPack);
      
      const resolved = resolver.resolve('base');
      const rules = resolver.getRules(resolved);
      
      // Rules should be sorted by ruleId
      for (let i = 1; i < rules.length; i++) {
        const prev = rules[i - 1].ruleId;
        const curr = rules[i].ruleId;
        expect(prev.localeCompare(curr, undefined, { numeric: true })).toBeLessThan(0);
      }
    });

    it('supports pack layering (child overrides parent)', () => {
      const resolver = createSpecResolver();
      resolver.registerPack(baseSpecPack);
      
      // Create child pack that overrides a rule
      const childPack: SpecPack = {
        id: 'child',
        version: '1.0.0',
        name: 'Child Pack',
        extends: 'base',
        fields: [],
        rules: [
          {
            ruleId: 'R001', // Override base R001
            field: 'jobNumber',
            description: 'Job number is required (custom)',
            severity: 'major', // Changed from critical
            type: 'required',
            enabled: true,
          },
        ],
      };
      
      resolver.registerPack(childPack);
      const resolved = resolver.resolve('child');
      
      // R001 should have child's severity
      const r001 = resolved.rules.find(r => r.ruleId === 'R001');
      expect(r001?.severity).toBe('major');
      expect(r001?.description).toBe('Job number is required (custom)');
    });

    it('detects circular dependencies', () => {
      const resolver = createSpecResolver();
      
      const packA: SpecPack = {
        id: 'a',
        version: '1.0.0',
        name: 'Pack A',
        extends: 'b',
        fields: [],
        rules: [],
      };
      
      const packB: SpecPack = {
        id: 'b',
        version: '1.0.0',
        name: 'Pack B',
        extends: 'a',
        fields: [],
        rules: [],
      };
      
      resolver.registerPack(packA);
      
      expect(() => resolver.registerPack(packB)).toThrow(/circular/i);
    });

    it('lists all registered packs in deterministic order', () => {
      const resolver = createSpecResolver();
      resolver.registerPack(baseSpecPack);
      resolver.registerPack({
        id: 'alpha',
        version: '1.0.0',
        name: 'Alpha Pack',
        fields: [],
        rules: [],
      });
      resolver.registerPack({
        id: 'beta',
        version: '1.0.0',
        name: 'Beta Pack',
        fields: [],
        rules: [],
      });
      
      const packs = resolver.listPacks();
      expect(packs.map(p => p.id)).toEqual(['alpha', 'base', 'beta']);
    });
  });

  describe('Extraction Contract', () => {
    const samplePages: PageContent[] = [
      {
        pageNumber: 1,
        markdown: `
# Job Sheet

Job Number: JS-12345
Customer: Acme Corporation
Date: 2024-01-15
Technician: John Smith
Address: 123 Main St, City, ST 12345

## Work Performed
Replaced HVAC filter and performed routine maintenance on the cooling system.

Total: $250.00
        `.trim(),
      },
    ];

    it('extracts fields from OCR text', () => {
      const options: ExtractionOptions = {
        fields: baseSpecPack.fields,
      };
      
      const result = extractFields(samplePages, options);
      
      expect(result.success).toBe(true);
      expect(result.fields.size).toBeGreaterThan(0);
      expect(result.fields.get('jobNumber')?.value).toBe('JS-12345');
    });

    it('returns extraction result with required structure', () => {
      const options: ExtractionOptions = {
        fields: baseSpecPack.fields,
      };
      
      const result = extractFields(samplePages, options);
      
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('fields');
      expect(result).toHaveProperty('missingFields');
      expect(result).toHaveProperty('lowConfidenceFields');
      expect(result).toHaveProperty('metadata');
      expect(result.metadata).toHaveProperty('totalPages');
      expect(result.metadata).toHaveProperty('processingTimeMs');
      expect(result.metadata).toHaveProperty('extractionVersion');
    });

    it('generates extraction artifact with correct schema', () => {
      const options: ExtractionOptions = {
        fields: baseSpecPack.fields,
      };
      
      const result = extractFields(samplePages, options);
      const artifact = generateExtractionArtifact(result, 'doc-123');
      
      expect(artifact.version).toBe('1.0.0');
      expect(artifact.documentId).toBe('doc-123');
      expect(artifact).toHaveProperty('fields');
      expect(artifact).toHaveProperty('metadata');
      expect(artifact.metadata).toHaveProperty('missingFields');
      expect(artifact.metadata).toHaveProperty('lowConfidenceFields');
    });

    it('tracks extraction confidence levels', () => {
      const options: ExtractionOptions = {
        fields: baseSpecPack.fields,
      };
      
      const result = extractFields(samplePages, options);
      
      for (const [, field] of result.fields) {
        expect(field.confidence).toBeGreaterThanOrEqual(0);
        expect(field.confidence).toBeLessThanOrEqual(1);
        expect(['high', 'medium', 'low', 'none']).toContain(field.confidenceLevel);
      }
    });

    it('reports missing fields', () => {
      const options: ExtractionOptions = {
        fields: [
          ...baseSpecPack.fields,
          {
            field: 'nonExistentField',
            label: 'Non Existent',
            type: 'string',
            required: true,
          },
        ],
      };
      
      const result = extractFields(samplePages, options);
      
      expect(result.missingFields).toContain('nonExistentField');
    });
  });

  describe('Validation Contract', () => {
    it('validates extracted fields against rules', () => {
      const extractedFields = new Map([
        ['jobNumber', {
          field: 'jobNumber',
          value: 'JS-12345',
          confidence: 0.9,
          confidenceLevel: 'high' as const,
          method: 'keyword' as const,
          normalized: false,
        }],
        ['customerName', {
          field: 'customerName',
          value: 'Acme Corp',
          confidence: 0.85,
          confidenceLevel: 'high' as const,
          method: 'keyword' as const,
          normalized: false,
        }],
      ]);
      
      const rules: ValidationRule[] = [
        {
          ruleId: 'R001',
          field: 'jobNumber',
          description: 'Job number is required',
          severity: 'critical',
          type: 'required',
          enabled: true,
        },
        {
          ruleId: 'R002',
          field: 'jobNumber',
          description: 'Job number format',
          severity: 'major',
          type: 'pattern',
          pattern: '^[A-Z]{2}-\\d{5}$',
          enabled: true,
        },
      ];
      
      const result = validateFields(extractedFields, rules, 'base', '1.0.0');
      
      expect(result).toHaveProperty('passed');
      expect(result).toHaveProperty('validatedFields');
      expect(result).toHaveProperty('findings');
      expect(result).toHaveProperty('summary');
    });

    it('produces validatedFields for ALL rules (deterministic order)', () => {
      const extractedFields = new Map();
      const rules = baseSpecPack.rules;
      
      const result = validateFields(extractedFields, rules, 'base', '1.0.0');
      
      // validatedFields should contain ALL rules
      expect(result.validatedFields.length).toBe(rules.length);
      
      // Should be in deterministic order (by ruleId)
      for (let i = 1; i < result.validatedFields.length; i++) {
        const prev = result.validatedFields[i - 1].ruleId;
        const curr = result.validatedFields[i].ruleId;
        expect(prev.localeCompare(curr, undefined, { numeric: true })).toBeLessThan(0);
      }
    });

    it('findings contain only failed rules', () => {
      const extractedFields = new Map();
      const rules = baseSpecPack.rules;
      
      const result = validateFields(extractedFields, rules, 'base', '1.0.0');
      
      // All findings should have status 'failed'
      for (const finding of result.findings) {
        expect(finding.status).toBe('failed');
      }
      
      // findings count should match failedRules in summary
      const failedCount = result.validatedFields.filter(v => v.status === 'failed').length;
      expect(result.findings.length).toBe(failedCount);
    });

    it('generates validation artifact with correct schema', () => {
      const extractedFields = new Map();
      const rules = baseSpecPack.rules;
      
      const result = validateFields(extractedFields, rules, 'base', '1.0.0');
      const artifact = generateValidationArtifact(result, 'doc-123');
      
      expect(artifact.version).toBe('1.0.0');
      expect(artifact.documentId).toBe('doc-123');
      expect(artifact).toHaveProperty('passed');
      expect(artifact).toHaveProperty('validatedFields');
      expect(artifact).toHaveProperty('findings');
      expect(artifact).toHaveProperty('summary');
      expect(artifact).toHaveProperty('metadata');
    });

    it('summary counts are accurate', () => {
      const extractedFields = new Map([
        ['jobNumber', {
          field: 'jobNumber',
          value: 'JS-12345',
          confidence: 0.9,
          confidenceLevel: 'high' as const,
          method: 'keyword' as const,
          normalized: false,
        }],
      ]);
      
      const rules = baseSpecPack.rules;
      const result = validateFields(extractedFields, rules, 'base', '1.0.0');
      
      const { summary } = result;
      
      // Verify counts add up
      expect(summary.passedRules + summary.failedRules + summary.skippedRules)
        .toBe(summary.totalRules);
      
      // Verify severity counts
      expect(summary.criticalFailures + summary.majorFailures + summary.minorFailures + summary.infoFailures)
        .toBeLessThanOrEqual(summary.failedRules);
    });
  });

  describe('Review Queue Contract', () => {
    it('queues documents with validation failures', () => {
      const validationResult = {
        passed: false,
        validatedFields: [],
        findings: [
          {
            ruleId: 'R001',
            field: 'jobNumber',
            status: 'failed' as const,
            severity: 'critical' as const,
            message: 'Missing required field',
          },
        ],
        summary: {
          totalRules: 1,
          passedRules: 0,
          failedRules: 1,
          skippedRules: 0,
          criticalFailures: 1,
          majorFailures: 0,
          minorFailures: 0,
          infoFailures: 0,
        },
        metadata: {
          processingTimeMs: 10,
          validationVersion: '1.0.0',
          specPackId: 'base',
          specPackVersion: '1.0.0',
        },
      };
      
      const extractionResult = {
        success: true,
        fields: new Map(),
        missingFields: ['jobNumber'],
        lowConfidenceFields: [],
        metadata: {
          totalPages: 1,
          processingTimeMs: 50,
          extractionVersion: '1.0.0',
        },
      };
      
      const item = queueForReview('doc-123', validationResult, extractionResult);
      
      expect(item).not.toBeNull();
      expect(item?.documentId).toBe('doc-123');
      expect(item?.reason).toBe('validation_failure');
      expect(item?.fields).toContain('jobNumber');
      expect(item?.status).toBe('pending');
    });

    it('returns pending reviews in priority order', () => {
      // Create multiple review items
      const validationResult = {
        passed: false,
        validatedFields: [],
        findings: [
          { ruleId: 'R001', field: 'f1', status: 'failed' as const, severity: 'critical' as const, message: 'Error' },
        ],
        summary: { totalRules: 1, passedRules: 0, failedRules: 1, skippedRules: 0, criticalFailures: 1, majorFailures: 0, minorFailures: 0, infoFailures: 0 },
        metadata: { processingTimeMs: 10, validationVersion: '1.0.0', specPackId: 'base', specPackVersion: '1.0.0' },
      };
      
      const extractionResult = {
        success: true,
        fields: new Map(),
        missingFields: [],
        lowConfidenceFields: ['f2'],
        metadata: { totalPages: 1, processingTimeMs: 50, extractionVersion: '1.0.0' },
      };
      
      queueForReview('doc-1', validationResult, extractionResult);
      queueForReview('doc-2', { ...validationResult, findings: [] }, extractionResult);
      
      const pending = getPendingReviews();
      
      // Should be sorted by priority
      expect(pending.length).toBeGreaterThan(0);
      for (let i = 1; i < pending.length; i++) {
        expect(pending[i - 1].priority).toBeLessThanOrEqual(pending[i].priority);
      }
    });

    it('provides accurate queue statistics', () => {
      const stats = getReviewQueueStats();
      
      expect(stats).toHaveProperty('total');
      expect(stats).toHaveProperty('pending');
      expect(stats).toHaveProperty('inProgress');
      expect(stats).toHaveProperty('completed');
      expect(stats).toHaveProperty('dismissed');
      expect(stats).toHaveProperty('byReason');
      
      expect(stats.total).toBe(stats.pending + stats.inProgress + stats.completed + stats.dismissed);
    });
  });

  describe('End-to-End Pipeline Contract', () => {
    it('processes document through full pipeline', () => {
      // 1. Resolve spec
      const resolver = createSpecResolver();
      resolver.registerPack(baseSpecPack);
      const resolved = resolver.resolve('base');
      
      // 2. Extract fields
      const pages: PageContent[] = [{
        pageNumber: 1,
        markdown: `
Job Number: JS-99999
Customer: Test Customer
Date: 2024-01-15
Technician: Test Tech
Address: 123 Test St
Work Performed: Performed comprehensive system maintenance and testing.
Total: $100.00
        `.trim(),
      }];
      
      const extractionResult = extractFields(pages, {
        fields: resolver.getFields(resolved),
      });
      
      // 3. Validate
      const validationResult = validateFields(
        extractionResult.fields,
        resolver.getRules(resolved),
        resolved.id,
        resolved.version
      );
      
      // 4. Generate artifacts
      const extractionArtifact = generateExtractionArtifact(extractionResult, 'test-doc');
      const validationArtifact = generateValidationArtifact(validationResult, 'test-doc');
      
      // Verify pipeline output
      expect(extractionResult.success).toBe(true);
      expect(extractionResult.fields.size).toBeGreaterThan(0);
      expect(validationResult.validatedFields.length).toBe(resolved.rules.length);
      expect(extractionArtifact.version).toBe('1.0.0');
      expect(validationArtifact.version).toBe('1.0.0');
    });

    it('deterministic output across multiple runs', () => {
      const resolver = createSpecResolver();
      resolver.registerPack(baseSpecPack);
      const resolved = resolver.resolve('base');
      
      const pages: PageContent[] = [{
        pageNumber: 1,
        markdown: 'Job Number: JS-12345\nCustomer: Test',
      }];
      
      // Run twice
      const result1 = validateFields(
        extractFields(pages, { fields: resolver.getFields(resolved) }).fields,
        resolver.getRules(resolved),
        'base',
        '1.0.0'
      );
      
      const result2 = validateFields(
        extractFields(pages, { fields: resolver.getFields(resolved) }).fields,
        resolver.getRules(resolved),
        'base',
        '1.0.0'
      );
      
      // validatedFields order should be identical
      expect(result1.validatedFields.map(v => v.ruleId))
        .toEqual(result2.validatedFields.map(v => v.ruleId));
      
      // findings order should be identical
      expect(result1.findings.map(f => f.ruleId))
        .toEqual(result2.findings.map(f => f.ruleId));
    });
  });
});
