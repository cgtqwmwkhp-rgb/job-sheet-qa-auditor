#!/usr/bin/env tsx
/**
 * Template Import Pack Script
 * 
 * PR-F: CLI tool for bulk importing templates from JSON packs.
 * 
 * Usage:
 *   pnpm tsx scripts/templates/import-pack.ts --file=import-pack.json
 *   pnpm tsx scripts/templates/import-pack.ts --file=import-pack.json --dry-run
 */

import { readFileSync, existsSync } from 'fs';

/**
 * Parse command line arguments
 */
function parseArgs(): { filePath: string; dryRun: boolean; createdBy: number } {
  const args = process.argv.slice(2);
  let filePath: string | undefined;
  let dryRun = false;
  let createdBy = 1; // Default system user

  for (const arg of args) {
    if (arg.startsWith('--file=')) {
      filePath = arg.split('=')[1];
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg.startsWith('--createdBy=')) {
      createdBy = parseInt(arg.split('=')[1], 10);
    }
  }

  if (!filePath) {
    console.error('Usage: import-pack.ts --file=<path> [--dry-run] [--createdBy=<userId>]');
    process.exit(1);
  }

  return { filePath, dryRun, createdBy };
}

/**
 * Main entry point
 */
async function main() {
  const { filePath, dryRun, createdBy } = parseArgs();

  console.log(`📦 Template Import Pack`);
  console.log(`📄 File: ${filePath}`);
  console.log(`🔍 Dry Run: ${dryRun ? 'Yes' : 'No'}`);
  console.log(`👤 Created By: ${createdBy}`);
  console.log('');

  // Check file exists
  if (!existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    process.exit(1);
  }

  // Read and parse JSON
  let pack;
  try {
    const content = readFileSync(filePath, 'utf-8');
    pack = JSON.parse(content);
  } catch (error) {
    console.error(`❌ Failed to parse JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exit(1);
  }

  // Import dynamically
  const { validateBulkImportPack, importBulkPack } = await import('../../server/services/templateRegistry');

  // Validate pack
  console.log('🔍 Validating import pack...');
  const validation = validateBulkImportPack(pack);
  
  if (!validation.valid) {
    console.error('❌ Validation failed:');
    for (const error of validation.errors) {
      console.error(`   • ${error}`);
    }
    process.exit(1);
  }

  console.log('✅ Pack validated successfully');
  console.log(`   Templates: ${pack.templates.length}`);
  console.log('');

  // List templates to import
  console.log('📋 Templates to import:');
  for (const template of pack.templates) {
    console.log(`   • ${template.metadata.templateId} (${template.metadata.name}) v${template.version}`);
    if (template.fixtures?.length) {
      console.log(`     └─ ${template.fixtures.length} fixture case(s)`);
    }
    if (template.roiJson) {
      console.log(`     └─ ROI config with ${template.roiJson.regions?.length || 0} region(s)`);
    }
  }
  console.log('');

  // If dry run, stop here
  if (dryRun) {
    console.log('🛑 Dry run - no changes made');
    process.exit(0);
  }

  // Import
  console.log('📥 Importing templates...');
  const result = importBulkPack(pack, createdBy);

  // Print results
  console.log('\n' + '='.repeat(60));
  console.log(`📊 IMPORT RESULTS`);
  console.log('='.repeat(60));
  console.log(`Overall: ${result.success ? '✅ SUCCESS' : '❌ FAILED'}`);
  console.log(`Total: ${result.totalTemplates}`);
  console.log(`Success: ${result.successCount}`);
  console.log(`Failed: ${result.failureCount}`);
  console.log(`Duration: ${result.durationMs}ms`);
  console.log('='.repeat(60));

  // Print individual results
  for (const templateResult of result.results) {
    const status = templateResult.success ? '✅' : '❌';
    console.log(`${status} ${templateResult.templateId}`);
    
    if (templateResult.created.templateDbId) {
      console.log(`   Template ID: ${templateResult.created.templateDbId}`);
    }
    if (templateResult.created.versionDbId) {
      console.log(`   Version ID: ${templateResult.created.versionDbId}`);
    }
    if (templateResult.created.fixturePackCreated) {
      console.log(`   Fixtures: Created`);
    }
    
    for (const warning of templateResult.warnings) {
      console.log(`   ⚠️  ${warning}`);
    }
    
    for (const error of templateResult.errors) {
      console.log(`   ❌ ${error}`);
    }
  }

  // Exit with appropriate code
  process.exit(result.success ? 0 : 1);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
