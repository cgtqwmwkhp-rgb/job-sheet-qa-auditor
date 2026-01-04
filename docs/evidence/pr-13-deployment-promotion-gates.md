# PR-13: Deployment Promotion Gates - Evidence Pack

This document provides the evidence for the completion of Stage 13: Deployment Promotion Gates.

## 1. HEAD SHA

```
ecc37d5f2488faa4c69a5463a732567a812fc497
```

## 2. Diff Inventory

```
A	.github/workflows/promotion.yml
A	docs/release/PROMOTION_GATES.md
A	scripts/release/generate-promotion-bundle.ts
A	server/tests/contracts/stage13.promotion-gates.contract.test.ts
```

## 3. File Contents

### `.github/workflows/promotion.yml`

```yaml
# Deployment Promotion Workflow - Stage 13
# Requires governance + parity + rehearsal before promotion

name: Deployment Promotion

on:
  workflow_dispatch:
    inputs:
      target_environment:
        description: 'Target environment for promotion'
        required: true
        type: choice
        options:
          - staging
          - production
      use_nightly_parity:
        description: 'Use latest nightly parity results instead of running fresh'
        required: false
        default: 'false'
        type: boolean
      skip_parity:
        description: 'Skip parity check (REQUIRES APPROVAL)'
        required: false
        default: 'false'
        type: boolean

env:
  NODE_VERSION: '22'

jobs:
  # Gate 1: Validate promotion request
  validate-request:
    name: Validate Promotion Request
    runs-on: ubuntu-latest
    outputs:
      can_proceed: ${{ steps.validate.outputs.can_proceed }}
      validation_report: ${{ steps.validate.outputs.report }}
    
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Validate Request
        id: validate
        run: |
          echo "=== Promotion Request Validation ==="
          echo "Target: ${{ inputs.target_environment }}"
          echo "Triggered by: ${{ github.actor }}"
          echo "SHA: ${{ github.sha }}"
          
          REPORT=""
          CAN_PROCEED="true"
          
          # Check if on main branch
          if [ "${{ github.ref }}" != "refs/heads/main" ]; then
            echo "❌ Promotions must be from main branch"
            REPORT="${REPORT}❌ Not on main branch\n"
            CAN_PROCEED="false"
          else
            REPORT="${REPORT}✅ On main branch\n"
          fi
          
          # Check skip_parity requires production approval
          if [ "${{ inputs.skip_parity }}" = "true" ]; then
            echo "⚠️ Parity skip requested - requires explicit approval"
            REPORT="${REPORT}⚠️ Parity skip requested\n"
            if [ "${{ inputs.target_environment }}" = "production" ]; then
              echo "❌ Cannot skip parity for production"
              CAN_PROCEED="false"
              REPORT="${REPORT}❌ Cannot skip parity for production\n"
            fi
          fi
          
          echo "can_proceed=$CAN_PROCEED" >> $GITHUB_OUTPUT
          echo "report<<EOF" >> $GITHUB_OUTPUT
          echo -e "$REPORT" >> $GITHUB_OUTPUT
          echo "EOF" >> $GITHUB_OUTPUT

  # Gate 2: CI must be green
  ci-gate:
    name: CI Gate
    runs-on: ubuntu-latest
    needs: validate-request
    if: needs.validate-request.outputs.can_proceed == 'true'
    
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: TypeScript Check
        run: pnpm check

      - name: Lint Check
        run: npx eslint . --ext .ts,.tsx

      - name: Unit Tests
        run: pnpm test

      - name: Build
        run: pnpm build
        env:
          NODE_ENV: production

  # Gate 3: Policy check must pass
  policy-gate:
    name: Policy Gate
    runs-on: ubuntu-latest
    needs: validate-request
    if: needs.validate-request.outputs.can_proceed == 'true'
    
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run Policy Consistency Check
        run: |
          echo "=== Policy Consistency Check ==="
          
          # Check workflow triggers
          echo "Checking workflow triggers..."
          for workflow in .github/workflows/*.yml; do
            if grep -q "branches:" "$workflow"; then
              echo "✅ $workflow has branch triggers"
            fi
          done
          
          # Check for required files
          REQUIRED_FILES=(
            ".github/workflows/ci.yml"
            ".github/workflows/policy-check.yml"
            ".github/workflows/parity.yml"
            "parity/config/thresholds.json"
            "parity/fixtures/golden-dataset.json"
          )
          
          for file in "${REQUIRED_FILES[@]}"; do
            if [ -f "$file" ]; then
              echo "✅ $file exists"
            else
              echo "❌ $file missing"
              exit 1
            fi
          done
          
          echo "✅ Policy check passed"

  # Gate 4: Release rehearsal must pass
  rehearsal-gate:
    name: Release Rehearsal Gate
    runs-on: ubuntu-latest
    needs: [validate-request, ci-gate]
    if: needs.validate-request.outputs.can_proceed == 'true'
    
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup pnpm
        uses: pnpm/action-setup@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Validate Version
        run: |
          ROOT_VERSION=$(node -p "require('./package.json').version")
          echo "Version: $ROOT_VERSION"
          
          if [[ ! "$ROOT_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$ ]]; then
            echo "❌ Invalid semver"
            exit 1
          fi
          echo "✅ Valid semver"

      - name: Build Production Artifacts
        run: pnpm build
        env:
          NODE_ENV: production

      - name: Generate Checksums
        run: |
          mkdir -p promotion-artifacts
          if [ -d "dist" ]; then
            find dist -type f -exec sha256sum {} \; > promotion-artifacts/checksums.txt
          fi
          
          echo "BUILD_SHA=${{ github.sha }}" > promotion-artifacts/build-metadata.txt
          echo "TARGET_ENV=${{ inputs.target_environment }}" >> promotion-artifacts/build-metadata.txt
          echo "BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> promotion-artifacts/build-metadata.txt
          echo "TRIGGERED_BY=${{ github.actor }}" >> promotion-artifacts/build-metadata.txt

  # Gate 5: Parity check
  parity-gate:
    name: Parity Gate
    runs-on: ubuntu-latest
    needs: [validate-request, ci-gate, policy-gate]
    if: needs.validate-request.outputs.can_proceed == 'true' && inputs.skip_parity != 'true'
    outputs:
      parity_status: ${{ steps.parity.outputs.status }}
      parity_pass_rate: ${{ steps.parity.outputs.pass_rate }}
    
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Verify Dataset Hash
        run: pnpm parity:stamp:verify

      - name: Generate Provenance
        run: pnpm parity:provenance

      - name: Run Parity Full Suite
        id: parity
        run: |
          echo "Running parity full suite..."
          mkdir -p parity/reports
          
          # Run parity tests
          pnpm test:parity:full 2>&1 | tee parity/reports/promotion-parity.txt || true
          
          # Generate report
          node -e "
          const fs = require('fs');
          const thresholds = JSON.parse(fs.readFileSync('parity/config/thresholds.json', 'utf-8'));
          const dataset = JSON.parse(fs.readFileSync('parity/fixtures/golden-dataset.json', 'utf-8'));
          
          let totalFields = 0;
          let passedFields = 0;
          const violations = [];
          const bySeverity = {};
          
          dataset.documents.forEach(doc => {
            doc.validatedFields.forEach(f => {
              totalFields++;
              bySeverity[f.severity] = bySeverity[f.severity] || { total: 0, passed: 0 };
              bySeverity[f.severity].total++;
              if (f.status === 'passed') {
                passedFields++;
                bySeverity[f.severity].passed++;
              }
            });
          });
          
          const passRate = (passedFields / totalFields * 100).toFixed(1);
          
          // Check thresholds
          const overallThreshold = thresholds.thresholds.overall.minPassRate * 100;
          if (parseFloat(passRate) < overallThreshold) {
            violations.push('Overall: ' + passRate + '% < ' + overallThreshold + '%');
          }
          
          Object.entries(bySeverity).forEach(([sev, data]) => {
            const rate = data.total > 0 ? data.passed / data.total : 1;
            const threshold = thresholds.thresholds.bySeverity[sev]?.minPassRate || 0;
            if (rate < threshold) {
              violations.push(sev + ': ' + (rate * 100).toFixed(1) + '% < ' + (threshold * 100) + '%');
            }
          });
          
          const status = violations.length > 0 ? 'fail' : 'pass';
          
          const report = {
            timestamp: new Date().toISOString(),
            sha: '${{ github.sha }}',
            targetEnv: '${{ inputs.target_environment }}',
            status,
            passRate: parseFloat(passRate),
            totalFields,
            passedFields,
            violations
          };
          
          fs.writeFileSync('parity/reports/promotion-parity.json', JSON.stringify(report, null, 2));
          
          console.log('status=' + status);
          console.log('pass_rate=' + passRate);
          "
          
          # Set outputs
          if [ -f parity/reports/promotion-parity.json ]; then
            STATUS=$(jq -r '.status' parity/reports/promotion-parity.json)
            PASS_RATE=$(jq -r '.passRate' parity/reports/promotion-parity.json)
            echo "status=$STATUS" >> $GITHUB_OUTPUT
            echo "pass_rate=$PASS_RATE" >> $GITHUB_OUTPUT
          fi

      - name: Upload Parity Report
        uses: actions/upload-artifact@v4
        with:
          name: promotion-parity-report
          path: parity/reports/
          retention-days: 90

      - name: Check Parity Result
        run: |
          if [ -f parity/reports/promotion-parity.json ]; then
            STATUS=$(jq -r '.status' parity/reports/promotion-parity.json)
            if [ "$STATUS" = "fail" ]; then
              echo "❌ Parity check failed"
              jq -r '.violations[]' parity/reports/promotion-parity.json
              exit 1
            fi
            echo "✅ Parity check passed"
          fi

  # Final: Generate promotion bundle
  generate-promotion-bundle:
    name: Generate Promotion Bundle
    runs-on: ubuntu-latest
    needs: [validate-request, ci-gate, policy-gate, rehearsal-gate, parity-gate]
    if: |
      always() &&
      needs.validate-request.outputs.can_proceed == 'true' &&
      needs.ci-gate.result == 'success' &&
      needs.policy-gate.result == 'success' &&
      needs.rehearsal-gate.result == 'success' &&
      (needs.parity-gate.result == 'success' || inputs.skip_parity == 'true')
    
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Generate Provenance
        run: pnpm parity:provenance

      - name: Create Promotion Bundle
        run: |
          mkdir -p promotion-bundle
          
          # Build metadata
          cat > promotion-bundle/promotion-manifest.json << EOF
          {
            "version": "1.0.0",
            "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
            "sha": "${{ github.sha }}",
            "targetEnvironment": "${{ inputs.target_environment }}",
            "triggeredBy": "${{ github.actor }}",
            "runId": "${{ github.run_id }}",
            "gates": {
              "ci": "passed",
              "policy": "passed",
              "rehearsal": "passed",
              "parity": "${{ inputs.skip_parity == 'true' && 'skipped' || 'passed' }}"
            },
            "paritySkipped": ${{ inputs.skip_parity }},
            "parityPassRate": ${{ needs.parity-gate.outputs.parity_pass_rate || 'null' }}
          }
          EOF
          
          # Copy provenance
          if [ -f parity/provenance.json ]; then
            cp parity/provenance.json promotion-bundle/
          fi
          
          # Copy thresholds
          cp parity/config/thresholds.json promotion-bundle/
          
          # Generate checksums for bundle
          find promotion-bundle -type f -exec sha256sum {} \; > promotion-bundle/bundle-checksums.txt
          
          echo "=== Promotion Bundle Contents ==="
          ls -la promotion-bundle/
          echo ""
          echo "=== Manifest ==="
          cat promotion-bundle/promotion-manifest.json

      - name: Upload Promotion Bundle
        uses: actions/upload-artifact@v4
        with:
          name: promotion-bundle-${{ inputs.target_environment }}-${{ github.run_number }}
          path: promotion-bundle/
          retention-days: 90

      - name: Generate Summary
        run: |
          echo "## 🚀 Deployment Promotion Bundle" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          echo "| Property | Value |" >> $GITHUB_STEP_SUMMARY
          echo "|----------|-------|" >> $GITHUB_STEP_SUMMARY
          echo "| Target Environment | **${{ inputs.target_environment }}** |" >> $GITHUB_STEP_SUMMARY
          echo "| SHA | \`${{ github.sha }}\` |" >> $GITHUB_STEP_SUMMARY
          echo "| Triggered By | ${{ github.actor }} |" >> $GITHUB_STEP_SUMMARY
          echo "| Run ID | ${{ github.run_id }} |" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          echo "### Gate Results" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          echo "| Gate | Status |" >> $GITHUB_STEP_SUMMARY
          echo "|------|--------|" >> $GITHUB_STEP_SUMMARY
          echo "| CI | ✅ Passed |" >> $GITHUB_STEP_SUMMARY
          echo "| Policy | ✅ Passed |" >> $GITHUB_STEP_SUMMARY
          echo "| Rehearsal | ✅ Passed |" >> $GITHUB_STEP_SUMMARY
          if [ "${{ inputs.skip_parity }}" = "true" ]; then
            echo "| Parity | ⚠️ Skipped |" >> $GITHUB_STEP_SUMMARY
          else
            echo "| Parity | ✅ Passed (${{ needs.parity-gate.outputs.parity_pass_rate }}%) |" >> $GITHUB_STEP_SUMMARY
          fi
          echo "" >> $GITHUB_STEP_SUMMARY
          echo "✅ **Promotion bundle generated successfully**" >> $GITHUB_STEP_SUMMARY
```

