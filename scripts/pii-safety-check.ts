/**
 * PII Safety Gate
 * 
 * Validates that golden dataset fixtures do not contain PII:
 * - Real-looking names (first/last name patterns)
 * - Real company names (Inc, LLC, Corp, Ltd patterns)
 * - Email addresses
 * - Phone numbers
 * - Postal codes
 * - Street addresses
 * 
 * Usage: npx tsx scripts/pii-safety-check.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// PII detection patterns
const PII_PATTERNS = {
  // Email addresses
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  
  // Phone numbers (various formats)
  phone: /(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}/g,
  
  // US postal codes
  usPostalCode: /\b\d{5}(?:-\d{4})?\b/g,
  
  // UK postal codes
  ukPostalCode: /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/gi,
  
  // Street addresses (number + street name patterns)
  streetAddress: /\b\d+\s+(?:[A-Z][a-z]+\s+){1,3}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Court|Ct|Way|Place|Pl)\b/gi,
  
  // Real company suffixes (but allow synthetic placeholders like CUSTOMER_A)
  realCompany: /\b(?!CUSTOMER_|VENDOR_|SUPPLIER_|PARTNER_)[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Inc|LLC|Corp|Corporation|Ltd|Limited|Co|Company|Industries|Solutions|Services|Group|Holdings)\b/g,
  
  // Common first + last name patterns (but allow synthetic like TECH-XXX, CUSTOMER_X)
  // Also allow document naming patterns like "Job Sheet", "Standard Job", etc.
  realName: /\b(?!TECH-|CUSTOMER_|VENDOR_|PART-|JS-|Standard|Job|Sheet|Missing|Signature|Low|Confidence|OCR|Table|Heavy|Conflicting|Invalid|Format|Out|Policy)(?:[A-Z][a-z]{2,})\s+(?:[A-Z][a-z]{2,})\b/g,
};

// Allowlist for known safe patterns
const ALLOWLIST = [
  'Job Number',
  'Job Sheet',
  'Service Date',
  'Work Description',
  'Emergency repair',
  'Quarterly maintenance inspection',
  'Installation',
  'Preventive maintenance',
];

interface PIIViolation {
  pattern: string;
  match: string;
  location: string;
}

function checkForPII(content: string, location: string): PIIViolation[] {
  const violations: PIIViolation[] = [];
  
  for (const [patternName, regex] of Object.entries(PII_PATTERNS)) {
    const matches = content.match(regex);
    if (matches) {
      for (const match of matches) {
        // Skip allowlisted patterns
        if (ALLOWLIST.some(allowed => match.includes(allowed))) {
          continue;
        }
        // Skip synthetic placeholders
        if (/^(CUSTOMER_|VENDOR_|SUPPLIER_|PARTNER_|TECH-|PART-|JS-)/i.test(match)) {
          continue;
        }
        // Skip date-like patterns that look like postal codes
        if (patternName === 'usPostalCode' && /^\d{4}-\d{2}/.test(content.substring(content.indexOf(match) - 5, content.indexOf(match) + 10))) {
          continue;
        }
        violations.push({
          pattern: patternName,
          match,
          location,
        });
      }
    }
  }
  
  return violations;
}

function validateFixture(filePath: string): PIIViolation[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const violations: PIIViolation[] = [];
  
  try {
    const data = JSON.parse(content);
    
    // Check all string values recursively
    function checkObject(obj: unknown, path: string): void {
      if (typeof obj === 'string') {
        const found = checkForPII(obj, path);
        violations.push(...found);
      } else if (Array.isArray(obj)) {
        obj.forEach((item, index) => checkObject(item, `${path}[${index}]`));
      } else if (obj && typeof obj === 'object') {
        for (const [key, value] of Object.entries(obj)) {
          checkObject(value, `${path}.${key}`);
        }
      }
    }
    
    checkObject(data, 'root');
  } catch (e) {
    console.error(`Failed to parse ${filePath}: ${e}`);
    process.exit(1);
  }
  
  return violations;
}

function main(): void {
  const fixturesDir = path.join(__dirname, '..', 'parity', 'fixtures');
  const files = fs.readdirSync(fixturesDir).filter(f => f.endsWith('.json') && !f.endsWith('.schema.json'));
  
  console.log('PII Safety Gate - Checking fixtures for PII...\n');
  
  let totalViolations = 0;
  
  for (const file of files) {
    const filePath = path.join(fixturesDir, file);
    const violations = validateFixture(filePath);
    
    if (violations.length > 0) {
      console.log(`❌ ${file}: ${violations.length} PII violation(s) found`);
      for (const v of violations) {
        console.log(`   - [${v.pattern}] "${v.match}" at ${v.location}`);
      }
      totalViolations += violations.length;
    } else {
      console.log(`✅ ${file}: No PII detected`);
    }
  }
  
  console.log('');
  
  if (totalViolations > 0) {
    console.log(`❌ FAILED: ${totalViolations} PII violation(s) found`);
    console.log('\nTo fix:');
    console.log('  - Replace real names with synthetic placeholders (CUSTOMER_A, VENDOR_B)');
    console.log('  - Replace real companies with placeholders (CUSTOMER_A, PARTNER_X)');
    console.log('  - Remove email addresses, phone numbers, and addresses');
    process.exit(1);
  } else {
    console.log('✅ PASSED: No PII detected in fixtures');
    process.exit(0);
  }
}

main();
