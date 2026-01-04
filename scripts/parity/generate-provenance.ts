/**
 * Provenance Artifact Generator
 * 
 * Generates a provenance.json file containing:
 * - Dataset version and content hash
 * - Thresholds version hash
 * - Git HEAD SHA
 * - CI run ID (if available)
 * - Timestamp
 * 
 * Usage:
 *   npx tsx scripts/parity/generate-provenance.ts [--ci-run-id <id>]
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { execSync } from 'child_process';

interface GoldenDataset {
  version: string;
  contentHash: string;
}

interface ThresholdConfig {
  version: string;
}

interface Provenance {
  generatedAt: string;
  datasetVersion: string;
  datasetContentHash: string;
  thresholdsVersion: string;
  thresholdsContentHash: string;
  gitHeadSha: string;
  gitBranch: string;
  ciRunId?: string;
  ciRunUrl?: string;
}

/**
 * Compute SHA-256 hash of file content
 */
function computeFileHash(filePath: string): string {
  const content = fs.readFileSync(filePath, 'utf-8');
  const hash = crypto.createHash('sha256');
  hash.update(content, 'utf8');
  return 'sha256:' + hash.digest('hex');
}

/**
 * Get git HEAD SHA
 */
function getGitHeadSha(): string {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

/**
 * Get git branch name
 */
function getGitBranch(): string {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

function main(): void {
  const args = process.argv.slice(2);
  let ciRunId: string | undefined;
  let ciRunUrl: string | undefined;
  
  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--ci-run-id' && args[i + 1]) {
      ciRunId = args[i + 1];
      i++;
    }
    if (args[i] === '--ci-run-url' && args[i + 1]) {
      ciRunUrl = args[i + 1];
      i++;
    }
  }
  
  // Also check environment variables (GitHub Actions)
  if (!ciRunId && process.env.GITHUB_RUN_ID) {
    ciRunId = process.env.GITHUB_RUN_ID;
  }
  if (!ciRunUrl && process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID) {
    ciRunUrl = `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`;
  }
  
  const datasetPath = path.join(process.cwd(), 'parity/fixtures/golden-dataset.json');
  const thresholdsPath = path.join(process.cwd(), 'parity/config/thresholds.json');
  const outputPath = path.join(process.cwd(), 'parity/provenance.json');
  
  // Read dataset
  if (!fs.existsSync(datasetPath)) {
    console.error('❌ Golden dataset not found:', datasetPath);
    process.exit(1);
  }
  const dataset: GoldenDataset = JSON.parse(fs.readFileSync(datasetPath, 'utf-8'));
  
  // Read thresholds
  if (!fs.existsSync(thresholdsPath)) {
    console.error('❌ Thresholds config not found:', thresholdsPath);
    process.exit(1);
  }
  const thresholds: ThresholdConfig = JSON.parse(fs.readFileSync(thresholdsPath, 'utf-8'));
  
  // Generate provenance
  const provenance: Provenance = {
    generatedAt: new Date().toISOString(),
    datasetVersion: dataset.version,
    datasetContentHash: dataset.contentHash,
    thresholdsVersion: thresholds.version,
    thresholdsContentHash: computeFileHash(thresholdsPath),
    gitHeadSha: getGitHeadSha(),
    gitBranch: getGitBranch(),
  };
  
  // Add CI info if available (not included in any hash computation)
  if (ciRunId) {
    provenance.ciRunId = ciRunId;
  }
  if (ciRunUrl) {
    provenance.ciRunUrl = ciRunUrl;
  }
  
  // Ensure output directory exists
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Write provenance
  fs.writeFileSync(outputPath, JSON.stringify(provenance, null, 2) + '\n', 'utf-8');
  
  console.log('Provenance Artifact Generated');
  console.log('=============================');
  console.log(JSON.stringify(provenance, null, 2));
  console.log('');
  console.log(`✅ Written to: ${outputPath}`);
}

main();