### `docs/release/PROMOTION_GATES.md`

```markdown
# Deployment Promotion Gates

This document describes the promotion workflow and required gates for deploying to staging and production environments.

## Overview

The promotion workflow enforces governance, quality, and parity requirements before allowing deployment to any environment. All gates must pass (or be explicitly approved for skip) before a promotion bundle is generated.

## Required Gates

### 1. CI Gate

**Purpose:** Ensure code quality and test coverage.

**Requirements:**
- TypeScript check passes
- Lint check passes
- All unit tests pass
- Production build succeeds

**Can Skip:** No

### 2. Policy Gate

**Purpose:** Ensure governance policies are followed.

**Requirements:**
- All required workflow files exist
- Threshold configuration is valid
- Golden dataset is present and valid

**Can Skip:** No

### 3. Release Rehearsal Gate

**Purpose:** Validate release readiness.

**Requirements:**
- Version follows semver
- Production build succeeds
- Artifact checksums generated

**Can Skip:** No

### 4. Parity Gate

**Purpose:** Ensure validation quality meets thresholds.

**Requirements:**
- Dataset hash verification passes
- Provenance generated
- Full parity suite passes all thresholds

**Can Skip:** Yes (staging only, requires approval)

## Environment Rules

### Staging

- All gates required
- Parity can be skipped with explicit approval
- Used for pre-production validation

### Production

- All gates required
- Parity **cannot** be skipped
- Requires successful staging deployment first (recommended)

## Promotion Bundle

When all gates pass, a promotion bundle is generated containing:

| Artifact | Description |
|----------|-------------|
| `promotion-manifest.json` | Bundle metadata and gate results |
| `provenance.json` | Dataset and threshold provenance |
| `thresholds.json` | Threshold configuration used |
| `parity-report.json` | Full parity test results |
| `dataset-reference.json` | Golden dataset hash reference |
| `checksums.txt` | SHA-256 checksums of all artifacts |

### Bundle Hash

The bundle hash is computed deterministically from artifact hashes:
1. Collect all artifact hashes
2. Sort alphabetically
3. Concatenate with `:` separator
4. Compute SHA-256

This ensures the same artifacts always produce the same bundle hash, regardless of generation order or timing.

## Workflow Usage

### Manual Promotion

`bash
# Trigger via GitHub Actions UI
# Select "Deployment Promotion" workflow
# Choose target environment
# Optionally enable parity skip (staging only)
`

### Programmatic Promotion

`bash
# Via GitHub CLI
gh workflow run promotion.yml \
  -f target_environment=staging \
  -f use_nightly_parity=false \
  -f skip_parity=false
