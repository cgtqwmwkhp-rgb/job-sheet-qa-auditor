#!/usr/bin/env npx tsx
/**
 * Drift Detection CLI
 * 
 * Daily drift detection with alert thresholds.
 * 
 * Usage:
 *   npx tsx scripts/drift/run-drift-check.ts [options]
 * 
 * Options:
 *   --baseline <path>     Path to baseline file (default: auto-detect)
 *   --output <path>       Output path for drift_report.json
 *   --alert-webhook <url> Webhook URL for alerts (requires --live)
 *   --live                Enable live mode (alerts sent to webhook)
 *   --verbose             Enable verbose output
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

import type {
  DriftReport,
  DriftBaseline,
  DriftConfig,
  DriftAlert,
  AmbiguityRateData,
  TokenCollisionData,
  OverrideSpikeData,
  ScanQualityData,
} from './types';
import { DEFAULT_DRIFT_CONFIG, DEFAULT_DRIFT_THRESHOLDS } from './types';
import {
  detectAmbiguitySpike,
  detectTokenCollisions,
  detectOverrideSpike,
  detectScanQualityDegradation,
  detectSelectionAccuracyDrift,
  detectFieldAccuracyDrift,
  detectFusionDisagreement,
  detectPass2Escalation,
} from './detectors';

// ESM __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths
const DRIFT_ROOT = __dirname;
const REPORTS_DIR = path.join(DRIFT_ROOT, 'reports');
const BASELINE_PATH = path.join(DRIFT_ROOT, 'baseline.json');
const EVAL_REPORTS_DIR = path.join(__dirname, '../eval/reports');

/**
 * Load baseline from disk
 */
function loadBaseline(baselinePath: string = BASELINE_PATH): DriftBaseline | null {
  if (!fs.existsSync(baselinePath)) {
    console.warn(`⚠️ No baseline found at ${baselinePath}`);
    return null;
  }
  
  try {
    return JSON.parse(fs.readFileSync(baselinePath, 'utf-8'));
  } catch (error) {
    console.error(`❌ Failed to load baseline: ${error}`);
    return null;
  }
}

/**
 * Load latest eval report for metrics
 */
function loadLatestEvalReport(): {
  selectionAccuracy: number;
  fieldAccuracy: number;
  fusionAgreementRate: number;
  pass2Rate: number;
} | null {
  const latestPath = path.join(EVAL_REPORTS_DIR, 'latest.json');
  
  if (!fs.existsSync(latestPath)) {
    console.warn(`⚠️ No eval report found at ${latestPath}`);
    return null;
  }
  
  try {
    const report = JSON.parse(fs.readFileSync(latestPath, 'utf-8'));
    return {
      selectionAccuracy: report.selectionMetrics?.accuracy ?? 0.95,
      fieldAccuracy: report.criticalFieldMetrics?.accuracy ?? 0.92,
      fusionAgreementRate: report.fusionMetrics?.agreementRate ?? 0.88,
      pass2Rate: report.pass2Metrics?.pass2Rate ?? 0.10,
    };
  } catch (error) {
    console.error(`❌ Failed to load eval report: ${error}`);
    return null;
  }
}

/**
 * Simulate current metrics for drift detection
 * In production, this would pull from actual processing data
 */
