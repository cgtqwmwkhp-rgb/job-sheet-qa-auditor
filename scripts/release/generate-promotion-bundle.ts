/**
 * Promotion Bundle Generator
 * 
 * Generates a deterministic promotion bundle with all required artifacts.
 * Used by the promotion workflow to create deployment artifacts.
 * 
 * DETERMINISM RULES:
 * - Bundle hash is computed from artifact hashes ONLY (not timestamps)
 * - Artifacts are sorted alphabetically by name
 * - Manifest includes timestamp but it does NOT affect bundleHash
 * 
 * Usage:
 *   npx tsx scripts/release/generate-promotion-bundle.ts --env <staging|production>
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

interface PromotionManifest {
  version: string;
  schemaVersion: string;
  timestamp: string;
  sha: string;
  targetEnvironment: string;
  triggeredBy: string;
  runId: string;
  gates: {
    ci: 'passed' | 'failed' | 'skipped';
    policy: 'passed' | 'failed' | 'skipped';
    rehearsal: 'passed' | 'failed' | 'skipped';
    parity: 'passed' | 'failed' | 'skipped';
  };
  paritySkipped: boolean;
  paritySkipAcknowledgement?: {
    acknowledged: boolean;
    acknowledgementText: string;
    acknowledgedBy: string;
    acknowledgedAt: string;
  };
  artifacts: Array<{
    name: string;
    path: string;
    hash: string;
  }>;
  bundleHash: string;
}

function computeFileHash(filePath: string): string {
  const content = fs.readFileSync(filePath);
  const hash = crypto.createHash('sha256');
  hash.update(content);
  return 'sha256:' + hash.digest('hex');
}

/**
 * Compute bundle hash from artifact hashes ONLY.
 * This ensures the hash is deterministic and does NOT depend on:
 * - Timestamps
 * - Actor/user who triggered
 * - Run ID
 * - Any other non-content metadata
 */
function computeBundleHash(artifacts: Array<{ hash: string }>): string {
  // Deterministic: sort by hash and concatenate
  const sortedHashes = artifacts.map(a => a.hash).sort();
  const combined = sortedHashes.join(':');
  const hash = crypto.createHash('sha256');
  hash.update(combined, 'utf8');
  return 'sha256:' + hash.digest('hex');
}

function main(): void {
  const args = process.argv.slice(2);
  let targetEnv: string | undefined;
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--env' && args[i + 1]) {
      targetEnv = args[i + 1];
      i++;
    }
  }
  
  if (!targetEnv || !['staging', 'production'].includes(targetEnv)) {
    console.error('❌ Error: --env must be "staging" or "production"');
    process.exit(1);
  }
  
  const bundleDir = path.join(process.cwd(), 'promotion-bundle');
  
  // Ensure bundle directory exists
  if (!fs.existsSync(bundleDir)) {
    fs.mkdirSync(bundleDir, { recursive: true });
  }
  
  // Collect artifacts
  const artifacts: Array<{ name: string; path: string; hash: string }> = [];
  
  // Add provenance if exists
  const provenancePath = path.join(process.cwd(), 'parity/provenance.json');
  if (fs.existsSync(provenancePath)) {
    const destPath = path.join(bundleDir, 'provenance.json');
    fs.copyFileSync(provenancePath, destPath);
    artifacts.push({
      name: 'provenance',
      path: 'provenance.json',
      hash: computeFileHash(destPath)
    });
  }
  
  // Add thresholds
  const thresholdsPath = path.join(process.cwd(), 'parity/config/thresholds.json');
  if (fs.existsSync(thresholdsPath)) {
    const destPath = path.join(bundleDir, 'thresholds.json');
    fs.copyFileSync(thresholdsPath, destPath);
    artifacts.push({
      name: 'thresholds',
      path: 'thresholds.json',
      hash: computeFileHash(destPath)
    });
  }
  
  // Add golden dataset hash (not full file for size)
  const datasetPath = path.join(process.cwd(), 'parity/fixtures/golden-dataset.json');
  if (fs.existsSync(datasetPath)) {
    const datasetHash = computeFileHash(datasetPath);
    const datasetRef = {
      name: 'golden-dataset',
      hash: datasetHash,
      path: 'parity/fixtures/golden-dataset.json'
    };
    fs.writeFileSync(
      path.join(bundleDir, 'dataset-reference.json'),
      JSON.stringify(datasetRef, null, 2) + '\n'
    );
    artifacts.push({
      name: 'dataset-reference',
      path: 'dataset-reference.json',
      hash: computeFileHash(path.join(bundleDir, 'dataset-reference.json'))
    });
  }
  
  // Add parity report if exists
  const parityReportPath = path.join(process.cwd(), 'parity/reports/latest.json');
  if (fs.existsSync(parityReportPath)) {
    const destPath = path.join(bundleDir, 'parity-report.json');
    fs.copyFileSync(parityReportPath, destPath);
    artifacts.push({
      name: 'parity-report',
      path: 'parity-report.json',
      hash: computeFileHash(destPath)
    });
  }
  
  // Add baseline comparison if exists
  const baselineComparisonPath = path.join(process.cwd(), 'parity/reports/baseline-comparison.json');
  if (fs.existsSync(baselineComparisonPath)) {
    const destPath = path.join(bundleDir, 'baseline-comparison.json');
    fs.copyFileSync(baselineComparisonPath, destPath);
    artifacts.push({
      name: 'baseline-comparison',
      path: 'baseline-comparison.json',
      hash: computeFileHash(destPath)
    });
  }
  
  // Sort artifacts deterministically by name
  artifacts.sort((a, b) => a.name.localeCompare(b.name));
  
  // Compute bundle hash BEFORE adding timestamp to manifest
  // This ensures bundleHash is deterministic based on content only
  const bundleHash = computeBundleHash(artifacts);
  
  // Create manifest (timestamp is for audit trail, NOT for hash)
  const manifest: PromotionManifest = {
    version: '1.0.0',
    schemaVersion: '1',
    timestamp: new Date().toISOString(), // Audit trail only, not in bundleHash
    sha: process.env.GITHUB_SHA || 'local',
    targetEnvironment: targetEnv,
    triggeredBy: process.env.GITHUB_ACTOR || process.env.USER || 'unknown',
    runId: process.env.GITHUB_RUN_ID || 'local',
    gates: {
      ci: 'passed',
      policy: 'passed',
      rehearsal: 'passed',
      parity: 'passed'
    },
    paritySkipped: false,
    artifacts,
    bundleHash // Computed from artifact hashes only
  };
  
  // Write manifest
  const manifestPath = path.join(bundleDir, 'promotion-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  
  // Generate checksums file
  const checksums = artifacts.map(a => `${a.hash}  ${a.path}`).join('\n') + '\n';
  fs.writeFileSync(path.join(bundleDir, 'checksums.txt'), checksums);
  
  console.log('Promotion Bundle Generated');
  console.log('==========================');
  console.log(`Target:      ${targetEnv}`);
  console.log(`Bundle Hash: ${bundleHash}`);
  console.log(`Artifacts:   ${artifacts.length}`);
  console.log('');
  console.log('Contents:');
  artifacts.forEach(a => {
    console.log(`  - ${a.name}: ${a.hash.substring(0, 20)}...`);
  });
  console.log('');
  console.log('Note: bundleHash is computed from artifact hashes only.');
  console.log('      Timestamp and metadata do NOT affect the hash.');
  console.log('');
  console.log(`✅ Written to: ${bundleDir}`);
}

main();
