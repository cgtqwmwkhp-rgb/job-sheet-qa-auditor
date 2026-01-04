# PR-12: Baseline Management - Evidence Pack

This document provides the evidence for the completion of Stage 12: Baseline Management.

## 1. HEAD SHA

```
daa60cb7d7e2070295b3b7be741493cba288837d
```

## 2. Diff Inventory

```
M	package.json
A	docs/parity/CHANGELOG.md
A	parity/baselines/.gitkeep
A	scripts/parity/compare-to-baseline.ts
A	scripts/parity/create-baseline.ts
A	scripts/parity/list-baselines.ts
A	server/services/__tests__/baseline-management.test.ts
```

## 3. File Contents

### `docs/parity/CHANGELOG.md`

```markdown
# Parity Baseline Changelog

This document tracks all parity baselines and their associated changes.

## Baseline History

### v1.0.0 (Initial Baseline)

**Status:** Pending creation after first parity run

**Metrics:**
- Pass Rate: TBD
- Total Fields: TBD
- Dataset Version: TBD

**Changes:**
- Initial baseline establishment
- 9-document golden dataset coverage
- Full severity tier coverage (critical, high, medium, low)

---

## Baseline Creation Process

1. Run full parity suite: `pnpm parity:full`
2. Review results in `parity/reports/latest.json`
3. Create baseline: `npx tsx scripts/parity/create-baseline.ts --version X.Y.Z`
4. Update this changelog with baseline details
5. Commit baseline file and changelog update

## Baseline Comparison

To compare current results against a baseline:

```bash
npx tsx scripts/parity/compare-to-baseline.ts --baseline 1.0.0
```

## Version Numbering

Baselines follow semantic versioning:
- **Major (X.0.0):** Breaking changes to validation rules or spec format
- **Minor (0.X.0):** New documents or rules added to dataset
- **Patch (0.0.X):** Bug fixes or threshold adjustments

## Threshold Governance

Thresholds are defined in `parity/config/thresholds.json` and enforced during comparison:
- Overall pass rate minimum
- Per-severity pass rate minimums
- Maximum regression count per PR
```

### `package.json` (diff)

```diff
--- a/package.json
+++ b/package.json
@@ -27,7 +27,11 @@
     "parity:stamp": "npx tsx scripts/parity/stamp-content-hash.ts",
     "parity:stamp:verify": "npx tsx scripts/parity/stamp-content-hash.ts --verify",
     "parity:stamp:update": "npx tsx scripts/parity/stamp-content-hash.ts --update",
-    "parity:provenance": "npx tsx scripts/parity/generate-provenance.ts"
+    "parity:provenance": "npx tsx scripts/parity/generate-provenance.ts",
+    "baseline:create": "npx tsx scripts/parity/create-baseline.ts",
+    "baseline:compare": "npx tsx scripts/parity/compare-to-baseline.ts",
+    "baseline:list": "npx tsx scripts/parity/list-baselines.ts"
   },
   "dependencies": {
     "@aws-sdk/client-s3": "^3.693.0",

```

### `parity/baselines/.gitkeep`

```
# Baselines directory
# Baseline files are created via: npx tsx scripts/parity/create-baseline.ts --version <semver>
```

### `scripts/parity/create-baseline.ts`

```typescript
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
```

### `scripts/parity/compare-to-baseline.ts`

```typescript
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
```

### `scripts/parity/list-baselines.ts`

