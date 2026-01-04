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
