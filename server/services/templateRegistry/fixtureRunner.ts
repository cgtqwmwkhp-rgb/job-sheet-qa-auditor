/**
 * Fixture Matrix Runner
 * 
 * PR-E: Runs fixture test cases against template versions.
 * Validates templates before activation using pass/fail test cases.
 */

import { createHash } from 'crypto';
import type { SpecJson, SelectionConfig } from './types';

/**
 * Single fixture case
 */
export interface FixtureCase {
  /** Unique case ID */
  caseId: string;
  /** Description of what this case tests */
  description: string;
  /** Input document text or path reference */
  inputText: string;
  /** Expected outcome: pass or fail */
  expectedOutcome: 'pass' | 'fail' | 'review_queue';
  /** Expected reason codes (if outcome is fail/review_queue) */
  expectedReasonCodes?: string[];
  /** Expected fields to be extracted */
  expectedFields?: Record<string, string>;
  /** Is this case required for activation? */
  required: boolean;
}

/**
 * Fixture pack - collection of test cases for a template version
 */
export interface FixturePack {
  /** Template version ID this pack is for */
  templateVersionId: number;
  /** Pack version for evolution */
  packVersion: string;
  /** SHA-256 hash of all cases for integrity */
  hashSha256: string;
  /** Individual test cases */
  cases: FixtureCase[];
  /** Created timestamp */
  createdAt: Date;
  /** Created by user ID */
  createdBy: number;
}

/**
 * Single case result
 */
export interface FixtureCaseResult {
  caseId: string;
  description: string;
  passed: boolean;
  expectedOutcome: string;
  actualOutcome: string;
  expectedReasonCodes?: string[];
  actualReasonCodes?: string[];
  errors: string[];
  durationMs: number;
}

/**
 * Fixture run report
 */
export interface FixtureRunReport {
  /** Report version */
  reportVersion: '1.0.0';
  /** Template version ID */
  templateVersionId: number;
  /** Pack hash used */
  packHash: string;
  /** Run timestamp */
  runAt: string;
  /** Overall result */
  overallResult: 'PASS' | 'FAIL';
  /** Total cases */
  totalCases: number;
  /** Passed cases */
  passedCases: number;
  /** Failed cases */
  failedCases: number;
  /** Required cases failed (blocks activation) */
  requiredCasesFailed: number;
  /** Individual case results */
  results: FixtureCaseResult[];
  /** Total run duration */
  durationMs: number;
}

// In-memory fixture pack store
const fixturePackStore = new Map<number, FixturePack>();

/**
 * Compute hash for fixture pack
 */
