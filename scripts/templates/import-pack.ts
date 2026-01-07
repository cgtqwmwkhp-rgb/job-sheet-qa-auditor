#!/usr/bin/env npx ts-node
/**
 * Template Import Pack Script
 * 
 * Validates and imports template packs into the system.
 * Does NOT activate templates - activation requires approval + fixture suite pass.
 * 
 * Usage:
 *   npx ts-node scripts/templates/import-pack.ts <pack-file.json>
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// ============================================================================
// Types
// ============================================================================

interface FieldRule {
  field: string;
  label: string;
  required: boolean;
  type: string;
  description?: string;
}

interface ValidationRule {
  ruleId: string;
  field: string;
  type: string;
  description?: string;
}

interface SelectionCriteria {
  method: string;
  requiredTokensAll?: string[];
  requiredTokensAny?: string[];
  optionalTokens?: string[];
  excludeTokens?: string[];
  formCodeRegex?: string;
}

interface Template {
  templateId: string;
  displayName: string;
  version: string;
  documentType: string;
  client: string;
  description?: string;
  fieldRules: FieldRule[];
  validationRules: ValidationRule[];
  selection?: SelectionCriteria;
}

interface SpecPack {
  packId: string;
  packVersion: string;
  client: string;
  description?: string;
  templates: Template[];
}

interface ImportResult {
  templateId: string;
  status: 'accepted' | 'rejected';
  version: string;
  versionHash: string;
  reasons: string[];
}

interface ImportReport {
  packId: string;
  packVersion: string;
  importedAt: string;
  totalTemplates: number;
  accepted: ImportResult[];
  rejected: ImportResult[];
}

// ============================================================================
// Critical Fields (must be configured)
// ============================================================================

const CRITICAL_FIELDS = [
  'jobReference',
  'assetId',
  'completionDate',
  'expiryDate',
  'engineerSignature',
  'checklistStatus',
];

// ============================================================================
// Validation Functions
// ============================================================================

function validatePackSchema(pack: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!pack || typeof pack !== 'object') {
    return { valid: false, errors: ['Pack must be an object'] };
  }
  
  const p = pack as Record<string, unknown>;
  
  if (!p.packId || typeof p.packId !== 'string') {
    errors.push('packId is required and must be a string');
  }
  
  if (!p.packVersion || typeof p.packVersion !== 'string') {
    errors.push('packVersion is required and must be a string');
  }
  
  if (!p.client || typeof p.client !== 'string') {
    errors.push('client is required and must be a string');
  }
  
  if (!Array.isArray(p.templates)) {
    errors.push('templates must be an array');
    return { valid: false, errors };
  }
  
  return { valid: errors.length === 0, errors };
}

function validateTemplate(template: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!template || typeof template !== 'object') {
    return { valid: false, errors: ['Template must be an object'] };
  }
  
  const t = template as Record<string, unknown>;
  
  // Required fields
  if (!t.templateId || typeof t.templateId !== 'string') {
    errors.push('templateId is required and must be a string');
  }
  
  if (!t.displayName || typeof t.displayName !== 'string') {
    errors.push('displayName is required and must be a string');
  }
  
  if (!t.version || typeof t.version !== 'string') {
    errors.push('version is required and must be a string');
  }
  
  if (!t.documentType || typeof t.documentType !== 'string') {
    errors.push('documentType is required and must be a string');
  }
  
  if (!t.client || typeof t.client !== 'string') {
    errors.push('client is required and must be a string');
  }
  
  // Field rules
  if (!Array.isArray(t.fieldRules)) {
    errors.push('fieldRules must be an array');
  } else {
    const fieldNames = new Set<string>();
    for (const rule of t.fieldRules) {
      if (!rule.field || typeof rule.field !== 'string') {
        errors.push('Each fieldRule must have a field property');
      } else {
        if (fieldNames.has(rule.field)) {
          errors.push(`Duplicate field: ${rule.field}`);
        }
        fieldNames.add(rule.field);
      }
    }
  }
  
  // Validation rules
  if (!Array.isArray(t.validationRules)) {
    errors.push('validationRules must be an array');
  } else {
    const ruleIds = new Set<string>();
    for (const rule of t.validationRules) {
      if (!rule.ruleId || typeof rule.ruleId !== 'string') {
        errors.push('Each validationRule must have a ruleId property');
      } else {
        if (ruleIds.has(rule.ruleId)) {
          errors.push(`Duplicate ruleId: ${rule.ruleId}`);
        }
        ruleIds.add(rule.ruleId);
      }
    }
  }
  
  return { valid: errors.length === 0, errors };
}

function checkCriticalFields(template: Template): { configured: string[]; missing: string[] } {
  const configured: string[] = [];
  const missing: string[] = [];
  
  const fieldNames = new Set(template.fieldRules.map(r => r.field.toLowerCase()));
  
  for (const critical of CRITICAL_FIELDS) {
    // Check for exact match or common variations
    const variations = [
      critical,
      critical.toLowerCase(),
      critical.replace(/([A-Z])/g, '_$1').toLowerCase(), // camelCase to snake_case
    ];
    
    const found = variations.some(v => 
      fieldNames.has(v) || 
      Array.from(fieldNames).some(f => f.includes(v.replace(/_/g, '')))
    );
    
    if (found) {
      configured.push(critical);
    } else {
      missing.push(critical);
    }
  }
  
  return { configured, missing };
}

// ============================================================================
// Hash Generation
// ============================================================================

function generateVersionHash(template: Template): string {
  // Create deterministic JSON for hashing
  const content = JSON.stringify({
    templateId: template.templateId,
    version: template.version,
    fieldRules: template.fieldRules,
    validationRules: template.validationRules,
    selection: template.selection,
  }, Object.keys(template).sort());
  
  return crypto.createHash('sha256').update(content).digest('hex').substring(0, 12);
}

// ============================================================================
// Import Logic
// ============================================================================

function importPack(packPath: string): ImportReport {
  // Read pack file
  const packContent = fs.readFileSync(packPath, 'utf-8');
  let pack: SpecPack;
  
  try {
    pack = JSON.parse(packContent);
  } catch (e) {
    throw new Error(`Invalid JSON in pack file: ${e}`);
  }
  
  // Validate pack schema
  const packValidation = validatePackSchema(pack);
  if (!packValidation.valid) {
    throw new Error(`Invalid pack schema: ${packValidation.errors.join(', ')}`);
  }
  
  const accepted: ImportResult[] = [];
  const rejected: ImportResult[] = [];
  
  for (const template of pack.templates) {
    const result: ImportResult = {
      templateId: template.templateId || 'UNKNOWN',
      status: 'accepted',
      version: template.version || 'UNKNOWN',
      versionHash: '',
      reasons: [],
    };
    
    // Validate template
    const templateValidation = validateTemplate(template);
    if (!templateValidation.valid) {
      result.status = 'rejected';
      result.reasons.push(...templateValidation.errors.map(e => `SCHEMA_ERROR: ${e}`));
      rejected.push(result);
      continue;
    }
    
    // Check critical fields
    const criticalCheck = checkCriticalFields(template);
    if (criticalCheck.missing.length > 0) {
      result.reasons.push(`SPEC_GAP: Missing critical fields: ${criticalCheck.missing.join(', ')}`);
      // Not a rejection, but a warning
    }
    
    // Generate version hash
    result.versionHash = generateVersionHash(template);
    
    // Check for selection criteria
    if (!template.selection) {
      result.reasons.push('SPEC_GAP: No selection criteria defined - manual selection only');
    }
    
    if (result.status === 'accepted') {
      accepted.push(result);
    }
  }
  
  return {
    packId: pack.packId,
    packVersion: pack.packVersion,
    importedAt: new Date().toISOString(),
    totalTemplates: pack.templates.length,
    accepted,
    rejected,
  };
}

// ============================================================================
// Output Functions
// ============================================================================

function writeImportReport(report: ImportReport, outputPath: string): void {
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
}

function printReport(report: ImportReport): void {
  console.log('\n========================================');
  console.log('TEMPLATE IMPORT REPORT');
  console.log('========================================');
  console.log(`Pack ID: ${report.packId}`);
  console.log(`Pack Version: ${report.packVersion}`);
  console.log(`Imported At: ${report.importedAt}`);
  console.log(`Total Templates: ${report.totalTemplates}`);
  console.log(`Accepted: ${report.accepted.length}`);
  console.log(`Rejected: ${report.rejected.length}`);
  
  if (report.accepted.length > 0) {
    console.log('\n--- ACCEPTED ---');
    for (const result of report.accepted) {
      console.log(`  ✓ ${result.templateId} (v${result.version}) [${result.versionHash}]`);
      for (const reason of result.reasons) {
        console.log(`    ⚠ ${reason}`);
      }
    }
  }
  
  if (report.rejected.length > 0) {
    console.log('\n--- REJECTED ---');
    for (const result of report.rejected) {
      console.log(`  ✗ ${result.templateId} (v${result.version})`);
      for (const reason of result.reasons) {
        console.log(`    ✗ ${reason}`);
      }
    }
  }
  
  console.log('\n========================================');
  console.log('NOTE: Templates are NOT activated.');
  console.log('Activation requires: approval + fixture suite pass');
  console.log('========================================\n');
}

// ============================================================================
// Main
// ============================================================================

function main(): void {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.error('Usage: npx ts-node scripts/templates/import-pack.ts <pack-file.json>');
    process.exit(1);
  }
  
  const packPath = args[0];
  
  if (!fs.existsSync(packPath)) {
    console.error(`Pack file not found: ${packPath}`);
    process.exit(1);
  }
  
  try {
    const report = importPack(packPath);
    
    // Write report to artifacts directory
    const artifactsDir = path.join(process.cwd(), 'artifacts', 'import');
    if (!fs.existsSync(artifactsDir)) {
      fs.mkdirSync(artifactsDir, { recursive: true });
    }
    
    const reportPath = path.join(artifactsDir, `import-report-${Date.now()}.json`);
    writeImportReport(report, reportPath);
    
    printReport(report);
    
    console.log(`Report saved to: ${reportPath}`);
    
    // Exit with error if any templates were rejected
    if (report.rejected.length > 0) {
      process.exit(1);
    }
  } catch (e) {
    console.error(`Import failed: ${e}`);
    process.exit(1);
  }
}

// Export for testing
export {
  validatePackSchema,
  validateTemplate,
  checkCriticalFields,
  generateVersionHash,
  importPack,
  CRITICAL_FIELDS,
  type ImportReport,
  type ImportResult,
  type Template,
  type SpecPack,
};

// Run if executed directly
if (require.main === module) {
  main();
}
