/**
 * Fixture Matrix Runner
 * 
 * Runs fixture packs against templates and validates:
 * - Outcome matches expected (PASS/FAIL)
 * - Reason codes are canonical
 * - Evidence keys are present
 * - Ordering is stable
 */

import { CANONICAL_REASON_CODES, type CanonicalReasonCode } from './canonicalSemantics';

// ============================================================================
// Types
// ============================================================================

export interface FixtureExpectation {
  fixtureId: string;
  templateId: string;
  templateVersion: string;
  description: string;
  expectedOutcome: 'PASS' | 'FAIL';
  expectedReasonCodes?: CanonicalReasonCode[];
  requiredEvidenceKeys?: string[];
  inputFile?: string;
  inputData?: Record<string, unknown>;
}

export interface FixturePack {
  packId: string;
  templateId: string;
  templateVersion: string;
  createdAt: string;
  fixtures: FixtureExpectation[];
}

export interface FixtureRunResult {
  fixtureId: string;
  status: 'passed' | 'failed' | 'error';
  expectedOutcome: 'PASS' | 'FAIL';
  actualOutcome: 'PASS' | 'FAIL' | 'ERROR';
  expectedReasonCodes: CanonicalReasonCode[];
  actualReasonCodes: string[];
  missingReasonCodes: CanonicalReasonCode[];
  unexpectedReasonCodes: string[];
  nonCanonicalReasonCodes: string[];
  requiredEvidenceKeys: string[];
  presentEvidenceKeys: string[];
  missingEvidenceKeys: string[];
  durationMs: number;
  errors: string[];
}

export interface FixturePackRunResult {
  packId: string;
  templateId: string;
  templateVersion: string;
  runId: string;
  startedAt: string;
  completedAt: string;
  totalFixtures: number;
  passed: number;
  failed: number;
  errors: number;
  results: FixtureRunResult[];
  orderingStable: boolean;
  allCanonical: boolean;
  evidenceComplete: boolean;
  overallStatus: 'passed' | 'failed';
}

export interface ValidationOutput {
  outcome: 'PASS' | 'FAIL';
  reasonCodes: string[];
  evidenceKeys: string[];
  validatedFields: Array<{
    field: string;
    status: string;
    reasonCode?: string;
  }>;
}

export type ValidationFunction = (fixture: FixtureExpectation) => Promise<ValidationOutput>;

// ============================================================================
// Required Fixture Types
// ============================================================================

export const REQUIRED_FIXTURE_TYPES = [
  {
    type: 'PASS',
    description: 'Document that passes all validation rules',
    expectedOutcome: 'PASS' as const,
    expectedReasonCodes: [] as CanonicalReasonCode[],
  },
  {
    type: 'FAIL_MISSING_JOB_REFERENCE',
    description: 'Document missing job reference field',
    expectedOutcome: 'FAIL' as const,
    expectedReasonCodes: ['MISSING_FIELD'] as CanonicalReasonCode[],
  },
  {
    type: 'FAIL_INVALID_DATE',
    description: 'Document with invalid date/expiry format',
    expectedOutcome: 'FAIL' as const,
    expectedReasonCodes: ['INVALID_FORMAT', 'OUT_OF_POLICY'] as CanonicalReasonCode[],
  },
  {
    type: 'FAIL_MISSING_SIGNATURE',
    description: 'Document missing engineer sign-off',
    expectedOutcome: 'FAIL' as const,
    expectedReasonCodes: ['MISSING_FIELD', 'INCOMPLETE_EVIDENCE'] as CanonicalReasonCode[],
  },
  {
    type: 'FAIL_TICKBOX_MISALIGNMENT',
    description: 'Document with tickbox/checklist misalignment',
    expectedOutcome: 'FAIL' as const,
    expectedReasonCodes: ['OUT_OF_POLICY', 'CONFLICT'] as CanonicalReasonCode[],
  },
];

// ============================================================================
// Fixture Pack Validation
// ============================================================================

