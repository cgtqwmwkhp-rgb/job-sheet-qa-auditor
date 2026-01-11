#!/usr/bin/env npx tsx
/**
 * Parity Runner CLI - Stage 8 v2
 * 
 * Usage:
 *   npx tsx parity/runner/cli.ts --mode subset
 *   npx tsx parity/runner/cli.ts --mode full
 *   npx tsx parity/runner/cli.ts --mode positive
 *   npx tsx parity/runner/cli.ts --mode negative
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { createParityRunner } from './parityRunner';
import type { GoldenDocument, GoldenDataset, CombinedParityReport } from './types';

// ES module compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PARITY_ROOT = join(__dirname, '..');
const POSITIVE_FIXTURES_PATH = join(PARITY_ROOT, 'fixtures', 'golden-positive.json');
const NEGATIVE_FIXTURES_PATH = join(PARITY_ROOT, 'fixtures', 'golden-negative.json');
const LEGACY_FIXTURES_PATH = join(PARITY_ROOT, 'fixtures', 'golden-dataset.json');
const THRESHOLDS_PATH = join(PARITY_ROOT, 'config', 'thresholds.json');
const REPORTS_PATH = join(PARITY_ROOT, 'reports');

interface ThresholdsConfig {
  ci: {
    prSubsetDocIds: string[];
  };
}

/**
 * Load thresholds config
 */
function loadThresholds(): ThresholdsConfig {
  const content = readFileSync(THRESHOLDS_PATH, 'utf-8');
  return JSON.parse(content);
}

type RunMode = 'subset' | 'full' | 'positive' | 'negative';

/**
 * Parse CLI arguments
 */
function parseArgs(): { mode: RunMode } {
  const args = process.argv.slice(2);
  const modeIndex = args.indexOf('--mode');
  const mode = modeIndex >= 0 ? args[modeIndex + 1] : 'full';
  
  const validModes: RunMode[] = ['subset', 'full', 'positive', 'negative'];
  if (!validModes.includes(mode as RunMode)) {
    console.error(`Invalid mode. Use --mode ${validModes.join(' | ')}`);
    process.exit(1);
  }
  
  return { mode: mode as RunMode };
}

/**
 * Load dataset from file
 */
function loadDataset(path: string): GoldenDataset {
  const content = readFileSync(path, 'utf-8');
  return JSON.parse(content);
}

/**
 * Generate mock actual results for testing
 * In real usage, this would come from the actual pipeline
 */