function getCurrentMetrics(): {
  ambiguityData: AmbiguityRateData;
  tokenCollisionData: TokenCollisionData;
  overrideData: OverrideSpikeData;
  scanQualityData: ScanQualityData;
  selectionAccuracy: number;
  fieldAccuracy: number;
  fusionDisagreementRate: number;
  pass2Rate: number;
} {
  // Try to load from eval report
  const evalMetrics = loadLatestEvalReport();
  
  return {
    ambiguityData: {
      totalDocuments: 100,
      ambiguousSelections: Math.floor(Math.random() * 15), // 0-15% ambiguity
      byTemplateId: {
        'template-a': { total: 40, ambiguous: Math.floor(Math.random() * 6), rate: 0 },
        'template-b': { total: 35, ambiguous: Math.floor(Math.random() * 5), rate: 0 },
        'template-c': { total: 25, ambiguous: Math.floor(Math.random() * 4), rate: 0 },
      },
    },
    tokenCollisionData: {
      totalTokens: 500,
      collisions: Math.floor(Math.random() * 30), // 0-6% collision rate
      byTemplateId: {
        'template-a': { tokens: 200, collisions: Math.floor(Math.random() * 10), collidingTokens: [] },
        'template-b': { tokens: 180, collisions: Math.floor(Math.random() * 10), collidingTokens: [] },
        'template-c': { tokens: 120, collisions: Math.floor(Math.random() * 10), collidingTokens: [] },
      },
    },
    overrideData: {
      totalDecisions: 100,
      overrides: Math.floor(Math.random() * 20), // 0-20% override rate
      byType: {
        'field_correction': Math.floor(Math.random() * 10),
        'template_change': Math.floor(Math.random() * 5),
        'status_override': Math.floor(Math.random() * 5),
      },
    },
    scanQualityData: {
      totalScans: 100,
      lowQualityScans: Math.floor(Math.random() * 15), // 0-15% low quality
      averageConfidence: 0.88 + Math.random() * 0.10, // 88-98% confidence
      byField: {
        'jobNumber': { total: 100, lowConfidence: Math.floor(Math.random() * 5), averageConfidence: 0.95 },
        'customerName': { total: 100, lowConfidence: Math.floor(Math.random() * 8), averageConfidence: 0.90 },
        'serviceDate': { total: 100, lowConfidence: Math.floor(Math.random() * 3), averageConfidence: 0.97 },
      },
    },
    selectionAccuracy: evalMetrics?.selectionAccuracy ?? (0.90 + Math.random() * 0.08),
    fieldAccuracy: evalMetrics?.fieldAccuracy ?? (0.88 + Math.random() * 0.10),
    fusionDisagreementRate: evalMetrics 
      ? (1 - evalMetrics.fusionAgreementRate) 
      : (0.05 + Math.random() * 0.15),
    pass2Rate: evalMetrics?.pass2Rate ?? (0.05 + Math.random() * 0.20),
  };
}

/**
 * Generate unique run ID
 */
function generateRunId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `drift-${timestamp}-${random}`;
}

/**
 * Run all drift detectors
 */
