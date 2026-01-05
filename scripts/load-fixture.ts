#!/usr/bin/env tsx
/**
 * Sandbox Fixture Loader
 * ======================
 * 
 * Loads JSON fixtures into the application for UI testing.
 * 
 * SANDBOX ONLY: This script is blocked in production mode.
 * 
 * Usage:
 *   pnpm exec tsx scripts/load-fixture.ts <fixture-path>
 *   pnpm exec tsx scripts/load-fixture.ts docs/testing/sandbox-fixtures/fixture_pass.json
 * 
 * Options:
 *   --dry-run    Validate fixture without loading
 *   --verbose    Show detailed output
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================
// PRODUCTION GUARD
// ============================================================
if (process.env.NODE_ENV === 'production') {
  console.error('❌ ERROR: Fixture loading is disabled in production mode.');
  console.error('   This script is for sandbox/development testing only.');
  process.exit(1);
}

// ============================================================
// Types
// ============================================================
interface ValidatedField {
  ruleId: string;
  field: string;
  status: 'passed' | 'failed';
  value: unknown;
  confidence: number;
  pageNumber: number;
  severity: 'S0' | 'S1' | 'S2' | 'S3';
  reasonCode: string;
  message?: string;
}

interface Finding {
  ruleId: string;
  field: string;
  severity: 'S0' | 'S1' | 'S2' | 'S3';
  message: string;
  reasonCode: string;
  pageNumber: number;
}

interface Fixture {
  id: string;
  name: string;
  description: string;
  expectedResult: 'pass' | 'fail';
  schemaVersion?: string;
  extractedFields: Record<string, unknown>;
  validatedFields: ValidatedField[];
  findings: Finding[];
}

// ============================================================
// Canonical Reason Codes
// ============================================================
const CANONICAL_REASON_CODES = new Set([
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
]);

const VALID_SEVERITIES = new Set(['S0', 'S1', 'S2', 'S3']);

// ============================================================
// Validation
// ============================================================
function validateFixture(fixture: Fixture): string[] {
  const errors: string[] = [];

  // Check required fields
  if (!fixture.id) errors.push('Missing required field: id');
  if (!fixture.name) errors.push('Missing required field: name');
  if (!fixture.expectedResult) errors.push('Missing required field: expectedResult');
  if (!fixture.validatedFields) errors.push('Missing required field: validatedFields');

  // Validate reason codes
  for (const field of fixture.validatedFields || []) {
    if (!CANONICAL_REASON_CODES.has(field.reasonCode)) {
      errors.push(`Invalid reasonCode "${field.reasonCode}" in validatedFields[${field.ruleId}]. Use canonical codes.`);
    }
    if (!VALID_SEVERITIES.has(field.severity)) {
      errors.push(`Invalid severity "${field.severity}" in validatedFields[${field.ruleId}]. Use S0-S3.`);
    }
  }

  for (const finding of fixture.findings || []) {
    if (!CANONICAL_REASON_CODES.has(finding.reasonCode)) {
      errors.push(`Invalid reasonCode "${finding.reasonCode}" in findings[${finding.ruleId}]. Use canonical codes.`);
    }
    if (!VALID_SEVERITIES.has(finding.severity)) {
      errors.push(`Invalid severity "${finding.severity}" in findings[${finding.ruleId}]. Use S0-S3.`);
    }
  }

  // Validate consistency between validatedFields and findings
  const failedFields = fixture.validatedFields?.filter(f => f.status === 'failed') || [];
  const findingRuleIds = new Set(fixture.findings?.map(f => f.ruleId) || []);

  for (const field of failedFields) {
    if (!findingRuleIds.has(field.ruleId)) {
      errors.push(`Failed field ${field.ruleId} has no corresponding finding.`);
    }
  }

  // Validate expectedResult consistency
  const hasFailures = failedFields.length > 0;
  if (fixture.expectedResult === 'pass' && hasFailures) {
    errors.push(`expectedResult is "pass" but validatedFields contains ${failedFields.length} failures.`);
  }
  if (fixture.expectedResult === 'fail' && !hasFailures) {
    errors.push(`expectedResult is "fail" but validatedFields contains no failures.`);
  }

  return errors;
}

// ============================================================
// Main
// ============================================================
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const verbose = args.includes('--verbose');
  const fixturePath = args.find(arg => !arg.startsWith('--'));

  if (!fixturePath) {
    console.error('Usage: pnpm exec tsx scripts/load-fixture.ts <fixture-path> [--dry-run] [--verbose]');
    console.error('');
    console.error('Example:');
    console.error('  pnpm exec tsx scripts/load-fixture.ts docs/testing/sandbox-fixtures/fixture_pass.json');
    process.exit(1);
  }

  // Resolve path
  const absolutePath = path.isAbsolute(fixturePath) 
    ? fixturePath 
    : path.resolve(process.cwd(), fixturePath);

  console.log('==================================================');
  console.log('  SANDBOX FIXTURE LOADER');
  console.log('==================================================');
  console.log(`  Mode: ${dryRun ? 'DRY RUN (validation only)' : 'LOAD'}`);
  console.log(`  File: ${absolutePath}`);
  console.log('==================================================');
  console.log('');

  // Check file exists
  if (!fs.existsSync(absolutePath)) {
    console.error(`❌ ERROR: File not found: ${absolutePath}`);
    process.exit(1);
  }

  // Read and parse fixture
  let fixture: Fixture;
  try {
    const content = fs.readFileSync(absolutePath, 'utf-8');
    fixture = JSON.parse(content);
  } catch (error) {
    console.error(`❌ ERROR: Failed to parse JSON: ${error}`);
    process.exit(1);
  }

  // Validate fixture
  console.log('--- Validating fixture ---');
  const errors = validateFixture(fixture);

  if (errors.length > 0) {
    console.error('❌ VALIDATION FAILED:');
    for (const error of errors) {
      console.error(`   - ${error}`);
    }
    process.exit(1);
  }

  console.log('✅ Fixture is valid');
  console.log('');

  if (verbose) {
    console.log('--- Fixture Summary ---');
    console.log(`  ID: ${fixture.id}`);
    console.log(`  Name: ${fixture.name}`);
    console.log(`  Expected Result: ${fixture.expectedResult}`);
    console.log(`  Validated Fields: ${fixture.validatedFields.length}`);
    console.log(`  Findings: ${fixture.findings.length}`);
    console.log('');
  }

  if (dryRun) {
    console.log('--- Dry run complete (no data loaded) ---');
    process.exit(0);
  }

  // Load fixture
  console.log('--- Loading fixture ---');
  
  // For now, we output the fixture in a format that can be used with the API
  // In a full implementation, this would call the API or directly insert into DB
  const auditRecord = {
    id: Date.now(),
    fixtureId: fixture.id,
    name: fixture.name,
    status: fixture.expectedResult === 'pass' ? 'APPROVED' : 'PENDING_REVIEW',
    extractedFields: fixture.extractedFields,
    validatedFields: fixture.validatedFields,
    findings: fixture.findings,
    createdAt: new Date().toISOString(),
    source: 'FIXTURE_LOADER',
  };

  // Write to a temp file that can be imported
  const outputPath = path.join(process.cwd(), 'logs', 'loaded-fixture.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(auditRecord, null, 2));

  console.log(`✅ Fixture loaded successfully`);
  console.log(`   Output: ${outputPath}`);
  console.log('');
  console.log('--- Next Steps ---');
  console.log('1. Start the sandbox server: ./scripts/sandbox-start.sh');
  console.log('2. Open the UI and navigate to the audit list');
  console.log('3. The loaded fixture should appear in the list');
  console.log('');
}

main().catch(error => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});
