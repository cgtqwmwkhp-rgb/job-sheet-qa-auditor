# PR-13c: Promotion Workflow Changes

This document contains the required changes to `.github/workflows/promotion.yml` that could not be pushed due to GitHub App workflow permission restrictions.

## Summary

The promotion workflow needs to be updated to:
1. Remove `|| true` bypass pattern from parity commands (NO || true allowed)
2. Read parity report from `parity/reports/latest.json` (real output)
3. Add `skip_parity_acknowledgement` input requiring `I_ACCEPT_PARITY_SKIP`
4. Ensure job exits with code 1 on parity failure

## Required Changes

### 1. Add New Input for Skip Acknowledgement

Add to `workflow_dispatch.inputs`:

```yaml
skip_parity_acknowledgement:
  description: 'Type I_ACCEPT_PARITY_SKIP to acknowledge parity skip (staging only)'
  required: false
  default: ''
  type: string
```

### 2. Add Environment Variable

```yaml
env:
  NODE_VERSION: '22'
  PARITY_SKIP_ACKNOWLEDGEMENT: 'I_ACCEPT_PARITY_SKIP'
```

### 3. Update validate-request Job

Add output for parity skip allowed:

```yaml
outputs:
  can_proceed: ${{ steps.validate.outputs.can_proceed }}
  validation_report: ${{ steps.validate.outputs.report }}
  parity_skip_allowed: ${{ steps.validate.outputs.parity_skip_allowed }}
```

Update validation logic:

```bash
PARITY_SKIP_ALLOWED="false"

# Check skip_parity controls
if [ "${{ inputs.skip_parity }}" = "true" ]; then
  echo "⚠️ Parity skip requested"
  
  # PRODUCTION: NEVER allow parity skip
  if [ "${{ inputs.target_environment }}" = "production" ]; then
    echo "❌ Cannot skip parity for production - this is non-negotiable"
    CAN_PROCEED="false"
    REPORT="${REPORT}❌ Cannot skip parity for production\n"
  else
    # STAGING: Requires acknowledgement
    if [ "${{ inputs.skip_parity_acknowledgement }}" = "${{ env.PARITY_SKIP_ACKNOWLEDGEMENT }}" ]; then
      echo "✅ Parity skip acknowledged for staging"
      PARITY_SKIP_ALLOWED="true"
      REPORT="${REPORT}⚠️ Parity skip acknowledged for staging\n"
    else
      echo "❌ Parity skip requires acknowledgement text: ${{ env.PARITY_SKIP_ACKNOWLEDGEMENT }}"
      CAN_PROCEED="false"
      REPORT="${REPORT}❌ Parity skip requires acknowledgement: ${{ env.PARITY_SKIP_ACKNOWLEDGEMENT }}\n"
    fi
  fi
fi

echo "parity_skip_allowed=$PARITY_SKIP_ALLOWED" >> $GITHUB_OUTPUT
```

### 4. Update parity-gate Job Condition

```yaml
if: |
  needs.validate-request.outputs.can_proceed == 'true' && 
  needs.validate-request.outputs.parity_skip_allowed != 'true'
```

### 5. Update Run Parity Full Suite Step

**CRITICAL: Remove `|| true` bypass**

