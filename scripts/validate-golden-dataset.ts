/**
 * Golden Dataset Schema Validator
 * 
 * Validates golden-dataset.json against golden-dataset.schema.json
 * Also checks deterministic ordering requirements.
 * 
 * Usage: npx tsx scripts/validate-golden-dataset.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

function validateSchema(dataPath: string, schemaPath: string): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
  };
  
  // Load files
  let data: unknown;
  let schema: unknown;
  
  try {
    data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  } catch (e) {
    result.valid = false;
    result.errors.push(`Failed to parse data file: ${e}`);
    return result;
  }
  
  try {
    schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
  } catch (e) {
    result.valid = false;
    result.errors.push(`Failed to parse schema file: ${e}`);
    return result;
  }
  
  // Validate with AJV
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  
  const validate = ajv.compile(schema);
  const valid = validate(data);
  
  if (!valid && validate.errors) {
    result.valid = false;
    for (const err of validate.errors) {
      result.errors.push(`${err.instancePath || 'root'}: ${err.message}`);
    }
  }
  
  return result;
}

function checkDeterministicOrdering(dataPath: string): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
  };
  
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  
  // Check documents are sorted by id
  const docIds = data.documents.map((d: { id: string }) => d.id);
  const sortedDocIds = [...docIds].sort();
  if (JSON.stringify(docIds) !== JSON.stringify(sortedDocIds)) {
    result.valid = false;
    result.errors.push('Documents are not sorted by id');
  }
  
  // Check rules are sorted by ruleId
  const ruleIds = data.rules.map((r: { ruleId: string }) => r.ruleId);
  const sortedRuleIds = [...ruleIds].sort();
  if (JSON.stringify(ruleIds) !== JSON.stringify(sortedRuleIds)) {
    result.valid = false;
    result.errors.push('Rules are not sorted by ruleId');
  }
  
  // Check validatedFields in each document are sorted by ruleId
  for (const doc of data.documents) {
    const fieldRuleIds = doc.validatedFields.map((f: { ruleId: string }) => f.ruleId);
    const sortedFieldRuleIds = [...fieldRuleIds].sort();
    if (JSON.stringify(fieldRuleIds) !== JSON.stringify(sortedFieldRuleIds)) {
      result.valid = false;
      result.errors.push(`Document ${doc.id}: validatedFields are not sorted by ruleId`);
    }
  }
  
  // Check findings in each document are sorted by id
  for (const doc of data.documents) {
    if (doc.findings.length > 0) {
      const findingIds = doc.findings.map((f: { id: string }) => f.id);
      const sortedFindingIds = [...findingIds].sort();
      if (JSON.stringify(findingIds) !== JSON.stringify(sortedFindingIds)) {
        result.valid = false;
        result.errors.push(`Document ${doc.id}: findings are not sorted by id`);
      }
    }
  }
  
  return result;
}

function checkCanonicalValues(dataPath: string): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
  };
  
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  const validSeverities = ['S0', 'S1', 'S2', 'S3'];
  const validReasonCodes = Object.keys(data.reasonCodes);
  
  // Check all severities and reason codes in documents
  for (const doc of data.documents) {
    for (const field of doc.validatedFields) {
      if (!validSeverities.includes(field.severity)) {
        result.valid = false;
        result.errors.push(`Document ${doc.id}, field ${field.field}: invalid severity "${field.severity}"`);
      }
      // reasonCode is null for passed fields (PASS has no reason code)
      if (field.reasonCode !== null && !validReasonCodes.includes(field.reasonCode)) {
        result.valid = false;
        result.errors.push(`Document ${doc.id}, field ${field.field}: invalid reasonCode "${field.reasonCode}"`);
      }
    }
    
    for (const finding of doc.findings) {
      if (!validSeverities.includes(finding.severity)) {
        result.valid = false;
        result.errors.push(`Document ${doc.id}, finding ${finding.id}: invalid severity "${finding.severity}"`);
      }
      if (!validReasonCodes.includes(finding.reasonCode)) {
        result.valid = false;
        result.errors.push(`Document ${doc.id}, finding ${finding.id}: invalid reasonCode "${finding.reasonCode}"`);
      }
    }
  }
  
  // Check all severities in rules
  for (const rule of data.rules) {
    if (!validSeverities.includes(rule.severity)) {
      result.valid = false;
      result.errors.push(`Rule ${rule.ruleId}: invalid severity "${rule.severity}"`);
    }
  }
  
  return result;
}

function main(): void {
  const fixturesDir = path.join(__dirname, '..', 'parity', 'fixtures');
  const dataPath = path.join(fixturesDir, 'golden-dataset.json');
  const schemaPath = path.join(fixturesDir, 'golden-dataset.schema.json');
  
  console.log('Golden Dataset Validator\n');
  console.log('========================\n');
  
  let allValid = true;
  
  // Schema validation
  console.log('1. Schema Validation');
  const schemaResult = validateSchema(dataPath, schemaPath);
  if (schemaResult.valid) {
    console.log('   ✅ Schema validation passed');
  } else {
    console.log('   ❌ Schema validation failed:');
    for (const err of schemaResult.errors) {
      console.log(`      - ${err}`);
    }
    allValid = false;
  }
  
  // Deterministic ordering
  console.log('\n2. Deterministic Ordering');
  const orderingResult = checkDeterministicOrdering(dataPath);
  if (orderingResult.valid) {
    console.log('   ✅ Deterministic ordering verified');
  } else {
    console.log('   ❌ Ordering violations:');
    for (const err of orderingResult.errors) {
      console.log(`      - ${err}`);
    }
    allValid = false;
  }
  
  // Canonical values
  console.log('\n3. Canonical Values');
  const canonicalResult = checkCanonicalValues(dataPath);
  if (canonicalResult.valid) {
    console.log('   ✅ All severities and reason codes are canonical');
  } else {
    console.log('   ❌ Canonical value violations:');
    for (const err of canonicalResult.errors) {
      console.log(`      - ${err}`);
    }
    allValid = false;
  }
  
  console.log('\n========================');
  if (allValid) {
    console.log('✅ ALL CHECKS PASSED');
    process.exit(0);
  } else {
    console.log('❌ VALIDATION FAILED');
    process.exit(1);
  }
}

main();
