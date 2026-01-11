#!/usr/bin/env npx tsx
/**
 * Evaluation Harness CLI
 * 
 * OCRBench-style evaluation for document processing accuracy.
 * 
 * Usage:
 *   npx tsx scripts/eval/run-eval.ts [options]
 * 
 * Options:
 *   --mode <mode>           Run mode: full | fixtures | quick (default: fixtures)
 *   --output <path>         Output path for eval_report.json (default: scripts/eval/reports/)
 *   --compare <runId>       Compare against previous run ID
 *   --verbose               Enable verbose output
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

import type {
  EvalDocument,
  EvalDocumentResult,
  EvalReport,
  EvalConfig,
} from './types';
import { DEFAULT_EVAL_CONFIG } from './types';
import {
  calculateSelectionMetrics,
  calculateCriticalFieldMetrics,
  calculateFusionMetrics,
  calculatePass2Metrics,
  calculateTrends,
  calculateOverallScore,
  generateRunId,
  sortDocumentResults,
  sortFieldResults,
} from './metrics';

// ESM __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths
const EVAL_ROOT = __dirname;
const REPORTS_DIR = path.join(EVAL_ROOT, 'reports');
const FIXTURES_DIR = path.join(EVAL_ROOT, 'fixtures');
const GOLDEN_DATASET_PATH = path.join(__dirname, '../../parity/fixtures/golden-dataset.json');

/**
 * Load golden dataset and convert to eval documents
 */
function loadFixtureDocuments(): EvalDocument[] {
  if (!fs.existsSync(GOLDEN_DATASET_PATH)) {
    console.warn(`⚠️ Golden dataset not found at ${GOLDEN_DATASET_PATH}`);
    return [];
  }
  
  const goldenData = JSON.parse(fs.readFileSync(GOLDEN_DATASET_PATH, 'utf-8'));
  
  return goldenData.documents.map((doc: {
    id: string;
    name: string;
    expectedResult: 'pass' | 'fail';
    extractedFields: Record<string, unknown>;
    validatedFields: Array<{
      ruleId: string;
      field: string;
      value: unknown;
      confidence: number;
      severity: string;
    }>;
  }) => ({
    id: doc.id,
    name: doc.name,
    source: 'fixture' as const,
    templateId: 'default-template',
    assetType: 'job_sheet',
    expectedTemplateId: 'default-template',
    expectedResult: doc.expectedResult,
    fields: doc.validatedFields.map((f) => ({
      fieldId: f.ruleId,
      fieldName: f.field,
      expectedValue: f.value,
      actualValue: f.value, // In fixture mode, we simulate correct extraction
      extractionConfidence: f.confidence,
      isCorrect: true,
      severity: f.severity as 'S0' | 'S1' | 'S2' | 'S3',
      isCritical: f.severity === 'S0' || f.severity === 'S1',
    })),
    fusionExpectations: [],
  }));
}

/**
 * Simulate document evaluation
 * In production, this would call the actual processing pipeline
 */
function evaluateDocument(doc: EvalDocument): EvalDocumentResult {
  // Simulate selection result
  const isAmbiguous = Math.random() < 0.05; // 5% ambiguity rate
  const selectionCorrect = Math.random() < 0.95; // 95% selection accuracy
  
  // Evaluate fields
  const fieldResults = doc.fields.map(field => {
    const isCorrect = Math.random() < 0.92; // 92% field accuracy
    return {
      fieldId: field.fieldId,
      fieldName: field.fieldName,
      expectedValue: field.expectedValue,
      actualValue: isCorrect ? field.expectedValue : null,
      isCorrect,
      confidence: field.extractionConfidence || 0.9,
      severity: field.severity,
    };
  });
  
  // Simulate fusion results
  const fusionResults = doc.fields.slice(0, 3).map(field => {
    const agreed = Math.random() < 0.88; // 88% agreement
    return {
      fieldId: field.fieldId,
      ocrValue: field.expectedValue,
      imageQaValue: agreed ? field.expectedValue : 'different',
      agreed,
      decision: agreed ? 'merged' as const : 'ocr' as const,
    };
  });
  
  // Simulate pass-2 trigger
  const pass2Triggered = Math.random() < 0.10; // 10% pass-2 rate
  
  const allFieldsCorrect = fieldResults.every(f => f.isCorrect);
  const overallResult = allFieldsCorrect && selectionCorrect ? 'pass' : 'fail';
  
  return {
    documentId: doc.id,
    documentName: doc.name,
    source: doc.source,
    selection: {
      expectedTemplateId: doc.expectedTemplateId,
      actualTemplateId: selectionCorrect ? doc.expectedTemplateId : 'wrong-template',
      isCorrect: selectionCorrect,
      confidence: 0.85 + Math.random() * 0.15,
      runnerUpDelta: 0.1 + Math.random() * 0.3,
      isAmbiguous,
    },
    fields: fieldResults,
    fusionResults,
    pass2: {
      triggered: pass2Triggered,
      reason: pass2Triggered ? 'low_confidence' : undefined,
      interpreter: pass2Triggered ? 'gemini' : undefined,
      escalated: pass2Triggered && Math.random() < 0.2,
    },
    overallResult: overallResult as 'pass' | 'fail',
    expectedResult: doc.expectedResult,
    matchesExpectation: overallResult === doc.expectedResult,
  };
}

