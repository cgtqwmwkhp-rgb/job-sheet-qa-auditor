/**
 * Golden Dataset Content Hash Stamping
 * 
 * Computes a deterministic SHA-256 hash over the canonicalized golden dataset
 * and verifies/updates the contentHash field.
 * 
 * Usage:
 *   npx tsx scripts/parity/stamp-content-hash.ts [--verify | --update]
 * 
 * Options:
 *   --verify  Check that contentHash matches computed value (CI mode, fails if mismatch)
 *   --update  Update contentHash to computed value (development mode)
 * 
 * Default: --verify
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

interface GoldenDataset {
  version: string;
  contentHash?: string;
  documents: unknown[];
  rules: unknown[];
  reasonCodes: Record<string, string>;
}

/**
 * Canonicalize JSON for deterministic hashing
 * - Stable key ordering (alphabetical)
 * - No whitespace dependence
 * - Excludes contentHash field from hash input
 */
function canonicalize(obj: unknown): string {
  if (obj === null || obj === undefined) {
    return 'null';
  }
  
  if (typeof obj === 'boolean' || typeof obj === 'number') {
    return JSON.stringify(obj);
  }
  
  if (typeof obj === 'string') {
    return JSON.stringify(obj);
  }
  
  if (Array.isArray(obj)) {
    const items = obj.map(item => canonicalize(item));
    return '[' + items.join(',') + ']';
  }
  
  if (typeof obj === 'object') {
    const keys = Object.keys(obj as Record<string, unknown>).sort();
    const pairs = keys
      .filter(key => key !== 'contentHash') // Exclude contentHash from hash input
      .map(key => {
        const value = (obj as Record<string, unknown>)[key];
        return JSON.stringify(key) + ':' + canonicalize(value);
      });
    return '{' + pairs.join(',') + '}';
  }
  
  return '';
}

/**
 * Compute SHA-256 hash of canonicalized content
 */
function computeHash(content: string): string {
  const hash = crypto.createHash('sha256');
  hash.update(content, 'utf8');
  return 'sha256:' + hash.digest('hex');
}

function main(): void {
  const args = process.argv.slice(2);
  const mode = args.includes('--update') ? 'update' : 'verify';
  
  const datasetPath = path.join(process.cwd(), 'parity/fixtures/golden-dataset.json');
  
  if (!fs.existsSync(datasetPath)) {
    console.error('❌ Golden dataset not found:', datasetPath);
    process.exit(1);
  }
  
  // Read dataset
  const rawContent = fs.readFileSync(datasetPath, 'utf-8');
  const dataset: GoldenDataset = JSON.parse(rawContent);
  
  // Compute canonical hash
  const canonical = canonicalize(dataset);
  const computedHash = computeHash(canonical);
  
  console.log('Golden Dataset Hash Verification');
  console.log('================================');
  console.log(`Dataset Version: ${dataset.version}`);
  console.log(`Computed Hash:   ${computedHash}`);
  console.log(`Stored Hash:     ${dataset.contentHash || '(none)'}`);
  console.log('');
  
  if (mode === 'verify') {
    if (!dataset.contentHash) {
      console.error('❌ FAIL: contentHash field is missing');
      console.error('   Run with --update to stamp the hash');
      process.exit(1);
    }
    
    if (dataset.contentHash !== computedHash) {
      console.error('❌ FAIL: contentHash mismatch');
      console.error('   Expected:', computedHash);
      console.error('   Found:   ', dataset.contentHash);
      console.error('');
      console.error('   The dataset has been modified without updating the hash.');
      console.error('   Run with --update to re-stamp the hash.');
      process.exit(1);
    }
    
    console.log('✅ PASS: contentHash matches computed value');
    process.exit(0);
  }
  
  if (mode === 'update') {
    if (dataset.contentHash === computedHash) {
      console.log('✅ contentHash already up to date');
      process.exit(0);
    }
    
    // Update the contentHash
    dataset.contentHash = computedHash;
    
    // Write back with pretty formatting (2 spaces)
    const updatedContent = JSON.stringify(dataset, null, 2) + '\n';
    fs.writeFileSync(datasetPath, updatedContent, 'utf-8');
    
    console.log('✅ contentHash updated');
    console.log(`   New hash: ${computedHash}`);
    process.exit(0);
  }
}

main();
