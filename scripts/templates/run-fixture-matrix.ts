#!/usr/bin/env tsx
/**
 * Fixture Matrix Runner Script
 * 
 * PR-E: CLI tool for running fixture tests against template versions.
 * 
 * Usage:
 *   pnpm tsx scripts/templates/run-fixture-matrix.ts --versionId=1
 *   pnpm tsx scripts/templates/run-fixture-matrix.ts --versionId=1 --output=artifacts/templates/
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

// Type definitions for standalone script
interface FixtureCase {
  caseId: string;
  description: string;
  inputText: string;
  expectedOutcome: 'pass' | 'fail' | 'review_queue';
  expectedReasonCodes?: string[];
  expectedFields?: Record<string, string>;
  required: boolean;
}

interface FixtureCaseResult {
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

interface FixtureRunReport {
  reportVersion: '1.0.0';
  templateVersionId: number;
  packHash: string;
  runAt: string;
  overallResult: 'PASS' | 'FAIL';
  totalCases: number;
  passedCases: number;
  failedCases: number;
  requiredCasesFailed: number;
  results: FixtureCaseResult[];
  durationMs: number;
}

/**
 * Parse command line arguments
 */
function parseArgs(): { versionId: number; outputDir: string } {
  const args = process.argv.slice(2);
  let versionId: number | undefined;
  let outputDir = 'artifacts/templates';

  for (const arg of args) {
    if (arg.startsWith('--versionId=')) {
      versionId = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--output=')) {
      outputDir = arg.split('=')[1];
    }
  }

  if (!versionId) {
    console.error('Usage: run-fixture-matrix.ts --versionId=<id> [--output=<dir>]');
    process.exit(1);
  }

  return { versionId, outputDir };
}

/**
 * Main entry point
 */
async function main() {
  const { versionId, outputDir } = parseArgs();

  console.log(`🧪 Running fixture matrix for template version ${versionId}`);
  console.log(`📁 Output directory: ${outputDir}`);

  // Import registry dynamically to allow script to be run standalone
  const { 
    getTemplateVersion, 
    runFixtureMatrix, 
    hasFixturePack 
  } = await import('../../server/services/templateRegistry');

  const version = getTemplateVersion(versionId);
  if (!version) {
    console.error(`❌ Template version ${versionId} not found`);
    process.exit(1);
  }

  if (!hasFixturePack(versionId)) {
    console.error(`❌ No fixture pack found for template version ${versionId}`);
    console.error('   Create fixtures first using createFixturePack()');
    process.exit(1);
  }

  // Run fixture matrix
  const report = runFixtureMatrix(
    versionId,
    version.specJson,
    version.selectionConfigJson
  );

  // Ensure output directory exists
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  // Write report
  const reportPath = join(outputDir, `fixture_report_${versionId}.json`);
  writeFileSync(reportPath, JSON.stringify(report, null, 2));

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log(`📊 FIXTURE REPORT - Template Version ${versionId}`);
  console.log('='.repeat(60));
  console.log(`Overall Result: ${report.overallResult === 'PASS' ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Total Cases: ${report.totalCases}`);
  console.log(`Passed: ${report.passedCases}`);
  console.log(`Failed: ${report.failedCases}`);
  console.log(`Required Failed: ${report.requiredCasesFailed}`);
  console.log(`Duration: ${report.durationMs}ms`);
  console.log('='.repeat(60));

  // Print individual results
  for (const result of report.results) {
    const status = result.passed ? '✅' : '❌';
    console.log(`${status} ${result.caseId}: ${result.description}`);
    if (!result.passed && result.errors.length > 0) {
      for (const error of result.errors) {
        console.log(`   ⚠️  ${error}`);
      }
    }
  }

  console.log('\n📄 Report written to:', reportPath);

  // Exit with appropriate code
  process.exit(report.overallResult === 'PASS' ? 0 : 1);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