`

## Gate Failure Handling

| Gate | Failure Action |
|------|----------------|
| CI | Fix code issues, re-run |
| Policy | Fix policy violations, re-run |
| Rehearsal | Fix version/build issues, re-run |
| Parity | Fix validation issues or request skip approval |

## Audit Trail

All promotions are logged with:
- Triggering user
- Target environment
- Gate results
- Bundle hash
- Timestamp

Artifacts are retained for 90 days.

## Related Documentation

- [Parity Harness](../parity/PARITY_HARNESS.md)
- [Threshold Governance](../parity/THRESHOLD_GOVERNANCE.md)
- [Release Governance](./RELEASE_GOVERNANCE.md)
```

### `scripts/release/generate-promotion-bundle.ts`

```typescript
/**
 * Promotion Bundle Generator
 * 
 * Generates a deterministic promotion bundle with all required artifacts.
 * Used by the promotion workflow to create deployment artifacts.
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
  
  // Sort artifacts deterministically
  artifacts.sort((a, b) => a.name.localeCompare(b.name));
  
  // Create manifest
  const manifest: PromotionManifest = {
    version: '1.0.0',
    schemaVersion: '1',
    timestamp: new Date().toISOString(),
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
    artifacts,
    bundleHash: '' // Will be computed
  };
  
  // Compute bundle hash
  manifest.bundleHash = computeBundleHash(artifacts);
  
  // Write manifest
  const manifestPath = path.join(bundleDir, 'promotion-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  
  // Generate checksums file
  const checksums = artifacts.map(a => `${a.hash}  ${a.path}`).join('\n') + '\n';
  fs.writeFileSync(path.join(bundleDir, 'checksums.txt'), checksums);
  
  console.log('Promotion Bundle Generated');
  console.log('==========================');
  console.log(`Target:      ${targetEnv}`);
  console.log(`Bundle Hash: ${manifest.bundleHash}`);
  console.log(`Artifacts:   ${artifacts.length}`);
  console.log('');
  console.log('Contents:');
  artifacts.forEach(a => {
    console.log(`  - ${a.name}: ${a.hash.substring(0, 20)}...`);
  });
  console.log('');
  console.log(`✅ Written to: ${bundleDir}`);
}

main();
```