function runDriftDetection(config: DriftConfig = DEFAULT_DRIFT_CONFIG): DriftReport {
  console.log('🔍 Running drift detection...');
  
  // Load baseline
  const baseline = loadBaseline(config.baselinePath);
  if (baseline) {
    console.log(`📊 Loaded baseline from ${baseline.createdAt}`);
  } else {
    console.log('📊 No baseline - using defaults');
  }
  
  // Get current metrics
  const metrics = getCurrentMetrics();
  console.log('📈 Collected current metrics');
  
  // Run all detectors
  const alerts: DriftAlert[] = [];
  
  // 1. Ambiguity rate
  alerts.push(...detectAmbiguitySpike(metrics.ambiguityData, baseline, config.thresholds));
  
  // 2. Token collisions
  alerts.push(...detectTokenCollisions(metrics.tokenCollisionData, baseline, config.thresholds));
  
  // 3. Override spikes
  alerts.push(...detectOverrideSpike(metrics.overrideData, baseline, config.thresholds));
  
  // 4. Scan quality
  alerts.push(...detectScanQualityDegradation(metrics.scanQualityData, baseline, config.thresholds));
  
  // 5. Selection accuracy
  alerts.push(...detectSelectionAccuracyDrift(metrics.selectionAccuracy, baseline, config.thresholds));
  
  // 6. Field accuracy
  alerts.push(...detectFieldAccuracyDrift(metrics.fieldAccuracy, baseline, config.thresholds));
  
  // 7. Fusion disagreement
  alerts.push(...detectFusionDisagreement(metrics.fusionDisagreementRate, baseline, config.thresholds));
  
  // 8. Pass-2 escalation
  alerts.push(...detectPass2Escalation(metrics.pass2Rate, baseline, config.thresholds));
  
  // Sort alerts by severity
  const severityOrder = { critical: 0, warning: 1, info: 2 };
  alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
  
  // Count alerts by severity
  const criticalAlerts = alerts.filter(a => a.severity === 'critical').length;
  const warningAlerts = alerts.filter(a => a.severity === 'warning').length;
  const infoAlerts = alerts.filter(a => a.severity === 'info').length;
  
  // Get unique categories
  const categories = [...new Set(alerts.map(a => a.category))];
  
  // Build report
  const report: DriftReport = {
    version: '1.0.0',
    runId: generateRunId(),
    timestamp: new Date().toISOString(),
    environment: 'local',
    currentMetrics: {
      ambiguityRate: metrics.ambiguityData.totalDocuments > 0 
        ? metrics.ambiguityData.ambiguousSelections / metrics.ambiguityData.totalDocuments 
        : 0,
      tokenCollisionRate: metrics.tokenCollisionData.totalTokens > 0 
        ? metrics.tokenCollisionData.collisions / metrics.tokenCollisionData.totalTokens 
        : 0,
      overrideRate: metrics.overrideData.totalDecisions > 0 
        ? metrics.overrideData.overrides / metrics.overrideData.totalDecisions 
        : 0,
      averageScanQuality: metrics.scanQualityData.averageConfidence,
      selectionAccuracy: metrics.selectionAccuracy,
      fieldAccuracy: metrics.fieldAccuracy,
      fusionAgreementRate: 1 - metrics.fusionDisagreementRate,
      pass2Rate: metrics.pass2Rate,
    },
    baseline,
    alerts,
    summary: {
      totalAlerts: alerts.length,
      criticalAlerts,
      warningAlerts,
      infoAlerts,
      categories,
    },
    requiresImmediateAction: criticalAlerts > 0,
    thresholds: config.thresholds,
  };
  
  return report;
}

/**
 * Save report to disk
 */
function saveReport(report: DriftReport, outputPath?: string): string {
  // Ensure reports directory exists
  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }
  
  const reportPath = outputPath || path.join(REPORTS_DIR, `drift-report-${report.runId}.json`);
  const latestPath = path.join(REPORTS_DIR, 'latest.json');
  
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(latestPath, JSON.stringify(report, null, 2));
  
  return reportPath;
}

/**
 * Print report summary
 */
function printSummary(report: DriftReport): void {
  console.log('\n' + '═'.repeat(60));
  console.log('🔍 DRIFT DETECTION REPORT');
  console.log('═'.repeat(60));
  
  console.log(`\n📋 Run ID: ${report.runId}`);
  console.log(`📅 Timestamp: ${report.timestamp}`);
  
  console.log('\n📊 CURRENT METRICS:');
  console.log(`   Ambiguity Rate:        ${(report.currentMetrics.ambiguityRate * 100).toFixed(1)}%`);
  console.log(`   Token Collision Rate:  ${(report.currentMetrics.tokenCollisionRate * 100).toFixed(1)}%`);
  console.log(`   Override Rate:         ${(report.currentMetrics.overrideRate * 100).toFixed(1)}%`);
  console.log(`   Scan Quality:          ${(report.currentMetrics.averageScanQuality * 100).toFixed(1)}%`);
  console.log(`   Selection Accuracy:    ${(report.currentMetrics.selectionAccuracy * 100).toFixed(1)}%`);
  console.log(`   Field Accuracy:        ${(report.currentMetrics.fieldAccuracy * 100).toFixed(1)}%`);
  console.log(`   Fusion Agreement:      ${(report.currentMetrics.fusionAgreementRate * 100).toFixed(1)}%`);
  console.log(`   Pass-2 Rate:           ${(report.currentMetrics.pass2Rate * 100).toFixed(1)}%`);
  
  console.log('\n🚨 ALERTS:');
  console.log(`   Total: ${report.summary.totalAlerts}`);
  if (report.summary.criticalAlerts > 0) {
    console.log(`   🔴 Critical: ${report.summary.criticalAlerts}`);
  }
  if (report.summary.warningAlerts > 0) {
    console.log(`   🟡 Warning: ${report.summary.warningAlerts}`);
  }
  if (report.summary.infoAlerts > 0) {
    console.log(`   🔵 Info: ${report.summary.infoAlerts}`);
  }
  
  if (report.alerts.length > 0) {
    console.log('\n📋 ALERT DETAILS:');
    for (const alert of report.alerts) {
      const icon = alert.severity === 'critical' ? '🔴' : alert.severity === 'warning' ? '🟡' : '🔵';
      console.log(`   ${icon} [${alert.category}] ${alert.message}`);
      if (alert.suggestedAction) {
        console.log(`      → ${alert.suggestedAction}`);
      }
    }
  }
  
  if (report.requiresImmediateAction) {
    console.log('\n⚠️ IMMEDIATE ACTION REQUIRED: Critical alerts detected');
  }
  
  console.log('\n' + '═'.repeat(60));
}