export function computeFixturePackHash(cases: FixtureCase[]): string {
  // Sort cases by caseId for determinism
  const sortedCases = [...cases].sort((a, b) => a.caseId.localeCompare(b.caseId));
  const content = JSON.stringify(sortedCases);
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Create a fixture pack for a template version
 */
export function createFixturePack(
  templateVersionId: number,
  cases: FixtureCase[],
  createdBy: number
): FixturePack {
  const hashSha256 = computeFixturePackHash(cases);
  
  const pack: FixturePack = {
    templateVersionId,
    packVersion: '1.0.0',
    hashSha256,
    cases: [...cases].sort((a, b) => a.caseId.localeCompare(b.caseId)),
    createdAt: new Date(),
    createdBy,
  };
  
  fixturePackStore.set(templateVersionId, pack);
  return pack;
}

/**
 * Get fixture pack for a template version
 */
export function getFixturePack(templateVersionId: number): FixturePack | null {
  return fixturePackStore.get(templateVersionId) ?? null;
}

/**
 * Check if template version has a fixture pack
 */
export function hasFixturePack(templateVersionId: number): boolean {
  return fixturePackStore.has(templateVersionId);
}

/**
 * Mock analyzer for fixture testing (no-secrets CI compatible)
 * 
 * Uses heuristics to simulate field extraction:
 * - Checks if field labels appear in document text
 * - Returns 'fail' if critical required fields are missing
 * - Returns 'review_queue' if non-critical fields are missing
 */
function mockAnalyzeDocument(
  inputText: string,
  specJson: SpecJson,
  _selectionConfig: SelectionConfig
): { outcome: 'pass' | 'fail' | 'review_queue'; reasonCodes: string[]; fields: Record<string, string> } {
  const text = inputText.toLowerCase();
  const reasonCodes: string[] = [];
  const fields: Record<string, string> = {};
  
  // Track critical field issues
  let criticalFieldsMissing = 0;
  
  // Check each field in spec
  for (const field of specJson.fields) {
    const fieldLabel = field.label.toLowerCase();
    // Split camelCase and check parts (e.g. "jobReference" -> "job reference")
    const fieldNameParts = field.field.replace(/([A-Z])/g, ' $1').toLowerCase().trim();
    
    // Check if any part of field name or label appears in text
    const labelParts = fieldLabel.split(' ');
    const nameParts = fieldNameParts.split(' ');
    
    const foundLabel = labelParts.some(part => part.length > 2 && text.includes(part));
    const foundName = nameParts.some(part => part.length > 2 && text.includes(part));
    
    if (foundLabel || foundName) {
      // Extract a mock value
      fields[field.field] = `extracted-${field.field}`;
    } else if (field.required) {
      reasonCodes.push('MISSING_FIELD');
      
      // Check if this field has a critical rule
      const hasCriticalRule = specJson.rules.some(r => 
        r.field === field.field && r.severity === 'critical'
      );
      if (hasCriticalRule) {
        criticalFieldsMissing++;
      }
    }
  }
  
  // Determine outcome based on findings
  let outcome: 'pass' | 'fail' | 'review_queue' = 'pass';
  if (criticalFieldsMissing > 0) {
    outcome = 'fail';
  } else if (reasonCodes.length > 0) {
    outcome = 'review_queue';
  }
  
  return { outcome, reasonCodes, fields };
}

/**
 * Run fixture matrix for a template version
 */
export function runFixtureMatrix(
  templateVersionId: number,
  specJson: SpecJson,
  selectionConfig: SelectionConfig
): FixtureRunReport {
  const startTime = Date.now();
  const pack = getFixturePack(templateVersionId);
  
  if (!pack) {
    throw new Error(`No fixture pack found for template version ${templateVersionId}`);
  }
  
  const results: FixtureCaseResult[] = [];
  let passedCases = 0;
  let failedCases = 0;
  let requiredCasesFailed = 0;
  
  for (const testCase of pack.cases) {
    const caseStartTime = Date.now();
    const errors: string[] = [];
    
    // Run mock analysis
    const { outcome, reasonCodes, fields: _fields } = mockAnalyzeDocument(
      testCase.inputText,
      specJson,
      selectionConfig
    );
    
    // Check outcome match
    let passed = outcome === testCase.expectedOutcome;
    
    if (outcome !== testCase.expectedOutcome) {
      errors.push(`Expected outcome '${testCase.expectedOutcome}' but got '${outcome}'`);
    }
    
    // Check reason codes if expected
    if (testCase.expectedReasonCodes && testCase.expectedReasonCodes.length > 0) {
      const missingCodes = testCase.expectedReasonCodes.filter(c => !reasonCodes.includes(c));
      if (missingCodes.length > 0) {
        errors.push(`Missing expected reason codes: ${missingCodes.join(', ')}`);
        passed = false;
      }
    }
    
    if (passed) {
      passedCases++;
    } else {
      failedCases++;
      if (testCase.required) {
        requiredCasesFailed++;
      }
    }
    
    results.push({
      caseId: testCase.caseId,
      description: testCase.description,
      passed,
      expectedOutcome: testCase.expectedOutcome,
      actualOutcome: outcome,
      expectedReasonCodes: testCase.expectedReasonCodes,
      actualReasonCodes: reasonCodes.length > 0 ? reasonCodes : undefined,
      errors,
      durationMs: Date.now() - caseStartTime,
    });
  }
  
  // Overall result - FAIL if any required case failed
  const overallResult = requiredCasesFailed === 0 ? 'PASS' : 'FAIL';
  
  return {
    reportVersion: '1.0.0',
    templateVersionId,
    packHash: pack.hashSha256,
    runAt: new Date().toISOString(),
    overallResult,
    totalCases: pack.cases.length,
    passedCases,
    failedCases,
    requiredCasesFailed,
    results,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Check if fixtures pass for activation
 */
export function checkFixturesForActivation(
  templateVersionId: number,
  specJson: SpecJson,
  selectionConfig: SelectionConfig
): { allowed: boolean; report: FixtureRunReport | null; error?: string } {
  // Check if fixture pack exists
  if (!hasFixturePack(templateVersionId)) {
    return {
      allowed: false,
      report: null,
      error: `PIPELINE_ERROR: No fixture pack found for template version ${templateVersionId}. Create fixtures before activation.`,
    };
  }
  
  // Run fixture matrix
  const report = runFixtureMatrix(templateVersionId, specJson, selectionConfig);
  
  if (report.overallResult === 'FAIL') {
    return {
      allowed: false,
      report,
      error: `PIPELINE_ERROR: Fixture validation failed. ${report.requiredCasesFailed} required case(s) failed. Fix template spec or fixtures before activation.`,
    };
  }
  
  return {
    allowed: true,
    report,
  };
}

/**
 * Reset fixture store (for testing)
 */
export function resetFixtureStore(): void {
  fixturePackStore.clear();
}

/**
 * Get fixture store stats
 */
export function getFixtureStoreStats(): { packCount: number } {
  return { packCount: fixturePackStore.size };
}