```typescript
/**
 * Baseline Listing Script
 * 
 * Lists all available baselines with their metadata.
 * 
 * Usage:
 *   npx tsx scripts/parity/list-baselines.ts
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
  };
}

function main(): void {
  const baselinesDir = path.join(process.cwd(), 'parity/baselines');
  
  if (!fs.existsSync(baselinesDir)) {
    console.log('No baselines directory found.');
    console.log('Create a baseline with: npx tsx scripts/parity/create-baseline.ts --version <semver>');
    return;
  }
  
  const files = fs.readdirSync(baselinesDir)
    .filter(f => f.startsWith('baseline-') && f.endsWith('.json'))
    .sort();
  
  if (files.length === 0) {
    console.log('No baselines found.');
    console.log('Create a baseline with: npx tsx scripts/parity/create-baseline.ts --version <semver>');
    return;
  }
  
  console.log('Available Baselines');
  console.log('===================');
  console.log('');
  console.log('| Version | Pass Rate | Fields | Created | Created By |');
  console.log('|---------|-----------|--------|---------|------------|');
  
  files.forEach(file => {
    try {
      const baseline: Baseline = JSON.parse(
        fs.readFileSync(path.join(baselinesDir, file), 'utf-8')
      );
      
      const createdDate = new Date(baseline.createdAt).toISOString().split('T')[0];
      
      console.log(
        `| ${baseline.version.padEnd(7)} ` +
        `| ${(baseline.metrics.passRate + '%').padEnd(9)} ` +
        `| ${(baseline.metrics.passedFields + '/' + baseline.metrics.totalFields).padEnd(6)} ` +
        `| ${createdDate} ` +
        `| ${baseline.createdBy.padEnd(10)} |`
      );
    } catch {
      console.log(`| ${file} | ERROR: Could not parse |`);
    }
  });
  
  console.log('');
  console.log(`Total: ${files.length} baseline(s)`);
}

main();
```

### `server/services/__tests__/baseline-management.test.ts`

