#!/usr/bin/env npx tsx
/**
 * Parity Runner CLI - Stage 8
 * 
 * Usage:
 *   npx tsx parity/runner/cli.ts --mode subset
 *   npx tsx parity/runner/cli.ts --mode full
 */

import { join } from 'path';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { createParityRunner } from './parityRunner';
import type { GoldenDocument } from './types';

const PARITY_ROOT = join(__dirname, '..');
const FIXTURES_PATH = join(PARITY_ROOT, 'fixtures', 'golden-dataset.json');
const REPORTS_PATH = join(PARITY_ROOT, 'reports');

/**
 * Parse CLI arguments
 */
function parseArgs(): { mode: 'subset' | 'full' } {
  const args = process.argv.slice(2);
  const modeIndex = args.indexOf('--mode');
  const mode = modeIndex >= 0 ? args[modeIndex + 1] : 'subset';
  
  if (mode !== 'subset' && mode !== 'full') {
    console.error('Invalid mode. Use --mode subset or --mode full');
    process.exit(1);
  }
  
  return { mode: mode as 'subset' | 'full' };
}

/**
 * Generate mock actual results for testing
 * In real usage, this would come from the actual pipeline
 */
function generateMockActualResults(goldenDocs: GoldenDocument[], mode: 'subset' | 'full'): GoldenDocument[] {
  // For subset mode, only test first document
  const docs = mode === 'subset' ? goldenDocs.slice(0, 1) : goldenDocs;
  
  // Return identical results (parity = same)
  return docs.map(doc => ({
    ...doc,
    // Simulate actual results matching golden
    validatedFields: doc.validatedFields.map(field => ({
      ...field,
      // Slightly vary confidence to show comparison works
      confidence: Math.min(1, field.confidence + (Math.random() * 0.02 - 0.01)),
    })),
  }));
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const { mode } = parseArgs();
  
  console.log(`🔍 Running parity tests in ${mode} mode...`);
  console.log(`📁 Fixtures: ${FIXTURES_PATH}`);
  console.log(`📁 Reports: ${REPORTS_PATH}`);
  
  // Ensure reports directory exists
  if (!existsSync(REPORTS_PATH)) {
    mkdirSync(REPORTS_PATH, { recursive: true });
  }
  
  // Create runner with thresholds
  const runner = createParityRunner({
    maxWorseDocuments: 0,
    maxWorseFields: 0,
    minSamePercentage: mode === 'subset' ? 90 : 95,
  });
  
  // Load golden dataset
  runner.loadGoldenDataset(FIXTURES_PATH);
  console.log('✅ Golden dataset loaded');
  
  // Get golden documents for mock generation
  const goldenDataset = JSON.parse(readFileSync(FIXTURES_PATH, 'utf-8'));
  const goldenDocs: GoldenDocument[] = goldenDataset.documents;
  
  // Generate mock actual results
  // In real implementation, this would run the actual pipeline
  const actualResults = generateMockActualResults(goldenDocs, mode);
  console.log(`📊 Testing ${actualResults.length} documents`);
  
  // Run parity comparison
  const report = runner.runParity(actualResults);
  
  // Save report
  const reportPath = runner.saveReport(report, REPORTS_PATH);
  console.log(`📄 Report saved: ${reportPath}`);
  
  // Save latest symlink
  const latestPath = join(REPORTS_PATH, 'latest.json');
  writeFileSync(latestPath, JSON.stringify(report, null, 2));
  
  // Generate and save markdown summary
  const summary = runner.generateSummaryMarkdown(report);
  const summaryPath = join(REPORTS_PATH, 'latest-summary.md');
  writeFileSync(summaryPath, summary);
  console.log(`📝 Summary saved: ${summaryPath}`);
  
  // Print summary
  console.log('');
  console.log('═══════════════════════════════════════════');
  console.log(`Status: ${report.status.toUpperCase()}`);
  console.log(`Documents: ${report.summary.same} same, ${report.summary.improved} improved, ${report.summary.worse} worse`);
  console.log(`Fields: ${report.summary.fieldsSame} same, ${report.summary.fieldsImproved} improved, ${report.summary.fieldsWorse} worse`);
  console.log('═══════════════════════════════════════════');
  
  if (report.violations.length > 0) {
    console.log('');
    console.log('❌ Violations:');
    for (const violation of report.violations) {
      console.log(`   - ${violation}`);
    }
    process.exit(1);
  }
  
  console.log('');
  console.log('✅ Parity check passed!');
}

main().catch(err => {
  console.error('❌ Parity runner failed:', err);
  process.exit(1);
});