```yaml
- name: Run Parity Full Suite
  id: parity
  run: |
    echo "Running parity full suite..."
    mkdir -p parity/reports
    
    # Run parity tests - NO || true - we want real failures
    pnpm test:parity:full 2>&1 | tee parity/reports/promotion-parity.txt
    
    # Read parity report from parity/reports/latest.json (real output)
    if [ -f parity/reports/latest.json ]; then
      echo "Reading parity report from parity/reports/latest.json"
      STATUS=$(jq -r '.status' parity/reports/latest.json)
      PASS_RATE=$(jq -r '.passRate' parity/reports/latest.json)
      
      # Copy to promotion report
      cp parity/reports/latest.json parity/reports/promotion-parity.json
      
      echo "status=$STATUS" >> $GITHUB_OUTPUT
      echo "pass_rate=$PASS_RATE" >> $GITHUB_OUTPUT
      
      echo "=== Parity Report ==="
      echo "Status: $STATUS"
      echo "Pass Rate: $PASS_RATE%"
      
      # FAIL THE JOB IF PARITY FAILS - NO BYPASS
      if [ "$STATUS" = "fail" ]; then
        echo "❌ Parity check FAILED"
        echo "Violations:"
        jq -r '.violations[]' parity/reports/latest.json 2>/dev/null || echo "No violations listed"
        exit 1
      fi
      
      echo "✅ Parity check PASSED"
    else
      echo "❌ No parity report found at parity/reports/latest.json"
      exit 1
    fi
```

### 6. Update generate-promotion-bundle Job Condition

```yaml
if: |
  always() &&
  needs.validate-request.outputs.can_proceed == 'true' &&
  needs.ci-gate.result == 'success' &&
  needs.policy-gate.result == 'success' &&
  needs.rehearsal-gate.result == 'success' &&
  (needs.parity-gate.result == 'success' || needs.validate-request.outputs.parity_skip_allowed == 'true')
```

### 7. Update Create Promotion Bundle Step

```yaml
- name: Create Promotion Bundle
  run: |
    mkdir -p promotion-bundle
    
    # Determine parity status
    PARITY_STATUS="passed"
    PARITY_PASS_RATE="${{ needs.parity-gate.outputs.parity_pass_rate || 'N/A' }}"
    
    if [ "${{ needs.validate-request.outputs.parity_skip_allowed }}" = "true" ]; then
      PARITY_STATUS="skipped"
    fi
    
    # Build metadata - read from real parity report
    cat > promotion-bundle/promotion-manifest.json << EOF
    {
      "version": "1.0.0",
      "schemaVersion": "1",
      "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
      "sha": "${{ github.sha }}",
      "targetEnvironment": "${{ inputs.target_environment }}",
      "triggeredBy": "${{ github.actor }}",
      "runId": "${{ github.run_id }}",
      "gates": {
        "ci": "passed",
        "policy": "passed",
        "rehearsal": "passed",
        "parity": "${PARITY_STATUS}"
      },
      "paritySkipped": ${{ needs.validate-request.outputs.parity_skip_allowed == 'true' }},
      "parityPassRate": ${PARITY_PASS_RATE:-null},
      "paritySkipAcknowledgement": ${{ needs.validate-request.outputs.parity_skip_allowed == 'true' && format('"{0}"', inputs.skip_parity_acknowledgement) || 'null' }}
    }
    EOF
    
    # Copy provenance
    if [ -f parity/provenance.json ]; then
      cp parity/provenance.json promotion-bundle/
    fi
    
    # Copy thresholds
    cp parity/config/thresholds.json promotion-bundle/
    
    # Copy parity report from real output
    if [ -f parity/reports/latest.json ]; then
      cp parity/reports/latest.json promotion-bundle/parity-report.json
    fi
    
    # Generate checksums for bundle
    find promotion-bundle -type f -exec sha256sum {} \; > promotion-bundle/bundle-checksums.txt
    
    echo "=== Promotion Bundle Contents ==="
    ls -la promotion-bundle/
    echo ""
    echo "=== Manifest ==="
    cat promotion-bundle/promotion-manifest.json
```

## Manual Application

To apply these changes:

1. Open `.github/workflows/promotion.yml` in the GitHub web editor
2. Apply the changes described above
3. Commit directly to main or create a PR through the web interface

## Verification

After applying, run the contract tests to verify:

```bash
pnpm test -- server/tests/contracts/stage13c.workflow-contract.test.ts
```

All tests should pass, verifying:
- No `|| true` bypass patterns
- No `continue-on-error: true` for parity steps
- Parity report read from `parity/reports/latest.json`
- Skip acknowledgement controls in place
