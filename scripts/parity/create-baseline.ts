/**
 * Baseline Creation Script
 * 
 * Creates a versioned baseline snapshot from the latest parity report.
 * Baselines are immutable once created and require explicit version input.
 * 
 * Usage:
 *   npx tsx scripts/parity/create-baseline.ts --version <semver>
 *   npx tsx scripts/parity/create-baseline.ts --version <semver> --report <path>
 * 
 * Example:
 *   npx tsx scripts/parity/create-baseline.ts --version 1.0.0
 *   npx tsx scripts/parity/create-baseline.ts --version 1.0.0 --report parity/reports/ci-latest.json
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

/**
 * Canonical severity order for deterministic sorting
 */
const CANONICAL_SEVERITY_ORDER = ['S0', 'S1', 'S2', 'S3'];

function computeHash(content: string): string {
  const hash = crypto.createHash('sha256');
  hash.update(content, 'utf8');
  return 'sha256:' + hash.digest('hex');
}

function validateSemver(version: string): boolean {
  const semverRegex = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/;
  return semverRegex.test(version);
}

/**
 * Canonicalise bySeverity keys for deterministic ordering.
 * Sorts by canonical severity order (S0, S1, S2, S3), then alphabetically for any others.
 */
function canonicaliseBySeverity(
  bySeverity: Record<string, { passed: number; total: number }>
): Record<string, { passed: number; total: number }> {
  const keys = Object.keys(bySeverity);
  
  // Sort keys: canonical severities first in order, then others alphabetically
  keys.sort((a, b) => {
    const aIndex = CANONICAL_SEVERITY_ORDER.indexOf(a);
    const bIndex = CANONICAL_SEVERITY_ORDER.indexOf(b);
    
    if (aIndex !== -1 && bIndex !== -1) {
      return aIndex - bIndex;
    }
    if (aIndex !== -1) return -1;
    if (bIndex !== -1) return 1;
    return a.localeCompare(b);
  });
  
  const result: Record<string, { passed: number; total: number }> = {};
  for (const key of keys) {
    result[key] = bySeverity[key];
  }
  return result;
}

/**
 * Canonicalise docResults for deterministic ordering.
 * Sorts by document id.
 */
function canonicaliseDocResults(
  docResults: Array<{ id: string; name: string; status: string; passRate: number }>
): Array<{ id: string; name: string; status: string; passRate: number }> {
  return [...docResults].sort((a, b) => a.id.localeCompare(b.id));
}

function main(): void {
  const args = process.argv.slice(2);
  let version: string | undefined;
  let reportPathArg: string | undefined;
  
  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--version' && args[i + 1]) {
      version = args[i + 1];
      i++;
    } else if (args[i] === '--report' && args[i + 1]) {
      reportPathArg = args[i + 1];
      i++;
    }
  }
  
  if (!version) {
    console.error('❌ Error: --version is required');
    console.error('Usage: npx tsx scripts/parity/create-baseline.ts --version <semver> [--report <path>]');
    process.exit(1);
  }
  
  if (!validateSemver(version)) {
    console.error('❌ Error: Invalid version format. Use semver (e.g., 1.0.0)');
    process.exit(1);
  }
  
  const reportPath = reportPathArg 
    ? path.resolve(process.cwd(), reportPathArg)
    : path.join(process.cwd(), 'parity/reports/latest.json');
  const baselinePath = path.join(process.cwd(), `parity/baselines/baseline-${version}.json`);
  const baselinesDir = path.dirname(baselinePath);
  
  // Check if report exists
  if (!fs.existsSync(reportPath)) {
    console.error('❌ Error: No parity report found at', reportPath);
    console.error('   Run parity full suite first to generate a report.');
    console.error('   Or specify a report path with --report <path>');
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
  
  // Canonicalise inputs for deterministic hashing
  const canonicalBySeverity = canonicaliseBySeverity(report.bySeverity);
  const canonicalDocResults = canonicaliseDocResults(report.docResults);
  
  // Create baseline with canonicalised data
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
      bySeverity: canonicalBySeverity
    },
    docResults: canonicalDocResults
  };
  
  // Compute content hash (excluding contentHash, createdAt, createdBy fields)
  // These fields are metadata and should not affect the content hash
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
  console.log('Severity Distribution:');
  Object.entries(baseline.metrics.bySeverity).forEach(([sev, data]) => {
    const rate = data.total > 0 ? ((data.passed / data.total) * 100).toFixed(1) : '0.0';
    console.log(`  ${sev}: ${data.passed}/${data.total} (${rate}%)`);
  });
  console.log('');
  console.log(`✅ Written to: ${baselinePath}`);
  console.log('');
  console.log('⚠️  Remember to update docs/parity/CHANGELOG.md with this baseline.');
}

main();