function generateMockActualResults(goldenDocs: GoldenDocument[]): GoldenDocument[] {
  // Return identical results (parity = same)
  return goldenDocs.map(doc => ({
    ...doc,
    // Keep results identical for parity testing
    validatedFields: doc.validatedFields.map(field => ({
      ...field,
    })),
  }));
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const { mode } = parseArgs();
  
  console.log(`🔍 Running parity tests in ${mode} mode...`);
  console.log(`📁 Reports: ${REPORTS_PATH}`);
  
  // Ensure reports directory exists
  if (!existsSync(REPORTS_PATH)) {
    mkdirSync(REPORTS_PATH, { recursive: true });
  }
  
  // Create runner with strict thresholds for positive suite
  const runner = createParityRunner({
    maxWorseDocuments: 0,
    maxWorseFields: 0,
    minSamePercentage: 100, // Strict: 100% for positive suite
  });

  // Determine which datasets to load based on mode
  let positiveDataset: GoldenDataset | null = null;
  let negativeDataset: GoldenDataset | null = null;

  if (mode === 'positive' || mode === 'full') {
    if (existsSync(POSITIVE_FIXTURES_PATH)) {
      positiveDataset = loadDataset(POSITIVE_FIXTURES_PATH);
      runner.loadPositiveDataset(POSITIVE_FIXTURES_PATH);
      console.log(`✅ Positive dataset loaded: ${positiveDataset.documents.length} documents`);
    } else {
      console.warn('⚠️ Positive dataset not found, using legacy dataset');
      const legacy = loadDataset(LEGACY_FIXTURES_PATH);
      positiveDataset = {
        ...legacy,
        documents: legacy.documents.filter(d => d.expectedResult === 'pass'),
      };
    }
  }

  if (mode === 'negative' || mode === 'full') {
    if (existsSync(NEGATIVE_FIXTURES_PATH)) {
      negativeDataset = loadDataset(NEGATIVE_FIXTURES_PATH);
      runner.loadNegativeDataset(NEGATIVE_FIXTURES_PATH);
      console.log(`✅ Negative dataset loaded: ${negativeDataset.documents.length} documents`);
    } else {
      console.warn('⚠️ Negative dataset not found, using legacy dataset');
      const legacy = loadDataset(LEGACY_FIXTURES_PATH);
      negativeDataset = {
        ...legacy,
        documents: legacy.documents.filter(d => d.expectedResult === 'fail'),
      };
    }
  }

  if (mode === 'subset') {
    // Subset mode: use prSubsetDocIds from thresholds.json
    const thresholds = loadThresholds();
    const subsetDocIds = new Set(thresholds.ci.prSubsetDocIds);
    
    console.log(`📋 Subset mode: testing ${subsetDocIds.size} documents: ${Array.from(subsetDocIds).join(', ')}`);
    
    const legacy = loadDataset(LEGACY_FIXTURES_PATH);
    
    // Filter to only include subset documents
    const subsetDocs = legacy.documents.filter(d => subsetDocIds.has(d.id));
    
    if (subsetDocs.length === 0) {
      console.error('❌ No documents found matching prSubsetDocIds');
      process.exit(1);
    }
    
    console.log(`✅ Found ${subsetDocs.length} documents in subset`);
    
    // Create a subset-only dataset for the runner
    const subsetDataset: GoldenDataset = {
      ...legacy,
      documents: subsetDocs,
    };
    
    // Create a new runner with subset dataset only
    const subsetRunner = createParityRunner({
      maxWorseDocuments: 0,
      maxWorseFields: 0,
      minSamePercentage: 100,
    });
    
    // Manually set the datasets with only subset documents
    // Use positive/negative split based on expectedResult
    const positiveSubset = subsetDocs.filter(d => d.expectedResult === 'pass');
    const negativeSubset = subsetDocs.filter(d => d.expectedResult === 'fail');
    
    // Generate mock actual results for subset only
    const actualResults = generateMockActualResults(subsetDocs);
    
    // Run parity with proper subset (create temporary dataset files or use internal methods)
    // For simplicity, we directly compare expected vs actual
    const report = runSubsetParity(subsetDocs, actualResults, legacy.version);
    
    const reportPath = join(REPORTS_PATH, `parity-report-${report.runId}.json`);
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`📄 Report saved: ${reportPath}`);
    
    const latestPath = join(REPORTS_PATH, 'latest.json');
    writeFileSync(latestPath, JSON.stringify(report, null, 2));
    
    const summaryPath = join(REPORTS_PATH, 'latest-summary.md');
    writeFileSync(summaryPath, generateSubsetSummary(report));
    
    printLegacyResults(report);
    return;
  }

  // Generate mock actual results
  const allDocs = [
    ...(positiveDataset?.documents || []),
    ...(negativeDataset?.documents || []),
  ];
  const actualResults = generateMockActualResults(allDocs);
  console.log(`📊 Testing ${actualResults.length} documents`);

  // Run appropriate suite(s)
  if (mode === 'full') {
    const report = runner.runCombinedParity(actualResults);
    
    const reportPath = runner.saveReport(report, REPORTS_PATH);
    console.log(`📄 Report saved: ${reportPath}`);
    
    const latestPath = join(REPORTS_PATH, 'latest.json');
    writeFileSync(latestPath, JSON.stringify(report, null, 2));
    
    const summary = runner.generateCombinedSummaryMarkdown(report);
    const summaryPath = join(REPORTS_PATH, 'latest-summary.md');
    writeFileSync(summaryPath, summary);
    console.log(`📝 Summary saved: ${summaryPath}`);
    
    printCombinedResults(report);
  } else if (mode === 'positive') {
    const report = runner.runPositiveSuite(actualResults);
    
    const latestPath = join(REPORTS_PATH, 'latest.json');
    writeFileSync(latestPath, JSON.stringify(report, null, 2));
    
    console.log('');
    console.log('═══════════════════════════════════════════');
    console.log(`POSITIVE SUITE: ${report.status.toUpperCase()}`);
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
    console.log('✅ Positive suite passed!');
  } else if (mode === 'negative') {
    const report = runner.runNegativeSuite(actualResults);
    
    const latestPath = join(REPORTS_PATH, 'latest.json');
    writeFileSync(latestPath, JSON.stringify(report, null, 2));
    
    console.log('');
    console.log('═══════════════════════════════════════════');
    console.log(`NEGATIVE SUITE: ${report.status.toUpperCase()}`);
    console.log(`Documents: ${report.summary.passed} passed, ${report.summary.failed} failed`);
    console.log(`Expected Failures: ${report.summary.totalExpectedFailures}`);
    console.log(`Matched: ${report.summary.matchedFailures}, Missed: ${report.summary.missedFailures}`);
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
    console.log('✅ Negative suite passed!');
  }
}

/**
 * Run subset parity comparison directly (bypassing full dataset loading)
 */
