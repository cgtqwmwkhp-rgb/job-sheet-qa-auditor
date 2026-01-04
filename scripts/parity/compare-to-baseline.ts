/**
 * Baseline Comparison Script
 * 
 * Compares current parity outputs to a selected baseline deterministically.
 * Applies threshold rules and reports regressions.
 * 
 * Usage:
 *   npx tsx scripts/parity/compare-to-baseline.ts --baseline <version>
 * 
 * Example:
 *   npx tsx scripts/parity/compare-to-baseline.ts --baseline 1.0.0
 */

import * as fs from 'fs';
import * as path from 'path';

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

interface ThresholdConfig {
  version: string;
  thresholds: {
    overall: { minPassRate: number; maxWorseCount: number };
    bySeverity: Record<string, { minPassRate: number; maxWorseCount: number }>;
  };
}

interface ComparisonResult {
  baseline: {
    version: string;
    passRate: number;
    contentHash: string;
  };
  current: {
    timestamp: string;
    passRate: number;
  };
  delta: {
    passRateChange: number;
    direction: 'improved' | 'same' | 'regressed';
    fieldChanges: {
      gained: number;
      lost: number;
    };
  };
  bySeverity: Array<{
    severity: string;
    baseline: { passed: number; total: number; rate: number };
    current: { passed: number; total: number; rate: number };
    delta: number;
    status: 'improved' | 'same' | 'regressed';
  }>;
  docComparison: Array<{
    id: string;
    name: string;
    baselineStatus: string;
    currentStatus: string;
    baselineRate: number;
    currentRate: number;
    status: 'improved' | 'same' | 'regressed' | 'new';
  }>;
  violations: string[];
  overallStatus: 'pass' | 'fail';
}

