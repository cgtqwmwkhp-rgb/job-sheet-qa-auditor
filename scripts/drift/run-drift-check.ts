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
 *   --live                Pull current metrics from the live DB
 *   --verbose             Enable verbose output
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

import type {
  DriftReport,
  DriftBaseline,
  DriftConfig,
  DriftAlert,
  AmbiguityRateData,
  TokenCollisionData,
  OverrideSpikeData,
  ScanQualityData,
} from "./types";
import { DEFAULT_DRIFT_CONFIG, DEFAULT_DRIFT_THRESHOLDS } from "./types";
import {
  detectAmbiguitySpike,
  detectTokenCollisions,
  detectOverrideSpike,
  detectScanQualityDegradation,
  detectSelectionAccuracyDrift,
  detectFieldAccuracyDrift,
  detectFusionDisagreement,
  detectPass2Escalation,
} from "./detectors";
import {
  collectLiveDriftMetrics,
  type LiveDriftMetrics,
} from "../lib/liveMetrics";

// ESM __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths
const DRIFT_ROOT = __dirname;
const REPORTS_DIR = path.join(DRIFT_ROOT, "reports");
const BASELINE_PATH = path.join(DRIFT_ROOT, "baseline.json");
const EVAL_REPORTS_DIR = path.join(__dirname, "../eval/reports");

type CurrentDriftMetrics = LiveDriftMetrics;

export type DriftMetricsCollector = () => Promise<CurrentDriftMetrics>;

export interface RunDriftDetectionOptions {
  live?: boolean;
  environment?: DriftReport["environment"];
  collectLiveMetrics?: DriftMetricsCollector;
}

/**
 * Load baseline from disk
 */
function loadBaseline(
  baselinePath: string = BASELINE_PATH
): DriftBaseline | null {
  if (!fs.existsSync(baselinePath)) {
    console.warn(`⚠️ No baseline found at ${baselinePath}`);
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(baselinePath, "utf-8"));
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
  const latestPath = path.join(EVAL_REPORTS_DIR, "latest.json");

  if (!fs.existsSync(latestPath)) {
    console.warn(`⚠️ No eval report found at ${latestPath}`);
    return null;
  }

  try {
    const report = JSON.parse(fs.readFileSync(latestPath, "utf-8"));
    return {
      selectionAccuracy: report.selectionMetrics?.accuracy ?? 0.95,
      fieldAccuracy: report.criticalFieldMetrics?.accuracy ?? 0.92,
      fusionAgreementRate: report.fusionMetrics?.agreementRate ?? 0.88,
      pass2Rate: report.pass2Metrics?.pass2Rate ?? 0.1,
    };
  } catch (error) {
    console.error(`❌ Failed to load eval report: ${error}`);
    return null;
  }
}

/**
 * Deterministic fixture metrics for safe local/CI drift checks.
 * Live runs use an injected DB-backed collector instead.
 */
function getFixtureMetrics(): CurrentDriftMetrics {
  // Try to load from eval report
  const evalMetrics = loadLatestEvalReport();

  return {
    ambiguityData: {
      totalDocuments: 100,
      ambiguousSelections: 5,
      byTemplateId: {
        "template-a": { total: 40, ambiguous: 2, rate: 0.05 },
        "template-b": { total: 35, ambiguous: 2, rate: 0.057 },
        "template-c": { total: 25, ambiguous: 1, rate: 0.04 },
      },
    },
    tokenCollisionData: {
      totalTokens: 500,
      collisions: 10,
      byTemplateId: {
        "template-a": { tokens: 200, collisions: 4, collidingTokens: [] },
        "template-b": { tokens: 180, collisions: 4, collidingTokens: [] },
        "template-c": { tokens: 120, collisions: 2, collidingTokens: [] },
      },
    },
    overrideData: {
      totalDecisions: 100,
      overrides: 8,
      byType: {
        field_correction: 5,
        template_change: 2,
        status_override: 1,
      },
    },
    scanQualityData: {
      totalScans: 100,
      lowQualityScans: 6,
      averageConfidence: 0.94,
      byField: {
        jobNumber: { total: 100, lowConfidence: 2, averageConfidence: 0.95 },
        customerName: { total: 100, lowConfidence: 3, averageConfidence: 0.93 },
        serviceDate: { total: 100, lowConfidence: 1, averageConfidence: 0.96 },
      },
    },
    selectionAccuracy: evalMetrics?.selectionAccuracy ?? 0.95,
    fieldAccuracy: evalMetrics?.fieldAccuracy ?? 0.92,
    fusionDisagreementRate: evalMetrics
      ? 1 - evalMetrics.fusionAgreementRate
      : 0.1,
    pass2Rate: evalMetrics?.pass2Rate ?? 0.08,
  };
}

