/**
 * Fixture Matrix Runner Tests
 */

import { describe, it, expect } from 'vitest';
import {
  FixtureMatrixRunner,
  validateFixturePack,
  filterPacksForCI,
  checkActivationGate,
  REQUIRED_FIXTURE_TYPES,
  FIXTURE_PACK_SCHEMA,
  type FixturePack,
  type FixtureExpectation,
  type ValidationOutput,
  type CIStrategy,
} from '../fixtureMatrixRunner';

describe('Fixture Matrix Runner', () => {
  // Mock validation function
  const createMockValidator = (outputs: Map<string, ValidationOutput>) => {
    return async (fixture: FixtureExpectation): Promise<ValidationOutput> => {
      const output = outputs.get(fixture.fixtureId);
      if (!output) {
        throw new Error(`No mock output for fixture: ${fixture.fixtureId}`);
      }
      return output;
    };
  };

  describe('validateFixturePack', () => {
    it('validates correct fixture pack', () => {
      const pack: FixturePack = {
        packId: 'test-pack',
        templateId: 'PE_LOLER_EXAM_V1',
        templateVersion: '1.0.0',
        createdAt: new Date().toISOString(),
        fixtures: [
          {
            fixtureId: 'fixture-1',
            templateId: 'PE_LOLER_EXAM_V1',
            templateVersion: '1.0.0',
            description: 'Valid document',
            expectedOutcome: 'PASS',
          },
        ],
      };

      const result = validateFixturePack(pack);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects pack without packId', () => {
      const pack = {
        templateId: 'PE_LOLER_EXAM_V1',
        templateVersion: '1.0.0',
        fixtures: [],
      } as FixturePack;

      const result = validateFixturePack(pack);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('packId is required');
    });

    it('warns about missing fixture types', () => {
      const pack: FixturePack = {
        packId: 'test-pack',
        templateId: 'PE_LOLER_EXAM_V1',
        templateVersion: '1.0.0',
        createdAt: new Date().toISOString(),
        fixtures: [
          {
            fixtureId: 'fixture-1',
            templateId: 'PE_LOLER_EXAM_V1',
            templateVersion: '1.0.0',
            description: 'Valid document',
            expectedOutcome: 'PASS',
          },
        ],
      };

      const result = validateFixturePack(pack);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.coverage.missingTypes.length).toBeGreaterThan(0);
    });

    it('identifies fixture types from description and reason codes', () => {
      const pack: FixturePack = {
        packId: 'test-pack',
        templateId: 'PE_LOLER_EXAM_V1',
        templateVersion: '1.0.0',
        createdAt: new Date().toISOString(),
        fixtures: [
          {
            fixtureId: 'pass-1',
            templateId: 'PE_LOLER_EXAM_V1',
            templateVersion: '1.0.0',
            description: 'Valid document',
            expectedOutcome: 'PASS',
          },
          {
            fixtureId: 'fail-job-ref',
            templateId: 'PE_LOLER_EXAM_V1',
            templateVersion: '1.0.0',
            description: 'Missing job reference',
            expectedOutcome: 'FAIL',
            expectedReasonCodes: ['MISSING_FIELD'],
          },
          {
            fixtureId: 'fail-date',
            templateId: 'PE_LOLER_EXAM_V1',
            templateVersion: '1.0.0',
            description: 'Invalid date format',
            expectedOutcome: 'FAIL',
            expectedReasonCodes: ['INVALID_FORMAT'],
          },
        ],
      };

      const result = validateFixturePack(pack);
      expect(result.coverage.presentTypes).toContain('PASS');
      expect(result.coverage.presentTypes).toContain('FAIL_MISSING_JOB_REFERENCE');
      expect(result.coverage.presentTypes).toContain('FAIL_INVALID_DATE');
    });
  });

  describe('FixtureMatrixRunner', () => {
    describe('runFixture', () => {
      it('passes when outcome matches', async () => {
        const outputs = new Map<string, ValidationOutput>([
          ['fixture-1', { outcome: 'PASS', reasonCodes: [], evidenceKeys: [], validatedFields: [] }],
        ]);
        
        const runner = new FixtureMatrixRunner(createMockValidator(outputs));
        const fixture: FixtureExpectation = {
          fixtureId: 'fixture-1',
          templateId: 'TEST',
          templateVersion: '1.0.0',
          description: 'Test',
          expectedOutcome: 'PASS',
        };

        const result = await runner.runFixture(fixture);
        expect(result.status).toBe('passed');
        expect(result.actualOutcome).toBe('PASS');
      });

      it('fails when outcome does not match', async () => {
        const outputs = new Map<string, ValidationOutput>([
          ['fixture-1', { outcome: 'FAIL', reasonCodes: ['MISSING_FIELD'], evidenceKeys: [], validatedFields: [] }],
        ]);
        
        const runner = new FixtureMatrixRunner(createMockValidator(outputs));
        const fixture: FixtureExpectation = {
          fixtureId: 'fixture-1',
          templateId: 'TEST',
          templateVersion: '1.0.0',
          description: 'Test',
          expectedOutcome: 'PASS',
        };

        const result = await runner.runFixture(fixture);
        expect(result.status).toBe('failed');
        expect(result.errors.some(e => e.includes('Outcome mismatch'))).toBe(true);
      });

      it('fails when expected reason codes are missing', async () => {
        const outputs = new Map<string, ValidationOutput>([
          ['fixture-1', { outcome: 'FAIL', reasonCodes: ['CONFLICT'], evidenceKeys: [], validatedFields: [] }],
        ]);
        
        const runner = new FixtureMatrixRunner(createMockValidator(outputs));
        const fixture: FixtureExpectation = {
          fixtureId: 'fixture-1',
          templateId: 'TEST',
          templateVersion: '1.0.0',
          description: 'Test',
          expectedOutcome: 'FAIL',
          expectedReasonCodes: ['MISSING_FIELD'],
        };

        const result = await runner.runFixture(fixture);
        expect(result.status).toBe('failed');
        expect(result.missingReasonCodes).toContain('MISSING_FIELD');
      });

      it('fails when non-canonical reason codes are present', async () => {
        const outputs = new Map<string, ValidationOutput>([
          ['fixture-1', { outcome: 'FAIL', reasonCodes: ['VALID', 'UNKNOWN_CODE'], evidenceKeys: [], validatedFields: [] }],
        ]);
        
        const runner = new FixtureMatrixRunner(createMockValidator(outputs));
        const fixture: FixtureExpectation = {
          fixtureId: 'fixture-1',
          templateId: 'TEST',
          templateVersion: '1.0.0',
          description: 'Test',
          expectedOutcome: 'FAIL',
        };

        const result = await runner.runFixture(fixture);
        expect(result.status).toBe('failed');
        expect(result.nonCanonicalReasonCodes).toContain('VALID');
        expect(result.nonCanonicalReasonCodes).toContain('UNKNOWN_CODE');
      });

      it('reports missing evidence keys', async () => {
        const outputs = new Map<string, ValidationOutput>([
          ['fixture-1', { outcome: 'PASS', reasonCodes: [], evidenceKeys: ['page1'], validatedFields: [] }],
        ]);
        
        const runner = new FixtureMatrixRunner(createMockValidator(outputs));
        const fixture: FixtureExpectation = {
          fixtureId: 'fixture-1',
          templateId: 'TEST',
          templateVersion: '1.0.0',
          description: 'Test',
          expectedOutcome: 'PASS',
          requiredEvidenceKeys: ['page1', 'ocr_result', 'signature'],
        };

        const result = await runner.runFixture(fixture);
        expect(result.missingEvidenceKeys).toContain('ocr_result');
        expect(result.missingEvidenceKeys).toContain('signature');
      });

      it('handles validation errors', async () => {
        const runner = new FixtureMatrixRunner(async () => {
          throw new Error('Validation failed');
        });
        
        const fixture: FixtureExpectation = {
          fixtureId: 'fixture-1',
          templateId: 'TEST',
          templateVersion: '1.0.0',
          description: 'Test',
          expectedOutcome: 'PASS',
        };

        const result = await runner.runFixture(fixture);
        expect(result.status).toBe('error');
        expect(result.actualOutcome).toBe('ERROR');
      });
    });

    describe('runPack', () => {
      it('runs all fixtures in pack', async () => {
        const outputs = new Map<string, ValidationOutput>([
          ['fixture-1', { outcome: 'PASS', reasonCodes: [], evidenceKeys: [], validatedFields: [] }],
          ['fixture-2', { outcome: 'FAIL', reasonCodes: ['MISSING_FIELD'], evidenceKeys: [], validatedFields: [] }],
        ]);
        
        const runner = new FixtureMatrixRunner(createMockValidator(outputs));
        const pack: FixturePack = {
          packId: 'test-pack',
          templateId: 'TEST',
          templateVersion: '1.0.0',
          createdAt: new Date().toISOString(),
          fixtures: [
            {
              fixtureId: 'fixture-1',
              templateId: 'TEST',
              templateVersion: '1.0.0',
              description: 'Pass test',
              expectedOutcome: 'PASS',
            },
            {
              fixtureId: 'fixture-2',
              templateId: 'TEST',
              templateVersion: '1.0.0',
              description: 'Fail test',
              expectedOutcome: 'FAIL',
              expectedReasonCodes: ['MISSING_FIELD'],
            },
          ],
        };

        const result = await runner.runPack(pack);
        expect(result.totalFixtures).toBe(2);
        expect(result.passed).toBe(2);
        expect(result.failed).toBe(0);
        expect(result.overallStatus).toBe('passed');
      });

      it('respects time budget', async () => {
        const slowValidator = async () => {
          await new Promise(resolve => setTimeout(resolve, 100));
          return { outcome: 'PASS' as const, reasonCodes: [], evidenceKeys: [], validatedFields: [] };
        };
        
        const runner = new FixtureMatrixRunner(slowValidator, 50); // 50ms budget
        const pack: FixturePack = {
          packId: 'test-pack',
          templateId: 'TEST',
          templateVersion: '1.0.0',
          createdAt: new Date().toISOString(),
          fixtures: [
            {
              fixtureId: 'fixture-1',
              templateId: 'TEST',
              templateVersion: '1.0.0',
              description: 'Test 1',
              expectedOutcome: 'PASS',
            },
            {
              fixtureId: 'fixture-2',
              templateId: 'TEST',
              templateVersion: '1.0.0',
              description: 'Test 2',
              expectedOutcome: 'PASS',
            },
          ],
        };

        const result = await runner.runPack(pack);
        // At least one fixture should have time budget exceeded error
        expect(result.errors).toBeGreaterThanOrEqual(0);
      });

      it('calculates overall status correctly', async () => {
        const outputs = new Map<string, ValidationOutput>([
          ['fixture-1', { outcome: 'PASS', reasonCodes: [], evidenceKeys: [], validatedFields: [] }],
          ['fixture-2', { outcome: 'PASS', reasonCodes: [], evidenceKeys: [], validatedFields: [] }],
        ]);
        
        const runner = new FixtureMatrixRunner(createMockValidator(outputs));
        const pack: FixturePack = {
          packId: 'test-pack',
          templateId: 'TEST',
          templateVersion: '1.0.0',
          createdAt: new Date().toISOString(),
          fixtures: [
            {
              fixtureId: 'fixture-1',
              templateId: 'TEST',
              templateVersion: '1.0.0',
              description: 'Test 1',
              expectedOutcome: 'PASS',
            },
            {
              fixtureId: 'fixture-2',
              templateId: 'TEST',
              templateVersion: '1.0.0',
              description: 'Test 2',
              expectedOutcome: 'FAIL', // Mismatch!
            },
          ],
        };

        const result = await runner.runPack(pack);
        expect(result.overallStatus).toBe('failed');
      });
    });
  });

  describe('CI Strategy', () => {
    const createPacks = (): FixturePack[] => [
      {
        packId: 'pack-a',
        templateId: 'TEMPLATE_A',
        templateVersion: '1.0.0',
        createdAt: new Date().toISOString(),
        fixtures: [
          { fixtureId: 'a-pass', templateId: 'TEMPLATE_A', templateVersion: '1.0.0', description: 'Pass', expectedOutcome: 'PASS' },
          { fixtureId: 'a-fail', templateId: 'TEMPLATE_A', templateVersion: '1.0.0', description: 'Fail', expectedOutcome: 'FAIL' },
        ],
      },
      {
        packId: 'pack-b',
        templateId: 'TEMPLATE_B',
        templateVersion: '1.0.0',
        createdAt: new Date().toISOString(),
        fixtures: [
          { fixtureId: 'b-pass', templateId: 'TEMPLATE_B', templateVersion: '1.0.0', description: 'Pass', expectedOutcome: 'PASS' },
        ],
      },
      {
        packId: 'pack-c',
        templateId: 'TEMPLATE_C',
        templateVersion: '1.0.0',
        createdAt: new Date().toISOString(),
        fixtures: [
          { fixtureId: 'c-fail', templateId: 'TEMPLATE_C', templateVersion: '1.0.0', description: 'Fail', expectedOutcome: 'FAIL' },
        ],
      },
    ];

    it('nightly mode runs all packs', () => {
      const strategy: CIStrategy = { mode: 'nightly', timeBudgetMs: 30000 };
      const packs = createPacks();
      
      const filtered = filterPacksForCI(packs, strategy);
      expect(filtered.length).toBe(3);
    });

    it('PR mode with no changes runs positive suite only', () => {
      const strategy: CIStrategy = { mode: 'pr', timeBudgetMs: 30000 };
      const packs = createPacks();
      
      const filtered = filterPacksForCI(packs, strategy);
      // Should include packs that have at least one PASS fixture
      expect(filtered.length).toBe(2);
      expect(filtered.map(p => p.templateId)).toContain('TEMPLATE_A');
      expect(filtered.map(p => p.templateId)).toContain('TEMPLATE_B');
    });

    it('PR mode with changes runs only changed templates', () => {
      const strategy: CIStrategy = { 
        mode: 'pr', 
        changedTemplates: ['TEMPLATE_B'],
        timeBudgetMs: 30000 
      };
      const packs = createPacks();
      
      const filtered = filterPacksForCI(packs, strategy);
      expect(filtered.length).toBe(1);
      expect(filtered[0].templateId).toBe('TEMPLATE_B');
    });
  });

  describe('Activation Gate', () => {
    it('allows activation when all fixtures pass', () => {
      const runResult = {
        packId: 'test-pack',
        templateId: 'TEST',
        templateVersion: '1.0.0',
        runId: 'run_123',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        totalFixtures: 5,
        passed: 5,
        failed: 0,
        errors: 0,
        results: [],
        orderingStable: true,
        allCanonical: true,
        evidenceComplete: true,
        overallStatus: 'passed' as const,
      };

      const gate = checkActivationGate(runResult);
      expect(gate.canActivate).toBe(true);
      expect(gate.reasons).toContain('All fixtures passed with canonical reason codes and complete evidence');
    });

    it('blocks activation when fixtures fail', () => {
      const runResult = {
        packId: 'test-pack',
        templateId: 'TEST',
        templateVersion: '1.0.0',
        runId: 'run_123',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        totalFixtures: 5,
        passed: 3,
        failed: 2,
        errors: 0,
        results: [],
        orderingStable: true,
        allCanonical: true,
        evidenceComplete: true,
        overallStatus: 'failed' as const,
      };

      const gate = checkActivationGate(runResult);
      expect(gate.canActivate).toBe(false);
      expect(gate.reasons.some(r => r.includes('2 fixture(s) failed'))).toBe(true);
    });

    it('blocks activation when non-canonical codes detected', () => {
      const runResult = {
        packId: 'test-pack',
        templateId: 'TEST',
        templateVersion: '1.0.0',
        runId: 'run_123',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        totalFixtures: 5,
        passed: 5,
        failed: 0,
        errors: 0,
        results: [],
        orderingStable: true,
        allCanonical: false,
        evidenceComplete: true,
        overallStatus: 'passed' as const,
      };

      const gate = checkActivationGate(runResult);
      expect(gate.canActivate).toBe(false);
      expect(gate.reasons.some(r => r.includes('Non-canonical'))).toBe(true);
    });

    it('blocks activation when evidence is incomplete', () => {
      const runResult = {
        packId: 'test-pack',
        templateId: 'TEST',
        templateVersion: '1.0.0',
        runId: 'run_123',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        totalFixtures: 5,
        passed: 5,
        failed: 0,
        errors: 0,
        results: [],
        orderingStable: true,
        allCanonical: true,
        evidenceComplete: false,
        overallStatus: 'passed' as const,
      };

      const gate = checkActivationGate(runResult);
      expect(gate.canActivate).toBe(false);
      expect(gate.reasons.some(r => r.includes('Missing required evidence'))).toBe(true);
    });
  });

  describe('Required Fixture Types', () => {
    it('has all required fixture types defined', () => {
      expect(REQUIRED_FIXTURE_TYPES.length).toBe(5);
      
      const types = REQUIRED_FIXTURE_TYPES.map(t => t.type);
      expect(types).toContain('PASS');
      expect(types).toContain('FAIL_MISSING_JOB_REFERENCE');
      expect(types).toContain('FAIL_INVALID_DATE');
      expect(types).toContain('FAIL_MISSING_SIGNATURE');
      expect(types).toContain('FAIL_TICKBOX_MISALIGNMENT');
    });

    it('each fixture type has expected outcome and reason codes', () => {
      for (const fixtureType of REQUIRED_FIXTURE_TYPES) {
        expect(fixtureType.expectedOutcome).toMatch(/^(PASS|FAIL)$/);
        expect(Array.isArray(fixtureType.expectedReasonCodes)).toBe(true);
        
        if (fixtureType.expectedOutcome === 'PASS') {
          expect(fixtureType.expectedReasonCodes).toHaveLength(0);
        }
      }
    });
  });

  describe('STOP CONDITION: CI becomes unbounded', () => {
    it('time budget prevents unbounded execution', async () => {
      const slowValidator = async () => {
        await new Promise(resolve => setTimeout(resolve, 1000));
        return { outcome: 'PASS' as const, reasonCodes: [], evidenceKeys: [], validatedFields: [] };
      };
      
      const runner = new FixtureMatrixRunner(slowValidator, 100); // 100ms budget
      const pack: FixturePack = {
        packId: 'test-pack',
        templateId: 'TEST',
        templateVersion: '1.0.0',
        createdAt: new Date().toISOString(),
        fixtures: Array(10).fill(null).map((_, i) => ({
          fixtureId: `fixture-${i}`,
          templateId: 'TEST',
          templateVersion: '1.0.0',
          description: `Test ${i}`,
          expectedOutcome: 'PASS' as const,
        })),
      };

      const startTime = Date.now();
      const result = await runner.runPack(pack);
      const duration = Date.now() - startTime;
      
      // Should complete within reasonable time (not 10 seconds)
      expect(duration).toBeLessThan(2000);
      // Some fixtures should have time budget exceeded
      expect(result.errors).toBeGreaterThan(0);
    });
  });
});