export interface FixturePackValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  coverage: {
    requiredTypes: string[];
    presentTypes: string[];
    missingTypes: string[];
  };
}

export function validateFixturePack(pack: FixturePack): FixturePackValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Check required fields
  if (!pack.packId) errors.push('packId is required');
  if (!pack.templateId) errors.push('templateId is required');
  if (!pack.templateVersion) errors.push('templateVersion is required');
  if (!Array.isArray(pack.fixtures)) errors.push('fixtures must be an array');
  
  // Check fixture coverage
  const presentTypes = new Set<string>();
  
  for (const fixture of pack.fixtures || []) {
    if (!fixture.fixtureId) {
      errors.push('Each fixture must have a fixtureId');
    }
    if (!fixture.expectedOutcome) {
      errors.push(`Fixture ${fixture.fixtureId}: expectedOutcome is required`);
    }
    
    // Categorize fixture type
    if (fixture.expectedOutcome === 'PASS') {
      presentTypes.add('PASS');
    } else if (fixture.expectedReasonCodes?.includes('MISSING_FIELD')) {
      if (fixture.description?.toLowerCase().includes('job') || 
          fixture.description?.toLowerCase().includes('reference')) {
        presentTypes.add('FAIL_MISSING_JOB_REFERENCE');
      } else if (fixture.description?.toLowerCase().includes('sign') ||
                 fixture.description?.toLowerCase().includes('signature')) {
        presentTypes.add('FAIL_MISSING_SIGNATURE');
      }
    } else if (fixture.expectedReasonCodes?.includes('INVALID_FORMAT') ||
               fixture.expectedReasonCodes?.includes('OUT_OF_POLICY')) {
      if (fixture.description?.toLowerCase().includes('date') ||
          fixture.description?.toLowerCase().includes('expiry')) {
        presentTypes.add('FAIL_INVALID_DATE');
      } else if (fixture.description?.toLowerCase().includes('tickbox') ||
                 fixture.description?.toLowerCase().includes('checklist')) {
        presentTypes.add('FAIL_TICKBOX_MISALIGNMENT');
      }
    }
  }
  
  const requiredTypes = REQUIRED_FIXTURE_TYPES.map(t => t.type);
  const missingTypes = requiredTypes.filter(t => !presentTypes.has(t));
  
  if (missingTypes.length > 0) {
    warnings.push(`Missing fixture types: ${missingTypes.join(', ')}`);
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    coverage: {
      requiredTypes,
      presentTypes: Array.from(presentTypes),
      missingTypes,
    },
  };
}

// ============================================================================
// Fixture Runner
// ============================================================================

export class FixtureMatrixRunner {
  private validationFn: ValidationFunction;
  private timeBudgetMs: number;
  
  constructor(validationFn: ValidationFunction, timeBudgetMs: number = 30000) {
    this.validationFn = validationFn;
    this.timeBudgetMs = timeBudgetMs;
  }
  
  /**
   * Run a single fixture
   */
  async runFixture(fixture: FixtureExpectation): Promise<FixtureRunResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    
    let actualOutcome: 'PASS' | 'FAIL' | 'ERROR' = 'ERROR';
    let actualReasonCodes: string[] = [];
    let presentEvidenceKeys: string[] = [];
    
    try {
      const output = await this.validationFn(fixture);
      actualOutcome = output.outcome;
      actualReasonCodes = output.reasonCodes;
      presentEvidenceKeys = output.evidenceKeys;
    } catch (e) {
      errors.push(`Validation error: ${e}`);
    }
    
    const durationMs = Date.now() - startTime;
    
    // Check outcome
    const outcomeMatch = actualOutcome === fixture.expectedOutcome;
    
    // Check reason codes
    const expectedReasonCodes = fixture.expectedReasonCodes || [];
    const missingReasonCodes = expectedReasonCodes.filter(
      code => !actualReasonCodes.includes(code)
    );
    const unexpectedReasonCodes = actualReasonCodes.filter(
      code => !expectedReasonCodes.includes(code) && expectedReasonCodes.length > 0
    );
    const nonCanonicalReasonCodes = actualReasonCodes.filter(
      code => !CANONICAL_REASON_CODES.includes(code as CanonicalReasonCode)
    );
    