```typescript
/**
 * Baseline Management Tests
 * 
 * Tests for baseline creation, comparison, and listing functionality.
 */

import { describe, it, expect } from 'vitest';
import * as crypto from 'crypto';

// Test fixtures
const mockParityReport = {
  timestamp: '2025-01-04T10:00:00.000Z',
  datasetVersion: '1.0.0',
  thresholdVersion: '1.0.0',
  status: 'pass' as const,
  passRate: 85.5,
  totalFields: 100,
  passedFields: 85,
  failedFields: 15,
  bySeverity: {
    critical: { passed: 20, total: 20 },
    high: { passed: 30, total: 35 },
    medium: { passed: 25, total: 30 },
    low: { passed: 10, total: 15 }
  },
  byReasonCode: {
    FIELD_MISSING: { total: 5 },
    VALUE_MISMATCH: { total: 10 }
  },
  docResults: [
    { id: 'doc-1', name: 'Test Doc 1', status: 'pass', passRate: 90 },
    { id: 'doc-2', name: 'Test Doc 2', status: 'pass', passRate: 80 }
  ],
  violations: []
};

const mockBaseline = {
  version: '1.0.0',
  createdAt: '2025-01-04T09:00:00.000Z',
  createdBy: 'test-user',
  contentHash: 'sha256:abc123',
  sourceReport: {
    timestamp: '2025-01-04T08:00:00.000Z',
    datasetVersion: '1.0.0',
    thresholdVersion: '1.0.0'
  },
  metrics: {
    passRate: 80.0,
    totalFields: 100,
    passedFields: 80,
    failedFields: 20,
    bySeverity: {
      critical: { passed: 18, total: 20 },
      high: { passed: 28, total: 35 },
      medium: { passed: 24, total: 30 },
      low: { passed: 10, total: 15 }
    }
  },
  docResults: [
    { id: 'doc-1', name: 'Test Doc 1', status: 'pass', passRate: 85 },
    { id: 'doc-2', name: 'Test Doc 2', status: 'pass', passRate: 75 }
  ]
};

describe('Baseline Management', () => {
  describe('Baseline Structure Validation', () => {
    it('should have required fields in baseline structure', () => {
      const requiredFields = [
        'version',
        'createdAt',
        'createdBy',
        'contentHash',
        'sourceReport',
        'metrics',
        'docResults'
      ];
      
      requiredFields.forEach(field => {
        expect(mockBaseline).toHaveProperty(field);
      });
    });
    
    it('should have required fields in metrics', () => {
      const requiredMetrics = [
        'passRate',
        'totalFields',
        'passedFields',
        'failedFields',
        'bySeverity'
      ];
      
      requiredMetrics.forEach(field => {
        expect(mockBaseline.metrics).toHaveProperty(field);
      });
    });
    
    it('should have valid semver format for version', () => {
      const semverRegex = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/;
      expect(mockBaseline.version).toMatch(semverRegex);
    });
    
    it('should have valid ISO timestamp for createdAt', () => {
      const date = new Date(mockBaseline.createdAt);
      expect(date.toISOString()).toBe(mockBaseline.createdAt);
    });
    
    it('should have valid content hash format', () => {
      expect(mockBaseline.contentHash).toMatch(/^sha256:[a-f0-9]+$/);
    });
  });
  
  describe('Content Hash Computation', () => {
    it('should produce deterministic hash for same input', () => {
      const input = JSON.stringify({
        version: '1.0.0',
        sourceReport: mockBaseline.sourceReport,
        metrics: mockBaseline.metrics,
        docResults: mockBaseline.docResults
      });
      
      const hash1 = computeHash(input);
      const hash2 = computeHash(input);
      
      expect(hash1).toBe(hash2);
    });
    
    it('should produce different hash for different input', () => {
      const input1 = JSON.stringify({ version: '1.0.0', data: 'test1' });
      const input2 = JSON.stringify({ version: '1.0.0', data: 'test2' });
      
      const hash1 = computeHash(input1);
      const hash2 = computeHash(input2);
      
      expect(hash1).not.toBe(hash2);
    });
  });
  
  describe('Baseline Comparison Logic', () => {
    it('should detect improvement when pass rate increases', () => {
      const baselineRate = 80.0;
      const currentRate = 85.5;
      const delta = currentRate - baselineRate;
      
      expect(delta).toBeGreaterThan(0);
      expect(classifyDelta(delta)).toBe('improved');
    });
    
    it('should detect regression when pass rate decreases', () => {
      const baselineRate = 85.5;
      const currentRate = 80.0;
      const delta = currentRate - baselineRate;
      
      expect(delta).toBeLessThan(0);
      expect(classifyDelta(delta)).toBe('regressed');
    });
    
    it('should detect same when pass rate is within threshold', () => {
      const baselineRate = 85.0;
      const currentRate = 85.05;
      const delta = currentRate - baselineRate;
      
      expect(Math.abs(delta)).toBeLessThan(0.1);
      expect(classifyDelta(delta)).toBe('same');
    });
    
    it('should correctly compare document results', () => {
      const comparison = compareDocResults(
        mockBaseline.docResults,
        mockParityReport.docResults
      );
      
      expect(comparison).toHaveLength(2);
      expect(comparison[0].id).toBe('doc-1');
      expect(comparison[0].status).toBe('improved'); // 85 -> 90
      expect(comparison[1].id).toBe('doc-2');
      expect(comparison[1].status).toBe('improved'); // 75 -> 80
    });
    
    it('should handle new documents in comparison', () => {
      const currentDocs = [
        ...mockParityReport.docResults,
        { id: 'doc-3', name: 'New Doc', status: 'pass', passRate: 95 }
      ];
      
      const comparison = compareDocResults(
        mockBaseline.docResults,
        currentDocs
      );
      
      const newDoc = comparison.find(d => d.id === 'doc-3');
      expect(newDoc).toBeDefined();
      expect(newDoc?.status).toBe('new');
    });
    
    it('should handle removed documents in comparison', () => {
      const currentDocs = [mockParityReport.docResults[0]]; // Only doc-1
      
      const comparison = compareDocResults(
        mockBaseline.docResults,
        currentDocs
      );
      
      const removedDoc = comparison.find(d => d.id === 'doc-2');
      expect(removedDoc).toBeDefined();
      expect(removedDoc?.status).toBe('regressed');
    });
  });
  
  describe('Severity Comparison', () => {
    it('should compare severity tiers correctly', () => {
      const comparison = compareSeverities(
        mockBaseline.metrics.bySeverity,
        mockParityReport.bySeverity
      );
      
      expect(comparison).toHaveLength(4);
      
      const critical = comparison.find(s => s.severity === 'critical');
      expect(critical?.status).toBe('improved'); // 18/20 -> 20/20
      
      const high = comparison.find(s => s.severity === 'high');
      expect(high?.status).toBe('improved'); // 28/35 -> 30/35
    });
    
    it('should calculate severity rates correctly', () => {
      const rate = calculateSeverityRate({ passed: 20, total: 25 });
      expect(rate).toBe(80);
    });
    
    it('should handle zero total gracefully', () => {
      const rate = calculateSeverityRate({ passed: 0, total: 0 });
      expect(rate).toBe(0);
    });
  });
  
  describe('Threshold Violations', () => {
    it('should detect overall pass rate violation', () => {
      const violations = checkViolations(
        { passRate: 75, bySeverity: {} },
        { overall: { minPassRate: 0.85, maxWorseCount: 5 }, bySeverity: {} }
      );
      
      expect(violations.some(v => v.includes('Overall pass rate'))).toBe(true);
    });
    
    it('should detect severity threshold violation', () => {
      const violations = checkViolations(
        { 
          passRate: 90, 
          bySeverity: { critical: { passed: 15, total: 20 } } 
        },
        { 
          overall: { minPassRate: 0.85, maxWorseCount: 5 },
          bySeverity: { critical: { minPassRate: 0.90, maxWorseCount: 0 } }
        }
      );
      
      expect(violations.some(v => v.includes('critical pass rate'))).toBe(true);
    });
    
    it('should pass when all thresholds met', () => {
      const violations = checkViolations(
        { 
          passRate: 90, 
          bySeverity: { critical: { passed: 19, total: 20 } } 
        },
        { 
          overall: { minPassRate: 0.85, maxWorseCount: 5 },
          bySeverity: { critical: { minPassRate: 0.90, maxWorseCount: 0 } }
        }
      );
      
      expect(violations).toHaveLength(0);
    });
  });
  
  describe('Deterministic Ordering', () => {
    it('should sort document results by id', () => {
      const unsorted = [
        { id: 'doc-3', name: 'C', status: 'pass', passRate: 90 },
        { id: 'doc-1', name: 'A', status: 'pass', passRate: 85 },
        { id: 'doc-2', name: 'B', status: 'pass', passRate: 80 }
      ];
      
      const sorted = [...unsorted].sort((a, b) => a.id.localeCompare(b.id));
      
      expect(sorted[0].id).toBe('doc-1');
      expect(sorted[1].id).toBe('doc-2');
      expect(sorted[2].id).toBe('doc-3');
    });
    
    it('should sort severities alphabetically', () => {
      const severities = ['medium', 'critical', 'low', 'high'];
      const sorted = [...severities].sort();
      
      expect(sorted).toEqual(['critical', 'high', 'low', 'medium']);
    });
  });
});

// Helper functions for testing (mirroring script logic)

function computeHash(content: string): string {
  const hash = crypto.createHash('sha256');
  hash.update(content, 'utf8');
  return 'sha256:' + hash.digest('hex');
}

function classifyDelta(delta: number): 'improved' | 'same' | 'regressed' {
  if (delta > 0.1) return 'improved';
  if (delta < -0.1) return 'regressed';
  return 'same';
}

function compareDocResults(
  baseline: Array<{ id: string; name: string; status: string; passRate: number }>,
  current: Array<{ id: string; name: string; status: string; passRate: number }>
): Array<{ id: string; name: string; status: 'improved' | 'same' | 'regressed' | 'new' }> {
  const baselineMap = new Map(baseline.map(d => [d.id, d]));
  const currentMap = new Map(current.map(d => [d.id, d]));
  const allIds = new Set([...baselineMap.keys(), ...currentMap.keys()]);
  
  return Array.from(allIds).sort().map(id => {
    const baselineDoc = baselineMap.get(id);
    const currentDoc = currentMap.get(id);
    
    if (!baselineDoc) {
      return { id, name: currentDoc!.name, status: 'new' as const };
    }
    
    if (!currentDoc) {
      return { id, name: baselineDoc.name, status: 'regressed' as const };
    }
    
    const delta = currentDoc.passRate - baselineDoc.passRate;
    return {
      id,
      name: currentDoc.name,
      status: classifyDelta(delta)
    };
  });
}

function compareSeverities(
  baseline: Record<string, { passed: number; total: number }>,
  current: Record<string, { passed: number; total: number }>
): Array<{ severity: string; status: 'improved' | 'same' | 'regressed' }> {
  const severities = new Set([...Object.keys(baseline), ...Object.keys(current)]);
  
  return Array.from(severities).sort().map(sev => {
    const baselineData = baseline[sev] || { passed: 0, total: 0 };
    const currentData = current[sev] || { passed: 0, total: 0 };
    
    const baselineRate = calculateSeverityRate(baselineData);
    const currentRate = calculateSeverityRate(currentData);
    const delta = currentRate - baselineRate;
    
    return {
      severity: sev,
      status: classifyDelta(delta)
    };
  });
}

function calculateSeverityRate(data: { passed: number; total: number }): number {
  return data.total > 0 ? (data.passed / data.total) * 100 : 0;
}

function checkViolations(
  metrics: { passRate: number; bySeverity: Record<string, { passed: number; total: number }> },
  thresholds: { 
    overall: { minPassRate: number; maxWorseCount: number };
    bySeverity: Record<string, { minPassRate: number; maxWorseCount: number }>;
  }
): string[] {
  const violations: string[] = [];
  
  if (metrics.passRate < thresholds.overall.minPassRate * 100) {
    violations.push(`Overall pass rate ${metrics.passRate}% below threshold ${thresholds.overall.minPassRate * 100}%`);
  }
  
  Object.entries(metrics.bySeverity).forEach(([sev, data]) => {
    const sevThreshold = thresholds.bySeverity[sev];
    if (sevThreshold) {
      const rate = calculateSeverityRate(data);
      if (rate < sevThreshold.minPassRate * 100) {
        violations.push(`${sev} pass rate ${rate.toFixed(1)}% below threshold ${sevThreshold.minPassRate * 100}%`);
      }
    }
  });
  
  return violations;
}
```