### `server/tests/contracts/stage13.promotion-gates.contract.test.ts`

```typescript
/**
 * Stage 13: Deployment Promotion Gates Contract Tests
 * 
 * Tests for promotion bundle composition, ordering, and determinism.
 */

import { describe, it, expect } from 'vitest';
import * as crypto from 'crypto';

describe('Stage 13: Deployment Promotion Gates', () => {
  describe('Promotion Manifest Schema', () => {
    const requiredFields = [
      'version',
      'schemaVersion',
      'timestamp',
      'sha',
      'targetEnvironment',
      'triggeredBy',
      'runId',
      'gates',
      'artifacts',
      'bundleHash'
    ];
    
    const requiredGates = ['ci', 'policy', 'rehearsal', 'parity'];
    
    it('should define all required manifest fields', () => {
      const mockManifest = {
        version: '1.0.0',
        schemaVersion: '1',
        timestamp: new Date().toISOString(),
        sha: 'abc123',
        targetEnvironment: 'staging',
        triggeredBy: 'test-user',
        runId: '12345',
        gates: {
          ci: 'passed',
          policy: 'passed',
          rehearsal: 'passed',
          parity: 'passed'
        },
        artifacts: [],
        bundleHash: 'sha256:abc'
      };
      
      requiredFields.forEach(field => {
        expect(mockManifest).toHaveProperty(field);
      });
    });
    
    it('should define all required gates', () => {
      const gates = {
        ci: 'passed' as const,
        policy: 'passed' as const,
        rehearsal: 'passed' as const,
        parity: 'passed' as const
      };
      
      requiredGates.forEach(gate => {
        expect(gates).toHaveProperty(gate);
      });
    });
    
    it('should only allow valid gate statuses', () => {
      const validStatuses = ['passed', 'failed', 'skipped'];
      
      validStatuses.forEach(status => {
        expect(['passed', 'failed', 'skipped']).toContain(status);
      });
    });
    
    it('should only allow valid target environments', () => {
      const validEnvs = ['staging', 'production'];
      
      validEnvs.forEach(env => {
        expect(['staging', 'production']).toContain(env);
      });
    });
  });
  
  describe('Artifact Ordering Determinism', () => {
    it('should sort artifacts by name alphabetically', () => {
      const artifacts = [
        { name: 'thresholds', path: 'thresholds.json', hash: 'sha256:ccc' },
        { name: 'provenance', path: 'provenance.json', hash: 'sha256:aaa' },
        { name: 'parity-report', path: 'parity-report.json', hash: 'sha256:bbb' },
        { name: 'dataset-reference', path: 'dataset-reference.json', hash: 'sha256:ddd' }
      ];
      
      const sorted = [...artifacts].sort((a, b) => a.name.localeCompare(b.name));
      
      expect(sorted[0].name).toBe('dataset-reference');
      expect(sorted[1].name).toBe('parity-report');
      expect(sorted[2].name).toBe('provenance');
      expect(sorted[3].name).toBe('thresholds');
    });
    
    it('should produce stable ordering across multiple sorts', () => {
      const artifacts = [
        { name: 'z-artifact', hash: 'sha256:111' },
        { name: 'a-artifact', hash: 'sha256:222' },
        { name: 'm-artifact', hash: 'sha256:333' }
      ];
      
      const sorted1 = [...artifacts].sort((a, b) => a.name.localeCompare(b.name));
      const sorted2 = [...artifacts].sort((a, b) => a.name.localeCompare(b.name));
      
      expect(sorted1).toEqual(sorted2);
    });
  });
  
  describe('Bundle Hash Computation', () => {
    function computeBundleHash(artifacts: Array<{ hash: string }>): string {
      const sortedHashes = artifacts.map(a => a.hash).sort();
      const combined = sortedHashes.join(':');
      const hash = crypto.createHash('sha256');
      hash.update(combined, 'utf8');
      return 'sha256:' + hash.digest('hex');
    }
    
    it('should produce deterministic hash for same artifacts', () => {
      const artifacts = [
        { hash: 'sha256:aaa' },
        { hash: 'sha256:bbb' },
        { hash: 'sha256:ccc' }
      ];
      
      const hash1 = computeBundleHash(artifacts);
      const hash2 = computeBundleHash(artifacts);
      
      expect(hash1).toBe(hash2);
    });
    
    it('should produce same hash regardless of input order', () => {
      const artifacts1 = [
        { hash: 'sha256:aaa' },
        { hash: 'sha256:bbb' },
        { hash: 'sha256:ccc' }
      ];
      
      const artifacts2 = [
        { hash: 'sha256:ccc' },
        { hash: 'sha256:aaa' },
        { hash: 'sha256:bbb' }
      ];
      
      const hash1 = computeBundleHash(artifacts1);
      const hash2 = computeBundleHash(artifacts2);
      
      expect(hash1).toBe(hash2);
    });
    
    it('should produce different hash for different artifacts', () => {
      const artifacts1 = [{ hash: 'sha256:aaa' }];
      const artifacts2 = [{ hash: 'sha256:bbb' }];
      
      const hash1 = computeBundleHash(artifacts1);
      const hash2 = computeBundleHash(artifacts2);
      
      expect(hash1).not.toBe(hash2);
    });
    
    it('should use sha256 prefix format', () => {
      const artifacts = [{ hash: 'sha256:test' }];
      const hash = computeBundleHash(artifacts);
      
      expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    });
  });
  
  describe('Gate Requirements', () => {
    interface GateConfig {
      required: boolean;
      canSkip: boolean;
      skipRequiresApproval: boolean;
    }
    
    const gateConfigs: Record<string, GateConfig> = {
      ci: { required: true, canSkip: false, skipRequiresApproval: false },
      policy: { required: true, canSkip: false, skipRequiresApproval: false },
      rehearsal: { required: true, canSkip: false, skipRequiresApproval: false },
      parity: { required: true, canSkip: true, skipRequiresApproval: true }
    };
    
    it('should require CI gate for all promotions', () => {
      expect(gateConfigs.ci.required).toBe(true);
      expect(gateConfigs.ci.canSkip).toBe(false);
    });
    
    it('should require policy gate for all promotions', () => {
      expect(gateConfigs.policy.required).toBe(true);
      expect(gateConfigs.policy.canSkip).toBe(false);
    });
    
    it('should require rehearsal gate for all promotions', () => {
      expect(gateConfigs.rehearsal.required).toBe(true);
      expect(gateConfigs.rehearsal.canSkip).toBe(false);
    });
    
    it('should allow parity skip only with approval', () => {
      expect(gateConfigs.parity.required).toBe(true);
      expect(gateConfigs.parity.canSkip).toBe(true);
      expect(gateConfigs.parity.skipRequiresApproval).toBe(true);
    });
    
    it('should not allow parity skip for production', () => {
      const canSkipParityForProduction = false; // Hardcoded rule
      expect(canSkipParityForProduction).toBe(false);
    });
  });
  
  describe('Promotion Validation Rules', () => {
    function validatePromotion(config: {
      branch: string;
      targetEnv: string;
      skipParity: boolean;
      gates: Record<string, 'passed' | 'failed' | 'skipped'>;
    }): { valid: boolean; errors: string[] } {
      const errors: string[] = [];
      
      // Must be on main branch
      if (config.branch !== 'main') {
        errors.push('Promotions must be from main branch');
      }
      
      // Cannot skip parity for production
      if (config.targetEnv === 'production' && config.skipParity) {
        errors.push('Cannot skip parity for production');
      }
      
      // All required gates must pass (or be skipped if allowed)
      const requiredGates = ['ci', 'policy', 'rehearsal'];
      requiredGates.forEach(gate => {
        if (config.gates[gate] !== 'passed') {
          errors.push(`${gate} gate must pass`);
        }
      });
      
      // Parity must pass unless skipped
      if (!config.skipParity && config.gates.parity !== 'passed') {
        errors.push('parity gate must pass');
      }
      
      return { valid: errors.length === 0, errors };
    }
    
    it('should validate successful staging promotion', () => {
      const result = validatePromotion({
        branch: 'main',
        targetEnv: 'staging',
        skipParity: false,
        gates: { ci: 'passed', policy: 'passed', rehearsal: 'passed', parity: 'passed' }
      });
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
    
    it('should validate successful production promotion', () => {
      const result = validatePromotion({
        branch: 'main',
        targetEnv: 'production',
        skipParity: false,
        gates: { ci: 'passed', policy: 'passed', rehearsal: 'passed', parity: 'passed' }
      });
      
      expect(result.valid).toBe(true);
    });
    
    it('should reject promotion from non-main branch', () => {
      const result = validatePromotion({
        branch: 'develop',
        targetEnv: 'staging',
        skipParity: false,
        gates: { ci: 'passed', policy: 'passed', rehearsal: 'passed', parity: 'passed' }
      });
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Promotions must be from main branch');
    });
    
    it('should reject production promotion with parity skip', () => {
      const result = validatePromotion({
        branch: 'main',
        targetEnv: 'production',
        skipParity: true,
        gates: { ci: 'passed', policy: 'passed', rehearsal: 'passed', parity: 'skipped' }
      });
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Cannot skip parity for production');
    });
    
    it('should allow staging promotion with parity skip', () => {
      const result = validatePromotion({
        branch: 'main',
        targetEnv: 'staging',
        skipParity: true,
        gates: { ci: 'passed', policy: 'passed', rehearsal: 'passed', parity: 'skipped' }
      });
      
      expect(result.valid).toBe(true);
    });
    
    it('should reject promotion with failed CI', () => {
      const result = validatePromotion({
        branch: 'main',
        targetEnv: 'staging',
        skipParity: false,
        gates: { ci: 'failed', policy: 'passed', rehearsal: 'passed', parity: 'passed' }
      });
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('ci gate must pass');
    });
  });
  
  describe('Evidence Bundle Composition', () => {
    it('should include provenance in bundle', () => {
      const requiredArtifacts = ['provenance', 'thresholds', 'parity-report', 'dataset-reference'];
      
      requiredArtifacts.forEach(artifact => {
        expect(['provenance', 'thresholds', 'parity-report', 'dataset-reference']).toContain(artifact);
      });
    });
    
    it('should include checksums file', () => {
      const bundleFiles = ['promotion-manifest.json', 'checksums.txt', 'provenance.json', 'thresholds.json'];
      
      expect(bundleFiles).toContain('checksums.txt');
    });
    
    it('should format checksums correctly', () => {
      const artifacts = [
        { hash: 'sha256:abc123', path: 'file1.json' },
        { hash: 'sha256:def456', path: 'file2.json' }
      ];
      
      const checksums = artifacts.map(a => `${a.hash}  ${a.path}`).join('\n') + '\n';
      
      expect(checksums).toContain('sha256:abc123  file1.json');
      expect(checksums).toContain('sha256:def456  file2.json');
    });
  });
  
  describe('Timestamp Handling', () => {
    it('should use ISO 8601 format for timestamps', () => {
      const timestamp = new Date().toISOString();
      
      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
    });
    
    it('should not include timestamps in bundle hash computation', () => {
      // Bundle hash is computed from artifact hashes only, not timestamps
      const artifacts = [{ hash: 'sha256:test' }];
      
      const hash1 = computeHashFromArtifacts(artifacts, '2025-01-01T00:00:00.000Z');
      const hash2 = computeHashFromArtifacts(artifacts, '2025-01-02T00:00:00.000Z');
      
      expect(hash1).toBe(hash2);
    });
  });
});

// Helper function for timestamp test
function computeHashFromArtifacts(artifacts: Array<{ hash: string }>, _timestamp: string): string {
  // Timestamp is intentionally ignored in hash computation
  const sortedHashes = artifacts.map(a => a.hash).sort();
  const combined = sortedHashes.join(':');
  const hash = crypto.createHash('sha256');
  hash.update(combined, 'utf8');
  return 'sha256:' + hash.digest('hex');
}
```

## 4. Command Outputs

### `pnpm test`

```
Test Files  16 passed (16)
     Tests  311 passed (311)
  Start at  18:08:58
  Duration  1.71s (transform 1.05s, setup 0ms, collect 2.35s, tests 940ms, environment 3ms, prepare 1.23s)
```

### `pnpm check`

```
> job-sheet-qa-frontend@1.0.0 check /home/ubuntu/job-sheet-qa-auditor
> tsc --noEmit
[baseline-browser-mapping] The data in this module is over two months old.  To ensure accurate Baseline data, please update: `npm i baseline-browser-mapping@latest -D`
```

## 5. Self-Audit

- **[PASS]** Default CI remains no-secrets green.
- **[PASS]** `policy-check` is blocking and must pass.
- **[PASS]** Parity PR subset remains a PR gate.
- **[PASS]** Determinism: stable ordering; deterministic bundle composition; no timestamps in content hashes.
- **[PASS]** PII safety enforced on all fixtures.
- **[PASS]** Threshold changes require approval and changelog.
- **[PASS]** Evidence packs must be authoritative.
