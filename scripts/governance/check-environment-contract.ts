#!/usr/bin/env npx ts-node
/**
 * Environment Contract Governance Check
 * 
 * Validates that deployment workflows comply with the environment contract:
 * - No shared secrets.AZURE_RESOURCE_GROUP
 * - No shared secrets.*_CONTAINER_APP
 * - Deploy jobs must declare environment: staging|production
 * - environment-contract.json must be valid
 * 
 * Run: npx ts-node scripts/governance/check-environment-contract.ts
 */

import * as fs from 'fs';
import * as path from 'path';

interface ValidationResult {
  rule: string;
  file: string;
  line?: number;
  message: string;
  severity: 'error' | 'warning';
}

const WORKFLOW_DIR = path.join(process.cwd(), '.github/workflows');
const CONTRACT_PATH = path.join(process.cwd(), 'docs/operations/environment-contract.json');

const DEPRECATED_PATTERNS = [
  {
    id: 'no-shared-resource-group',
    pattern: /secrets\.AZURE_RESOURCE_GROUP/g,
    message: 'Use vars.AZURE_RESOURCE_GROUP instead of secrets.AZURE_RESOURCE_GROUP',
    severity: 'error' as const,
  },
  {
    id: 'no-staging-container-app-secret',
    pattern: /secrets\.STAGING_CONTAINER_APP/g,
    message: 'Use vars.CONTAINER_APP_NAME in staging environment instead',
    severity: 'error' as const,
  },
  {
    id: 'no-production-container-app-secret',
    pattern: /secrets\.PRODUCTION_CONTAINER_APP/g,
    message: 'Use vars.CONTAINER_APP_NAME in production environment instead',
    severity: 'error' as const,
  },
];

const DEPLOY_WORKFLOWS = ['azure-deploy.yml'];

function checkWorkflowForDeprecatedSecrets(filePath: string): ValidationResult[] {
  const results: ValidationResult[] = [];
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const fileName = path.basename(filePath);

  for (const deprecation of DEPRECATED_PATTERNS) {
    lines.forEach((line, index) => {
      // Skip comment lines (lines starting with # after optional whitespace)
      const trimmedLine = line.trim();
      if (trimmedLine.startsWith('#')) {
        return;
      }
      
      if (deprecation.pattern.test(line)) {
        results.push({
          rule: deprecation.id,
          file: fileName,
          line: index + 1,
          message: deprecation.message,
          severity: deprecation.severity,
        });
      }
      // Reset regex lastIndex for global patterns
      deprecation.pattern.lastIndex = 0;
    });
  }

  return results;
}

function checkDeployJobsHaveEnvironment(filePath: string): ValidationResult[] {
  const results: ValidationResult[] = [];
  const content = fs.readFileSync(filePath, 'utf-8');
  const fileName = path.basename(filePath);

  // Simple regex to find deploy jobs that should have environment declaration
  const deployJobPattern = /^\s{2}(deploy-staging|deploy-production|verify-staging|verify-production):\s*$/gm;
  const lines = content.split('\n');

  let match;
  while ((match = deployJobPattern.exec(content)) !== null) {
    const lineNumber = content.substring(0, match.index).split('\n').length;
    const jobName = match[1];

    // Look ahead for environment declaration within the next 15 lines
    let hasEnvironment = false;
    for (let i = lineNumber - 1; i < Math.min(lineNumber + 15, lines.length); i++) {
      const line = lines[i];
      // Match both "environment: staging" and "environment:\n      name: staging"
      if (/^\s+environment:\s*(staging|production)/.test(line) || 
          /^\s+environment:\s*$/.test(line)) {
        // For multi-line format, check if next line has name: staging|production
        if (/^\s+environment:\s*$/.test(line)) {
          const nextLine = lines[i + 1] || '';
          if (/^\s+name:\s*(staging|production)/.test(nextLine)) {
            hasEnvironment = true;
            break;
          }
        } else {
          hasEnvironment = true;
          break;
        }
      }
      // Stop if we hit another job definition (2-space indent followed by word-colon)
      if (i > lineNumber && /^ {2}\w[\w-]*:/.test(line)) {
        break;
      }
    }

    if (!hasEnvironment) {
      results.push({
        rule: 'deploy-jobs-require-environment',
        file: fileName,
        line: lineNumber,
        message: `Job '${jobName}' must declare 'environment: staging' or 'environment: production'`,
        severity: 'error',
      });
    }
  }

  return results;
}