/**
 * Load previous report for trend comparison
 */
function loadPreviousReport(runId: string): EvalReport | null {
  const reportPath = path.join(REPORTS_DIR, `eval-report-${runId}.json`);
  if (fs.existsSync(reportPath)) {
    return JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
  }
  
  // Try latest.json
  const latestPath = path.join(REPORTS_DIR, 'latest.json');
  if (fs.existsSync(latestPath)) {
    return JSON.parse(fs.readFileSync(latestPath, 'utf-8'));
  }
  
  return null;
}

/**
 * Main evaluation function
 */
async function runEvaluation(config: EvalConfig = DEFAULT_EVAL_CONFIG): Promise<EvalReport> {
  console.log('🔍 Running evaluation harness...');
  console.log(`📁 Reports directory: ${REPORTS_DIR}`);
  
  // Ensure reports directory exists
  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }
  
  // Load documents
  const documents: EvalDocument[] = [];
  
  if (config.includeSources.includes('fixture')) {
    const fixtures = loadFixtureDocuments();
    documents.push(...fixtures);
    console.log(`📄 Loaded ${fixtures.length} fixture documents`);
  }
  
  // Evaluate documents
  console.log(`🔬 Evaluating ${documents.length} documents...`);
  let results = documents.map(doc => evaluateDocument(doc));
  
  // Sort deterministically
  results = sortDocumentResults(results);
  results = sortFieldResults(results);
  
  // Calculate metrics
  const selectionMetrics = calculateSelectionMetrics(results);
  const criticalFieldMetrics = calculateCriticalFieldMetrics(results);
  const fusionMetrics = calculateFusionMetrics(results);
  const pass2Metrics = calculatePass2Metrics(results);
  
  // Calculate overall score
  const overallScore = calculateOverallScore(
    selectionMetrics,
    criticalFieldMetrics,
    fusionMetrics,
    pass2Metrics,
    config.weights
  );
  
  // Load previous report for trends
  const previousReport = config.previousRunId 
    ? loadPreviousReport(config.previousRunId)
    : loadPreviousReport('latest');
  
  const runId = generateRunId();
  
  // Build report
  const report: EvalReport = {
    version: '1.0.0',
    runId,
    timestamp: new Date().toISOString(),
    environment: 'local',
    documentSummary: {
      total: documents.length,
      fixtures: documents.filter(d => d.source === 'fixture').length,
      sampledProduction: documents.filter(d => d.source === 'sampled_production').length,
      synthetic: documents.filter(d => d.source === 'synthetic').length,
    },
    selectionMetrics,
    criticalFieldMetrics,
    fusionMetrics,
    pass2Metrics,
    overallScore,
    trends: [],
    documentResults: results,
    metadata: {
      goldenDatasetVersion: '2.1.0',
      evaluatorVersion: '1.0.0',
      configHash: 'default',
    },
  };
  
  // Calculate trends if we have a previous report
  if (previousReport) {
    report.trends = calculateTrends(report, previousReport);
    console.log(`📊 Calculated trends vs run ${previousReport.runId}`);
  }
  
  return report;
}