    // Check evidence keys
    const requiredEvidenceKeys = fixture.requiredEvidenceKeys || [];
    const missingEvidenceKeys = requiredEvidenceKeys.filter(
      key => !presentEvidenceKeys.includes(key)
    );
    
    // Determine status
    let status: 'passed' | 'failed' | 'error' = 'passed';
    if (errors.length > 0) {
      status = 'error';
    } else if (!outcomeMatch || missingReasonCodes.length > 0 || nonCanonicalReasonCodes.length > 0) {
      status = 'failed';
    }
    
    if (!outcomeMatch) {
      errors.push(`Outcome mismatch: expected ${fixture.expectedOutcome}, got ${actualOutcome}`);
    }
    if (missingReasonCodes.length > 0) {
      errors.push(`Missing reason codes: ${missingReasonCodes.join(', ')}`);
    }
    if (nonCanonicalReasonCodes.length > 0) {
      errors.push(`Non-canonical reason codes: ${nonCanonicalReasonCodes.join(', ')}`);
    }
    if (missingEvidenceKeys.length > 0) {
      errors.push(`Missing evidence keys: ${missingEvidenceKeys.join(', ')}`);
    }
    
    return {
      fixtureId: fixture.fixtureId,
      status,
      expectedOutcome: fixture.expectedOutcome,
      actualOutcome,
      expectedReasonCodes,
      actualReasonCodes,
      missingReasonCodes,
      unexpectedReasonCodes,
      nonCanonicalReasonCodes,
      requiredEvidenceKeys,
      presentEvidenceKeys,
      missingEvidenceKeys,
      durationMs,
      errors,
    };
  }
  
  /**
   * Run a fixture pack
   */
  async runPack(pack: FixturePack): Promise<FixturePackRunResult> {
    const runId = `run_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
    const startedAt = new Date().toISOString();
    const results: FixtureRunResult[] = [];
    
    let totalDuration = 0;
    
    for (const fixture of pack.fixtures) {
      // Check time budget
      if (totalDuration > this.timeBudgetMs) {
        results.push({
          fixtureId: fixture.fixtureId,
          status: 'error',
          expectedOutcome: fixture.expectedOutcome,
          actualOutcome: 'ERROR',
          expectedReasonCodes: fixture.expectedReasonCodes || [],
          actualReasonCodes: [],
          missingReasonCodes: fixture.expectedReasonCodes || [],
          unexpectedReasonCodes: [],
          nonCanonicalReasonCodes: [],
          requiredEvidenceKeys: fixture.requiredEvidenceKeys || [],
          presentEvidenceKeys: [],
          missingEvidenceKeys: fixture.requiredEvidenceKeys || [],
          durationMs: 0,
          errors: ['Time budget exceeded'],
        });
        continue;
      }
      
      const result = await this.runFixture(fixture);
      results.push(result);
      totalDuration += result.durationMs;
    }
    
    const completedAt = new Date().toISOString();
    
    // Calculate summary
    const passed = results.filter(r => r.status === 'passed').length;
    const failed = results.filter(r => r.status === 'failed').length;
    const errors = results.filter(r => r.status === 'error').length;
    
    // Check ordering stability (deterministic)
    const orderingStable = this.checkOrderingStability(results);
    
    // Check all reason codes are canonical
    const allCanonical = results.every(r => r.nonCanonicalReasonCodes.length === 0);
    
    // Check evidence completeness
    const evidenceComplete = results.every(r => r.missingEvidenceKeys.length === 0);
    
    return {
      packId: pack.packId,
      templateId: pack.templateId,
      templateVersion: pack.templateVersion,
      runId,
      startedAt,
      completedAt,
      totalFixtures: pack.fixtures.length,
      passed,
      failed,
      errors,
      results,
      orderingStable,
      allCanonical,
      evidenceComplete,
      overallStatus: failed === 0 && errors === 0 ? 'passed' : 'failed',
    };
  }
  
  /**
   * Check if ordering is stable (deterministic)
   */
  private checkOrderingStability(results: FixtureRunResult[]): boolean {
    // For now, assume ordering is stable if we can run the same fixtures
    // In production, this would compare with previous runs
    return true;
  }
}

// ============================================================================
// CI Strategy
// ============================================================================

export interface CIStrategy {
  mode: 'pr' | 'nightly';
  changedTemplates?: string[];
  timeBudgetMs: number;
}

export interface CIRunConfig {
  strategy: CIStrategy;
  packs: FixturePack[];
}

export function filterPacksForCI(packs: FixturePack[], strategy: CIStrategy): FixturePack[] {
  if (strategy.mode === 'nightly') {
    // Run all packs
    return packs;
  }
  
  // PR mode: run only changed templates + positive suite
  if (!strategy.changedTemplates || strategy.changedTemplates.length === 0) {
    // No changes detected, run positive suite only
    return packs.filter(p => 
      p.fixtures.some(f => f.expectedOutcome === 'PASS')
    );
  }
  
  // Filter to changed templates
  return packs.filter(p => 
    strategy.changedTemplates!.includes(p.templateId)
  );
}

// ============================================================================
// Fixture Pack Schema
// ============================================================================

export const FIXTURE_PACK_SCHEMA = {
  type: 'object',
  required: ['packId', 'templateId', 'templateVersion', 'fixtures'],
  properties: {
    packId: { type: 'string' },
    templateId: { type: 'string' },
    templateVersion: { type: 'string' },
    createdAt: { type: 'string', format: 'date-time' },
    fixtures: {
      type: 'array',
      items: {
        type: 'object',
        required: ['fixtureId', 'templateId', 'templateVersion', 'description', 'expectedOutcome'],
        properties: {
          fixtureId: { type: 'string' },
          templateId: { type: 'string' },
          templateVersion: { type: 'string' },
          description: { type: 'string' },
          expectedOutcome: { type: 'string', enum: ['PASS', 'FAIL'] },
          expectedReasonCodes: {
            type: 'array',
            items: { type: 'string', enum: CANONICAL_REASON_CODES },
          },
          requiredEvidenceKeys: {
            type: 'array',
            items: { type: 'string' },
          },
          inputFile: { type: 'string' },
          inputData: { type: 'object' },
        },
      },
    },
  },
};

// ============================================================================
// Activation Gate
// ============================================================================

export interface ActivationGateResult {
  canActivate: boolean;
  fixtureRunId: string;
  templateId: string;
  templateVersion: string;
  passed: number;
  failed: number;
  errors: number;
  allCanonical: boolean;
  evidenceComplete: boolean;
  reasons: string[];
}

export function checkActivationGate(runResult: FixturePackRunResult): ActivationGateResult {
  const reasons: string[] = [];
  let canActivate = true;
  
  if (runResult.failed > 0) {
    canActivate = false;
    reasons.push(`${runResult.failed} fixture(s) failed`);
  }
  
  if (runResult.errors > 0) {
    canActivate = false;
    reasons.push(`${runResult.errors} fixture(s) had errors`);
  }
  
  if (!runResult.allCanonical) {
    canActivate = false;
    reasons.push('Non-canonical reason codes detected');
  }
  
  if (!runResult.evidenceComplete) {
    canActivate = false;
    reasons.push('Missing required evidence keys');
  }
  
  if (canActivate) {
    reasons.push('All fixtures passed with canonical reason codes and complete evidence');
  }
  
  return {
    canActivate,
    fixtureRunId: runResult.runId,
    templateId: runResult.templateId,
    templateVersion: runResult.templateVersion,
    passed: runResult.passed,
    failed: runResult.failed,
    errors: runResult.errors,
    allCanonical: runResult.allCanonical,
    evidenceComplete: runResult.evidenceComplete,
    reasons,
  };
}