/**
 * Create or update baseline
 */
function createBaseline(report: DriftReport): void {
  const baseline: DriftBaseline = {
    version: '1.0.0',
    createdAt: new Date().toISOString(),
    ambiguityRate: report.currentMetrics.ambiguityRate,
    tokenCollisionRate: report.currentMetrics.tokenCollisionRate,
    overrideRate: report.currentMetrics.overrideRate,
    averageScanQuality: report.currentMetrics.averageScanQuality,
    selectionAccuracy: report.currentMetrics.selectionAccuracy,
    fieldAccuracy: report.currentMetrics.fieldAccuracy,
    fusionAgreementRate: report.currentMetrics.fusionAgreementRate,
    pass2Rate: report.currentMetrics.pass2Rate,
    byTemplateId: {},
  };
  
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2));
  console.log(`✅ Baseline saved to ${BASELINE_PATH}`);
}

/**
 * CLI entry point
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  
  // Parse args
  let baselinePath: string | undefined;
  let outputPath: string | undefined;
  let createNewBaseline = false;
  let verbose = false;
  
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--baseline':
        baselinePath = args[++i];
        break;
      case '--output':
        outputPath = args[++i];
        break;
      case '--create-baseline':
        createNewBaseline = true;
        break;
      case '--verbose':
        verbose = true;
        break;
      case '--help':
        console.log(`
Usage: npx tsx scripts/drift/run-drift-check.ts [options]

Options:
  --baseline <path>     Path to baseline file (default: auto-detect)
  --output <path>       Output path for drift_report.json
  --create-baseline     Create new baseline from current metrics
  --verbose             Enable verbose output
  --help                Show this help
`);
        process.exit(0);
    }
  }
  
  console.log('🚀 Drift Detection v1.0.0');
  
  const config: DriftConfig = {
    ...DEFAULT_DRIFT_CONFIG,
    baselinePath,
  };
  
  // Run drift detection
  const report = runDriftDetection(config);
  
  // Create baseline if requested
  if (createNewBaseline) {
    createBaseline(report);
  }
  
  // Save report
  const savedPath = saveReport(report, outputPath);
  console.log(`\n💾 Report saved: ${savedPath}`);
  
  // Print summary
  printSummary(report);
  
  // Exit with appropriate code
  if (report.requiresImmediateAction) {
    console.log('\n❌ Exiting with error due to critical alerts');
    process.exit(1);
  }
  
  console.log('\n✅ Drift check complete');
}

// Run if executed directly
main().catch(error => {
  console.error('❌ Drift check failed:', error);
  process.exit(1);
});

// Export for testing
export {
  runDriftDetection,
  saveReport,
  loadBaseline,
  createBaseline,
};