function checkEnvironmentContractExists(): ValidationResult[] {
  const results: ValidationResult[] = [];

  if (!fs.existsSync(CONTRACT_PATH)) {
    results.push({
      rule: 'environment-contract-exists',
      file: 'environment-contract.json',
      message: 'Environment contract file is missing: docs/operations/environment-contract.json',
      severity: 'error',
    });
    return results;
  }

  try {
    const content = fs.readFileSync(CONTRACT_PATH, 'utf-8');
    const contract = JSON.parse(content);

    // Validate required structure
    if (!contract.environments?.staging) {
      results.push({
        rule: 'environment-contract-valid',
        file: 'environment-contract.json',
        message: 'Contract missing staging environment definition',
        severity: 'error',
      });
    }

    if (!contract.environments?.production) {
      results.push({
        rule: 'environment-contract-valid',
        file: 'environment-contract.json',
        message: 'Contract missing production environment definition',
        severity: 'error',
      });
    }

    // Check required variables are defined
    const requiredVars = ['AZURE_RESOURCE_GROUP', 'CONTAINER_APP_NAME'];
    for (const env of ['staging', 'production']) {
      if (contract.environments?.[env]?.variables) {
        for (const varName of requiredVars) {
          if (!contract.environments[env].variables[varName]) {
            results.push({
              rule: 'environment-contract-valid',
              file: 'environment-contract.json',
              message: `Contract missing ${varName} definition for ${env} environment`,
              severity: 'error',
            });
          }
        }
      }
    }
  } catch (e) {
    results.push({
      rule: 'environment-contract-valid',
      file: 'environment-contract.json',
      message: `Failed to parse environment contract: ${e}`,
      severity: 'error',
    });
  }

  return results;
}

function main(): void {
  console.log('🔍 Environment Contract Governance Check\n');
  console.log('━'.repeat(60));

  const allResults: ValidationResult[] = [];

  // Check environment contract
  console.log('\n📋 Checking environment contract...');
  allResults.push(...checkEnvironmentContractExists());

  // Check workflows
  console.log('📋 Checking workflow files...\n');

  if (fs.existsSync(WORKFLOW_DIR)) {
    const workflowFiles = fs.readdirSync(WORKFLOW_DIR).filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));

    for (const file of workflowFiles) {
      const filePath = path.join(WORKFLOW_DIR, file);
      
      // Check for deprecated secrets
      allResults.push(...checkWorkflowForDeprecatedSecrets(filePath));

      // Check deploy jobs have environment (only for deploy workflows)
      if (DEPLOY_WORKFLOWS.includes(file)) {
        allResults.push(...checkDeployJobsHaveEnvironment(filePath));
      }
    }
  }

  // Report results
  const errors = allResults.filter(r => r.severity === 'error');
  const warnings = allResults.filter(r => r.severity === 'warning');

  if (allResults.length === 0) {
    console.log('✅ All governance checks passed!\n');
    process.exit(0);
  }

  console.log('\n📊 Results:\n');

  for (const result of allResults) {
    const icon = result.severity === 'error' ? '❌' : '⚠️';
    const lineInfo = result.line ? `:${result.line}` : '';
    console.log(`${icon} [${result.rule}] ${result.file}${lineInfo}`);
    console.log(`   ${result.message}\n`);
  }

  console.log('━'.repeat(60));
  console.log(`\n📈 Summary: ${errors.length} error(s), ${warnings.length} warning(s)\n`);

  if (errors.length > 0) {
    console.log('❌ Governance check FAILED\n');
    console.log('To fix:');
    console.log('  1. Replace secrets.AZURE_RESOURCE_GROUP with vars.AZURE_RESOURCE_GROUP');
    console.log('  2. Replace secrets.*_CONTAINER_APP with vars.CONTAINER_APP_NAME');
    console.log('  3. Ensure deploy jobs have environment: staging or production');
    console.log('  4. See: docs/operations/environment-contract.json\n');
    process.exit(1);
  }

  process.exit(0);
}

main();