/**
 * Generate unique run ID
 */
let runIdCounter = 0;

function generateRunId(): string {
  const timestamp = Date.now().toString(36);
  runIdCounter = (runIdCounter + 1) % Number.MAX_SAFE_INTEGER;
  const counter = runIdCounter.toString(36).padStart(4, "0");
  return `drift-${timestamp}-${counter}`;
}

/**
 * Run all drift detectors
 */
async function runDriftDetection(
  config: DriftConfig = DEFAULT_DRIFT_CONFIG,
  options: RunDriftDetectionOptions = {}
): Promise<DriftReport> {
  console.log("🔍 Running drift detection...");
  if (options.live) {
    console.log("🔌 Live drift metrics enabled");
  }

  // Load baseline
  const baseline = loadBaseline(config.baselinePath);
  if (baseline) {
    console.log(`📊 Loaded baseline from ${baseline.createdAt}`);
  } else {
    console.log("📊 No baseline - using defaults");
  }

  const collector = options.collectLiveMetrics ?? collectLiveDriftMetrics;
  const metrics = options.live ? await collector() : getFixtureMetrics();
  console.log("📈 Collected current metrics");

  // Run all detectors
  const alerts: DriftAlert[] = [];

  // 1. Ambiguity rate
  alerts.push(
    ...detectAmbiguitySpike(metrics.ambiguityData, baseline, config.thresholds)
  );

  // 2. Token collisions
  alerts.push(
    ...detectTokenCollisions(
      metrics.tokenCollisionData,
      baseline,
      config.thresholds
    )
  );

  // 3. Override spikes
  alerts.push(
    ...detectOverrideSpike(metrics.overrideData, baseline, config.thresholds)
  );

  // 4. Scan quality
  alerts.push(
    ...detectScanQualityDegradation(
      metrics.scanQualityData,
      baseline,
      config.thresholds
    )
  );

  // 5. Selection accuracy
  alerts.push(
    ...detectSelectionAccuracyDrift(
      metrics.selectionAccuracy,
      baseline,
      config.thresholds
    )
  );

  // 6. Field accuracy
  alerts.push(
    ...detectFieldAccuracyDrift(
      metrics.fieldAccuracy,
      baseline,
      config.thresholds
    )
  );

  // 7. Fusion disagreement
  alerts.push(
    ...detectFusionDisagreement(
      metrics.fusionDisagreementRate,
      baseline,
      config.thresholds
    )
  );

  // 8. Pass-2 escalation
  alerts.push(
    ...detectPass2Escalation(metrics.pass2Rate, baseline, config.thresholds)
  );

  // Sort alerts by severity
  const severityOrder = { critical: 0, warning: 1, info: 2 };
  alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  // Count alerts by severity
  const criticalAlerts = alerts.filter(a => a.severity === "critical").length;
  const warningAlerts = alerts.filter(a => a.severity === "warning").length;
  const infoAlerts = alerts.filter(a => a.severity === "info").length;

  // Get unique categories
  const categories = [...new Set(alerts.map(a => a.category))];

  // Build report
  const report: DriftReport = {
    version: "1.0.0",
    runId: generateRunId(),
    timestamp: new Date().toISOString(),
    environment: options.environment ?? "local",
    currentMetrics: {
      ambiguityRate:
        metrics.ambiguityData.totalDocuments > 0
          ? metrics.ambiguityData.ambiguousSelections /
            metrics.ambiguityData.totalDocuments
          : 0,
      tokenCollisionRate:
        metrics.tokenCollisionData.totalTokens > 0
          ? metrics.tokenCollisionData.collisions /
            metrics.tokenCollisionData.totalTokens
          : 0,
      overrideRate:
        metrics.overrideData.totalDecisions > 0
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

  const reportPath =
    outputPath || path.join(REPORTS_DIR, `drift-report-${report.runId}.json`);
  const latestPath = path.join(REPORTS_DIR, "latest.json");

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(latestPath, JSON.stringify(report, null, 2));

  return reportPath;
}

/**
 * Print report summary
 */
function printSummary(report: DriftReport): void {
  console.log("\n" + "═".repeat(60));
  console.log("🔍 DRIFT DETECTION REPORT");
  console.log("═".repeat(60));

  console.log(`\n📋 Run ID: ${report.runId}`);
  console.log(`📅 Timestamp: ${report.timestamp}`);

  console.log("\n📊 CURRENT METRICS:");
  console.log(
    `   Ambiguity Rate:        ${(report.currentMetrics.ambiguityRate * 100).toFixed(1)}%`
  );
  console.log(
    `   Token Collision Rate:  ${(report.currentMetrics.tokenCollisionRate * 100).toFixed(1)}%`
  );
  console.log(
    `   Override Rate:         ${(report.currentMetrics.overrideRate * 100).toFixed(1)}%`
  );
  console.log(
    `   Scan Quality:          ${(report.currentMetrics.averageScanQuality * 100).toFixed(1)}%`
  );
  console.log(
    `   Selection Accuracy:    ${(report.currentMetrics.selectionAccuracy * 100).toFixed(1)}%`
  );
  console.log(
    `   Field Accuracy:        ${(report.currentMetrics.fieldAccuracy * 100).toFixed(1)}%`
  );
  console.log(
    `   Fusion Agreement:      ${(report.currentMetrics.fusionAgreementRate * 100).toFixed(1)}%`
  );
  console.log(
    `   Pass-2 Rate:           ${(report.currentMetrics.pass2Rate * 100).toFixed(1)}%`
  );

  console.log("\n🚨 ALERTS:");
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
    console.log("\n📋 ALERT DETAILS:");
    for (const alert of report.alerts) {
      const icon =
        alert.severity === "critical"
          ? "🔴"
          : alert.severity === "warning"
            ? "🟡"
            : "🔵";
      console.log(`   ${icon} [${alert.category}] ${alert.message}`);
      if (alert.suggestedAction) {
        console.log(`      → ${alert.suggestedAction}`);
      }
    }
  }

  if (report.requiresImmediateAction) {
    console.log("\n⚠️ IMMEDIATE ACTION REQUIRED: Critical alerts detected");
  }

  console.log("\n" + "═".repeat(60));
}

/**
 * Create or update baseline
 */
function createBaseline(report: DriftReport): void {
  const baseline: DriftBaseline = {
    version: "1.0.0",
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
  let live =
    process.env.DRIFT_LIVE === "1" || process.env.DRIFT_LIVE === "true";

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--baseline":
        baselinePath = args[++i];
        break;
      case "--output":
        outputPath = args[++i];
        break;
      case "--create-baseline":
        createNewBaseline = true;
        break;
      case "--live":
        live = true;
        break;
      case "--verbose":
        verbose = true;
        break;
      case "--help":
        console.log(`
Usage: npx tsx scripts/drift/run-drift-check.ts [options]

Options:
  --baseline <path>     Path to baseline file (default: auto-detect)
  --output <path>       Output path for drift_report.json
  --create-baseline     Create new baseline from current metrics
  --live                Pull current metrics from the live DB
  --verbose             Enable verbose output
  --help                Show this help
`);
        process.exit(0);
    }
  }

  console.log("🚀 Drift Detection v1.0.0");
  console.log(`   Live: ${live ? "enabled" : "disabled"}`);

  const config: DriftConfig = {
    ...DEFAULT_DRIFT_CONFIG,
    baselinePath,
  };

  // Run drift detection
  const report = await runDriftDetection(config, {
    live,
    environment:
      (process.env.DRIFT_ENVIRONMENT as DriftReport["environment"]) || "local",
  });

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
    console.log("\n❌ Exiting with error due to critical alerts");
    process.exit(1);
  }

  console.log("\n✅ Drift check complete");
}

// Run if executed directly
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch(error => {
    console.error("❌ Drift check failed:", error);
    process.exit(1);
  });
}

// Export for testing
export { runDriftDetection, saveReport, loadBaseline, createBaseline };