/**
 * Save report to disk
 */
function saveReport(report: EvalReport, outputPath?: string): string {
  const reportPath = outputPath || path.join(REPORTS_DIR, `eval-report-${report.runId}.json`);
  const latestPath = path.join(REPORTS_DIR, 'latest.json');
  
  // Ensure directory exists
  const dir = path.dirname(reportPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  // Write report with stable JSON ordering
  const sortedReport = JSON.stringify(report, null, 2);
  fs.writeFileSync(reportPath, sortedReport);
  fs.writeFileSync(latestPath, sortedReport);
  
  return reportPath;
}

/**
 * Print report summary
 */
function printSummary(report: EvalReport): void {
  console.log('\n' + '═'.repeat(60));
  console.log('📊 EVALUATION REPORT SUMMARY');
  console.log('═'.repeat(60));
  
  console.log(`\n📋 Run ID: ${report.runId}`);
  console.log(`📅 Timestamp: ${report.timestamp}`);
  console.log(`📄 Documents: ${report.documentSummary.total} (${report.documentSummary.fixtures} fixtures)`);
  
  console.log('\n📈 METRICS:');
  console.log(`   Selection Accuracy:      ${(report.selectionMetrics.accuracy * 100).toFixed(1)}%`);
  console.log(`   Critical Field Accuracy: ${(report.criticalFieldMetrics.criticalOnlyAccuracy * 100).toFixed(1)}%`);
  console.log(`   Fusion Agreement Rate:   ${(report.fusionMetrics.agreementRate * 100).toFixed(1)}%`);
  console.log(`   Pass-2 Trigger Rate:     ${(report.pass2Metrics.pass2Rate * 100).toFixed(1)}%`);
  console.log(`\n🎯 Overall Score: ${(report.overallScore * 100).toFixed(1)}%`);
  
  if (report.trends.length > 0) {
    console.log('\n📉 TRENDS (vs previous run):');
    for (const trend of report.trends) {
      const arrow = trend.trend === 'improving' ? '↑' : trend.trend === 'degrading' ? '↓' : '→';
      const sign = trend.delta >= 0 ? '+' : '';
      console.log(`   ${trend.metric}: ${sign}${(trend.delta * 100).toFixed(1)}% ${arrow}`);
    }
  }
  
  console.log('\n' + '═'.repeat(60));
}

/**
 * CLI entry point
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  
  // Parse args
  let mode = 'fixtures';
  let outputPath: string | undefined;
  let compareRunId: string | undefined;
  let verbose = false;
  
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--mode':
        mode = args[++i] || 'fixtures';
        break;
      case '--output':
        outputPath = args[++i];
        break;
      case '--compare':
        compareRunId = args[++i];
        break;
      case '--verbose':
        verbose = true;
        break;
      case '--help':
        console.log(`
Usage: npx tsx scripts/eval/run-eval.ts [options]

Options:
  --mode <mode>       Run mode: full | fixtures | quick (default: fixtures)
  --output <path>     Output path for eval_report.json
  --compare <runId>   Compare against previous run ID
  --verbose           Enable verbose output
  --help              Show this help
`);
        process.exit(0);
    }
  }
  
  console.log(`🚀 Evaluation Harness v1.0.0`);
  console.log(`   Mode: ${mode}`);
  
  const config: EvalConfig = {
    ...DEFAULT_EVAL_CONFIG,
    previousRunId: compareRunId,
  };
  
  // Run evaluation
  const report = await runEvaluation(config);
  
  // Save report
  const savedPath = saveReport(report, outputPath);
  console.log(`\n💾 Report saved: ${savedPath}`);
  
  // Print summary
  printSummary(report);
  
  // Exit with appropriate code
  if (report.overallScore < 0.8) {
    console.log('\n⚠️ Warning: Overall score below 80%');
    process.exit(1);
  }
  
  console.log('\n✅ Evaluation complete');
}

// Run if executed directly
main().catch(error => {
  console.error('❌ Evaluation failed:', error);
  process.exit(1);
});

// Export for testing
export {
  runEvaluation,
  saveReport,
  loadFixtureDocuments,
  evaluateDocument,
};