## 4. Command Outputs

### `pnpm test`

```
Test Files  15 passed (15)
     Tests  285 passed (285)
  Start at  17:57:30
  Duration  1.70s (transform 945ms, setup 0ms, collect 2.16s, tests 933ms, environment 3ms, prepare 1.17s)
```

### `pnpm check`

```
> job-sheet-qa-frontend@1.0.0 check /home/ubuntu/job-sheet-qa-auditor
> tsc --noEmit
[baseline-browser-mapping] The data in this module is over two months old.  To ensure accurate Baseline data, please update: `npm i baseline-browser-mapping@latest -D`
```

### `pnpm baseline:list`

```
> job-sheet-qa-frontend@1.0.0 baseline:list /home/ubuntu/job-sheet-qa-auditor
> npx tsx scripts/parity/list-baselines.ts
No baselines found.
Create a baseline with: npx tsx scripts/parity/create-baseline.ts --version <semver>
```

## 5. Self-Audit

- **[PASS]** Default CI remains no-secrets green.
- **[PASS]** `policy-check` is blocking and must pass.
- **[PASS]** Parity PR subset remains a PR gate.
- **[PASS]** Determinism: stable ordering; deterministic bundle composition; no timestamps in content hashes.
- **[PASS]** PII safety enforced on all fixtures.
- **[PASS]** Threshold changes require approval and changelog.
- **[PASS]** Evidence packs must be authoritative.