function main(): void {
  const args = process.argv.slice(2);
  let baselineVersion: string | undefined;
  
  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--baseline' && args[i + 1]) {
      baselineVersion = args[i + 1];
      i++;
    }
  }
  
  if (!baselineVersion) {
    console.error('❌ Error: --baseline is required');
    console.error('Usage: npx tsx scripts/parity/compare-to-baseline.ts --baseline <version>');
    process.exit(1);
  }
  
  const baselinePath = path.join(process.cwd(), `parity/baselines/baseline-${baselineVersion}.json`);
  const reportPath = path.join(process.cwd(), 'parity/reports/latest.json');
  const thresholdsPath = path.join(process.cwd(), 'parity/config/thresholds.json');
  const outputPath = path.join(process.cwd(), 'parity/reports/baseline-comparison.json');
  
  // Check files exist
  if (!fs.existsSync(baselinePath)) {
    console.error('❌ Error: Baseline not found:', baselinePath);
    console.error('   Available baselines:');
    const baselinesDir = path.join(process.cwd(), 'parity/baselines');
    if (fs.existsSync(baselinesDir)) {
      const files = fs.readdirSync(baselinesDir).filter(f => f.startsWith('baseline-'));
      files.forEach(f => console.error('   -', f.replace('baseline-', '').replace('.json', '')));
    }
    process.exit(1);
  }
  
  if (!fs.existsSync(reportPath)) {
    console.error('❌ Error: No current parity report found at', reportPath);
    console.error('   Run parity full suite first.');
    process.exit(1);
  }
  
  // Read files
  const baseline: Baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf-8'));
  const report: ParityReport = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
  const thresholds: ThresholdConfig = fs.existsSync(thresholdsPath)
    ? JSON.parse(fs.readFileSync(thresholdsPath, 'utf-8'))
    : { version: 'unknown', thresholds: { overall: { minPassRate: 0.85, maxWorseCount: 5 }, bySeverity: {} } };
  
  // Compare
  const passRateChange = report.passRate - baseline.metrics.passRate;
  const direction: 'improved' | 'same' | 'regressed' = 
    passRateChange > 0.1 ? 'improved' :
    passRateChange < -0.1 ? 'regressed' : 'same';
  
  // Compare by severity
  const severities = new Set([
    ...Object.keys(baseline.metrics.bySeverity),
    ...Object.keys(report.bySeverity)
  ]);
  
  const bySeverity = Array.from(severities).sort().map(sev => {
    const baselineData = baseline.metrics.bySeverity[sev] || { passed: 0, total: 0 };
    const currentData = report.bySeverity[sev] || { passed: 0, total: 0 };
    const baselineRate = baselineData.total > 0 ? baselineData.passed / baselineData.total * 100 : 0;
    const currentRate = currentData.total > 0 ? currentData.passed / currentData.total * 100 : 0;
    const delta = currentRate - baselineRate;
    
    return {
      severity: sev,
      baseline: { ...baselineData, rate: baselineRate },
      current: { ...currentData, rate: currentRate },
      delta,
      status: delta > 0.1 ? 'improved' as const : delta < -0.1 ? 'regressed' as const : 'same' as const
    };
  });
  
  // Compare documents
  const baselineDocs = new Map(baseline.docResults.map(d => [d.id, d]));
  const currentDocs = new Map(report.docResults.map(d => [d.id, d]));
  const allDocIds = new Set([...baselineDocs.keys(), ...currentDocs.keys()]);
  
  const docComparison = Array.from(allDocIds).sort().map(id => {
    const baselineDoc = baselineDocs.get(id);
    const currentDoc = currentDocs.get(id);
    
    if (!baselineDoc) {
      return {
        id,
        name: currentDoc!.name,
        baselineStatus: 'N/A',
        currentStatus: currentDoc!.status,
        baselineRate: 0,
        currentRate: currentDoc!.passRate,
        status: 'new' as const
      };
    }
    
    if (!currentDoc) {
      return {
        id,
        name: baselineDoc.name,
        baselineStatus: baselineDoc.status,
        currentStatus: 'removed',
        baselineRate: baselineDoc.passRate,
        currentRate: 0,
        status: 'regressed' as const
      };
    }
    
    const delta = currentDoc.passRate - baselineDoc.passRate;
    return {
      id,
      name: currentDoc.name,
      baselineStatus: baselineDoc.status,
      currentStatus: currentDoc.status,
      baselineRate: baselineDoc.passRate,
      currentRate: currentDoc.passRate,
      status: delta > 0.1 ? 'improved' as const : delta < -0.1 ? 'regressed' as const : 'same' as const
    };
  });
  
  // Check violations
  const violations: string[] = [];
  
  // Overall threshold
  if (report.passRate < thresholds.thresholds.overall.minPassRate * 100) {
    violations.push(`Overall pass rate ${report.passRate}% below threshold ${thresholds.thresholds.overall.minPassRate * 100}%`);
  }
  
  // Count regressions
  const regressedCount = docComparison.filter(d => d.status === 'regressed').length;
  if (regressedCount > thresholds.thresholds.overall.maxWorseCount) {
    violations.push(`${regressedCount} documents regressed (max allowed: ${thresholds.thresholds.overall.maxWorseCount})`);
  }
  
  // Severity thresholds
  bySeverity.forEach(sev => {
    const sevThreshold = thresholds.thresholds.bySeverity[sev.severity];
    if (sevThreshold && sev.current.rate < sevThreshold.minPassRate * 100) {
      violations.push(`${sev.severity} pass rate ${sev.current.rate.toFixed(1)}% below threshold ${sevThreshold.minPassRate * 100}%`);
    }
  });
  
  const result: ComparisonResult = {
    baseline: {
      version: baseline.version,
      passRate: baseline.metrics.passRate,
      contentHash: baseline.contentHash
    },
    current: {
      timestamp: report.timestamp,
      passRate: report.passRate
    },
    delta: {
      passRateChange,
      direction,
      fieldChanges: {
        gained: Math.max(0, report.passedFields - baseline.metrics.passedFields),
        lost: Math.max(0, baseline.metrics.passedFields - report.passedFields)
      }
    },
    bySeverity,
    docComparison,
    violations,
    overallStatus: violations.length > 0 ? 'fail' : 'pass'
  };
  
  // Write result
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n', 'utf-8');
  
  // Print summary
  console.log('Baseline Comparison Report');
  console.log('==========================');
  console.log(`Baseline:     ${baseline.version} (${baseline.metrics.passRate}%)`);
  console.log(`Current:      ${report.passRate}%`);
  console.log(`Delta:        ${passRateChange >= 0 ? '+' : ''}${passRateChange.toFixed(1)}% (${direction})`);
  console.log('');
  
  console.log('By Severity:');
  bySeverity.forEach(sev => {
    const icon = sev.status === 'improved' ? '📈' : sev.status === 'regressed' ? '📉' : '➡️';
    console.log(`  ${icon} ${sev.severity}: ${sev.baseline.rate.toFixed(1)}% → ${sev.current.rate.toFixed(1)}% (${sev.delta >= 0 ? '+' : ''}${sev.delta.toFixed(1)}%)`);
  });
  console.log('');
  
  console.log('Document Changes:');
  const improved = docComparison.filter(d => d.status === 'improved').length;
  const regressed = docComparison.filter(d => d.status === 'regressed').length;
  const same = docComparison.filter(d => d.status === 'same').length;
  const newDocs = docComparison.filter(d => d.status === 'new').length;
  console.log(`  📈 Improved: ${improved}`);
  console.log(`  📉 Regressed: ${regressed}`);
  console.log(`  ➡️  Same: ${same}`);
  console.log(`  🆕 New: ${newDocs}`);
  console.log('');
  
  if (violations.length > 0) {
    console.log('❌ Violations:');
    violations.forEach(v => console.log(`   - ${v}`));
    console.log('');
  }
  
  console.log(`Overall Status: ${result.overallStatus === 'pass' ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Written to: ${outputPath}`);
  
  process.exit(result.overallStatus === 'pass' ? 0 : 1);
}

main();