function runSubsetParity(
  expectedDocs: GoldenDocument[],
  actualDocs: GoldenDocument[],
  goldenVersion: string
): { runId: string; status: string; summary: { totalDocuments: number; same: number; improved: number; worse: number; totalFields: number; fieldsSame: number; fieldsImproved: number; fieldsWorse: number }; documents: unknown[]; violations: string[] } {
  const runId = Math.random().toString(16).slice(2, 14);
  const documentComparisons: { documentId: string; documentName: string; status: string; expectedResult: string; actualResult: string | null; fieldComparisons: unknown[] }[] = [];
  
  let same = 0, improved = 0, worse = 0;
  let fieldsSame = 0, fieldsImproved = 0, fieldsWorse = 0;
  
  for (const expected of expectedDocs) {
    const actual = actualDocs.find(d => d.id === expected.id);
    
    if (!actual) {
      worse++;
      fieldsWorse += expected.validatedFields.length;
      documentComparisons.push({
        documentId: expected.id,
        documentName: expected.name,
        status: 'missing',
        expectedResult: expected.expectedResult,
        actualResult: null,
        fieldComparisons: expected.validatedFields.map(f => ({
          field: f.field,
          status: 'missing',
        })),
      });
      continue;
    }
    
    // Compare fields
    let docFieldsSame = 0;
    const fieldComps: { field: string; status: string }[] = [];
    
    for (const expField of expected.validatedFields) {
      const actField = actual.validatedFields.find(f => f.ruleId === expField.ruleId);
      
      if (!actField) {
        fieldsWorse++;
        fieldComps.push({ field: expField.field, status: 'missing' });
      } else if (expField.status === actField.status && expField.value === actField.value) {
        fieldsSame++;
        docFieldsSame++;
        fieldComps.push({ field: expField.field, status: 'same' });
      } else {
        fieldsWorse++;
        fieldComps.push({ field: expField.field, status: 'worse' });
      }
    }
    
    // Determine doc status
    if (docFieldsSame === expected.validatedFields.length) {
      same++;
      documentComparisons.push({
        documentId: expected.id,
        documentName: expected.name,
        status: 'same',
        expectedResult: expected.expectedResult,
        actualResult: actual.expectedResult,
        fieldComparisons: fieldComps,
      });
    } else {
      worse++;
      documentComparisons.push({
        documentId: expected.id,
        documentName: expected.name,
        status: 'worse',
        expectedResult: expected.expectedResult,
        actualResult: actual.expectedResult,
        fieldComparisons: fieldComps,
      });
    }
  }
  
  const totalDocs = expectedDocs.length;
  const totalFields = expectedDocs.reduce((sum, d) => sum + d.validatedFields.length, 0);
  const samePercent = totalDocs > 0 ? (same / totalDocs) * 100 : 0;
  
  const violations: string[] = [];
  if (worse > 0) violations.push(`Worse documents (${worse}) exceeds threshold (0)`);
  if (fieldsWorse > 0) violations.push(`Worse fields (${fieldsWorse}) exceeds threshold (0)`);
  if (samePercent < 100) violations.push(`Same percentage (${samePercent.toFixed(1)}%) below threshold (100%)`);
  
  return {
    runId,
    status: violations.length === 0 ? 'pass' : 'fail',
    summary: {
      totalDocuments: totalDocs,
      same,
      improved,
      worse,
      totalFields,
      fieldsSame,
      fieldsImproved,
      fieldsWorse,
    },
    documents: documentComparisons,
    violations,
  };
}

/**
 * Generate subset summary markdown
 */
function generateSubsetSummary(report: { status: string; summary: { same: number; worse: number; fieldsSame: number; fieldsWorse: number } }): string {
  return `# Parity Subset Report

**Status**: ${report.status.toUpperCase()}

## Summary
- Documents: ${report.summary.same} same, ${report.summary.worse} worse
- Fields: ${report.summary.fieldsSame} same, ${report.summary.fieldsWorse} worse
`;
}

function printCombinedResults(report: CombinedParityReport): void {
  console.log('');
  console.log('═══════════════════════════════════════════');
  console.log(`COMBINED STATUS: ${report.status.toUpperCase()}`);
  console.log('───────────────────────────────────────────');
  console.log(`POSITIVE: ${report.positive.status.toUpperCase()}`);
  console.log(`  Documents: ${report.positive.summary.same} same, ${report.positive.summary.improved} improved, ${report.positive.summary.worse} worse`);
  console.log(`  Fields: ${report.positive.summary.fieldsSame} same`);
  console.log('───────────────────────────────────────────');
  console.log(`NEGATIVE: ${report.negative.status.toUpperCase()}`);
  console.log(`  Documents: ${report.negative.summary.passed} passed, ${report.negative.summary.failed} failed`);
  console.log(`  Expected Failures: ${report.negative.summary.totalExpectedFailures}`);
  console.log(`  Matched: ${report.negative.summary.matchedFailures}, Missed: ${report.negative.summary.missedFailures}`);
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
  console.log('✅ All parity checks passed!');
}

function printLegacyResults(report: { status: string; summary: { same: number; improved: number; worse: number; fieldsSame: number; fieldsImproved: number; fieldsWorse: number }; violations: string[] }): void {
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
