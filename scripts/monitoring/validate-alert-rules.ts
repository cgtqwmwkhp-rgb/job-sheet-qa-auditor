/**
 * Alert Rules Validation Script
 * 
 * Validates that alert-rules.yml does not contain placeholder domains
 * and follows required conventions.
 * 
 * Usage:
 *   npx tsx scripts/monitoring/validate-alert-rules.ts
 */

import * as fs from 'fs';
import * as path from 'path';

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// Forbidden placeholder domains
const FORBIDDEN_DOMAINS = [
  'example.com',
  'example.org',
  'example.net',
  'placeholder.com',
  'localhost',
  'your-domain.com',
  'your-company.com'
];

// Required canonical severity labels
const CANONICAL_SEVERITIES = ['S0', 'S1', 'S2', 'S3'];

function validateAlertRules(): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: []
  };
  
  const alertRulesPath = path.join(process.cwd(), 'scripts/monitoring/alert-rules.yml');
  
  // Check file exists
  if (!fs.existsSync(alertRulesPath)) {
    result.valid = false;
    result.errors.push('alert-rules.yml not found');
    return result;
  }
  
  const content = fs.readFileSync(alertRulesPath, 'utf-8');
  
  // Check for forbidden placeholder domains
  FORBIDDEN_DOMAINS.forEach(domain => {
    if (content.includes(domain)) {
      result.valid = false;
      result.errors.push(`Forbidden placeholder domain found: ${domain}`);
    }
  });
  
  // Check for canonical severity labels in severity-specific alerts
  CANONICAL_SEVERITIES.forEach(severity => {
    const pattern = new RegExp(`severity="${severity}"`, 'g');
    if (!content.match(pattern)) {
      result.warnings.push(`No alerts found for canonical severity: ${severity}`);
    }
  });
  
  // Check for non-canonical severity labels (should not exist)
  const nonCanonicalPatterns = [
    /severity="critical"/gi,
    /severity="high"/gi,
    /severity="medium"/gi,
    /severity="low"/gi
  ];
  
  // Note: 'critical' and 'warning' are valid Alertmanager severity labels
  // They are different from our canonical field severity labels (S0-S3)
  // So we only check for 'high', 'medium', 'low' which would be wrong
  const wrongSeverityPatterns = [
    /severity="high"/gi,
    /severity="medium"/gi,
    /severity="low"/gi
  ];
  
  wrongSeverityPatterns.forEach(pattern => {
    if (content.match(pattern)) {
      result.warnings.push(`Non-canonical severity label found: ${pattern.source}`);
    }
  });
  
  // Check runbook URLs are repo-local paths
  const runbookUrls = content.match(/runbook_url:\s*"([^"]+)"/g) || [];
  runbookUrls.forEach(url => {
    const urlValue = url.match(/"([^"]+)"/)?.[1] || '';
    if (urlValue.startsWith('http://') || urlValue.startsWith('https://')) {
      // External URL - check it's not a placeholder
      FORBIDDEN_DOMAINS.forEach(domain => {
        if (urlValue.includes(domain)) {
          result.valid = false;
          result.errors.push(`Placeholder URL found: ${urlValue}`);
        }
      });
    } else if (!urlValue.startsWith('docs/')) {
      result.warnings.push(`Runbook URL should be repo-local path: ${urlValue}`);
    }
  });
  
  // Check for required alert groups
  const requiredGroups = ['parity_alerts', 'integrity_alerts', 'operational_alerts'];
  requiredGroups.forEach(group => {
    if (!content.includes(`name: ${group}`)) {
      result.warnings.push(`Missing required alert group: ${group}`);
    }
  });
  
  return result;
}

function main(): void {
  console.log('=== Alert Rules Validation ===\n');
  
  const result = validateAlertRules();
  
  if (result.errors.length > 0) {
    console.log('ERRORS:');
    result.errors.forEach(error => console.log(`  ❌ ${error}`));
    console.log('');
  }
  
  if (result.warnings.length > 0) {
    console.log('WARNINGS:');
    result.warnings.forEach(warning => console.log(`  ⚠️ ${warning}`));
    console.log('');
  }
  
  if (result.valid) {
    console.log('✅ Alert rules validation PASSED');
    process.exit(0);
  } else {
    console.log('❌ Alert rules validation FAILED');
    process.exit(1);
  }
}

main();
