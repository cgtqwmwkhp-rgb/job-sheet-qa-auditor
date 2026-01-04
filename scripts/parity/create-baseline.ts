/**
 * Baseline Creation Script
 * 
 * Creates a versioned baseline snapshot from the latest parity report.
 * Baselines are immutable once created and require explicit version input.
 * 
 * Usage:
 *   npx tsx scripts/parity/create-baseline.ts --version <semver>
 * 
 * Example:
 *   npx tsx scripts/parity/create-baseline.ts --version 1.0.0
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

interface ParityReport {
  timestamp: string;
  datasetVersion: string;
  thresholdVersion: string;
  status: 'pass' | 'fail';
  passRate: number;
  totalFields: number;
  passedFields: number;
  failedFields: number;
  bySeverity: Record<string, { passed: number; total: number }>;
  byReasonCode: Record<string, { total: number }>;
  docResults: Array<{ id: string; name: string; status: string; passRate: number }>;
  violations: string[];
}

interface Baseline {
  version: string;
  createdAt: string;
  createdBy: string;
  contentHash: string;
  sourceReport: {
    timestamp: string;
    datasetVersion: string;
    thresholdVersion: string;
  };
  metrics: {
    passRate: number;
    totalFields: number;
    passedFields: number;
    failedFields: number;
    bySeverity: Record<string, { passed: number; total: number }>;
  };
  docResults: Array<{ id: string; name: string; status: string; passRate: number }>;
}

function computeHash(content: string): string {
  const hash = crypto.createHash('sha256');
  hash.update(content, 'utf8');
  return 'sha256:' + hash.digest('hex');
}

function validateSemver(version: string): boolean {
  const semverRegex = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/;
  return semverRegex.test(version);
}

function main(): void {
  const args = process.argv.slice(2);
  let version: string | undefined;
  
  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--version' && args[i + 1]) {
      version = args[i + 1];
      i++;
    }
  }
  
  if (!version) {
    console.error('❌ Error: --version is required');
    console.error('Usage: npx tsx scripts/parity/create-baseline.ts --version <semver>');
    process.exit(1);
  }
  
  if (!validateSemver(version)) {
    console.error('❌ Error: Invalid version format. Use semver (e.g., 1.0.0)');
    process.exit(1);
  }
  
  const reportPath = path.join(process.cwd(), 'parity/reports/latest.json');
  const baselinePath = path.join(process.cwd(), `parity/baselines/baseline-${version}.json`);
  const baselinesDir = path.dirname(baselinePath);
  
  // Check if report exists
  if (!fs.existsSync(reportPath)) {
    console.error('❌ Error: No parity report found at', reportPath);
    console.error('   Run parity full suite first to generate a report.');
    process.exit(1);
  }
  
  // Check if baseline already exists
  if (fs.existsSync(baselinePath)) {
    console.error('❌ Error: Baseline', version, 'already exists');
    console.error('   Baselines are immutable. Use a new version number.');
    process.exit(1);
  }
  
  // Ensure baselines directory exists
  if (!fs.existsSync(baselinesDir)) {
    fs.mkdirSync(baselinesDir, { recursive: true });
  }
  
  // Read the latest report
  const report: ParityReport = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
  
  // Create baseline
  const baseline: Baseline = {
    version,
    createdAt: new Date().toISOString(),
    createdBy: process.env.GITHUB_ACTOR || process.env.USER || 'unknown',
    contentHash: '', // Will be computed
    sourceReport: {
      timestamp: report.timestamp,
      datasetVersion: report.datasetVersion,
      thresholdVersion: report.thresholdVersion
    },
    metrics: {
      passRate: report.passRate,
      totalFields: report.totalFields,
      passedFields: report.passedFields,
      failedFields: report.failedFields,
      bySeverity: report.bySeverity
    },
    docResults: report.docResults
  };
  
  // Compute content hash (excluding contentHash field itself)
  const hashInput = JSON.stringify({
    version: baseline.version,
    sourceReport: baseline.sourceReport,
    metrics: baseline.metrics,
    docResults: baseline.docResults
  });
  baseline.contentHash = computeHash(hashInput);
  
  // Write baseline
  fs.writeFileSync(baselinePath, JSON.stringify(baseline, null, 2) + '\n', 'utf-8');
  
  console.log('Baseline Created Successfully');
  console.log('=============================');
  console.log(`Version:      ${baseline.version}`);
  console.log(`Content Hash: ${baseline.contentHash}`);
  console.log(`Pass Rate:    ${baseline.metrics.passRate}%`);
  console.log(`Fields:       ${baseline.metrics.passedFields}/${baseline.metrics.totalFields}`);
  console.log(`Created At:   ${baseline.createdAt}`);
  console.log(`Created By:   ${baseline.createdBy}`);
  console.log('');
  console.log(`✅ Written to: ${baselinePath}`);
  console.log('');
  console.log('⚠️  Remember to update docs/parity/CHANGELOG.md with this baseline.');
}

main();
