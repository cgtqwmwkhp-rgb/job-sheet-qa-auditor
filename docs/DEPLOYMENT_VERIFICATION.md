# Deployment Verification Guide

This document describes the commands and checks required to verify a successful Azure deployment.

## Pre-Flight Checks

Before deploying, ensure:

1. ✅ All CI checks pass (build, lint, typecheck, tests)
2. ✅ Docker image builds locally
3. ✅ GitHub secrets are configured
4. ✅ Azure resources are provisioned

## Health Endpoint Verification

### Required Endpoints

| Endpoint | Expected Status | Description |
|----------|-----------------|-------------|
| `/healthz` | 200 | Liveness probe - server is running |
| `/readyz` | 200 | Readiness probe - all dependencies OK |
| `/metrics` | 200 | Prometheus metrics |
| `/api/trpc/system.version` | 200 | Version/build info |

### Verification Commands

Replace `${STAGING_URL}` with your actual staging URL (e.g., `https://jobsheet-qa-staging.azurecontainerapps.io`).

```bash
# Set the URL for convenience
export STAGING_URL="https://your-app.azurecontainerapps.io"

# 1. Liveness Check
curl -sf "${STAGING_URL}/healthz" && echo "✅ /healthz OK" || echo "❌ /healthz FAILED"

# 2. Readiness Check (includes DB + Storage)
curl -sf "${STAGING_URL}/readyz" | jq .

# Expected output:
# {
#   "status": "ok",
#   "checks": {
#     "database": { "status": "ok" },
#     "storage": { "status": "ok" }
#   }
# }

# 3. Metrics Check (Prometheus format)
curl -sf "${STAGING_URL}/metrics" | head -20

# Should contain lines like:
# # HELP http_requests_total Total HTTP requests
# # TYPE http_requests_total counter
# http_requests_total{method="GET",route="/healthz"} 5

# 4. Version Check
curl -sf "${STAGING_URL}/api/trpc/system.version" | jq .

# Expected output:
# {
#   "result": {
#     "data": {
#       "version": "1.0.0",
#       "buildTime": "2024-01-15T10:00:00Z",
#       "gitSha": "abc1234",
#       "environment": "production"
#     }
#   }
# }
```

## Full Verification Script

Save this as `scripts/verify-deployment.sh`:

```bash
#!/bin/bash
set -e

# Usage: ./scripts/verify-deployment.sh <URL>
URL="${1:-$STAGING_URL}"

if [ -z "$URL" ]; then
  echo "Usage: $0 <deployment-url>"
  echo "Example: $0 https://jobsheet-qa-staging.azurecontainerapps.io"
  exit 1
fi

echo "🔍 Verifying deployment at: $URL"
echo ""

# 1. Liveness
echo "1️⃣  Checking /healthz..."
HEALTH=$(curl -sf "$URL/healthz" || echo "FAILED")
if [ "$HEALTH" != "FAILED" ]; then
  echo "   ✅ /healthz OK"
else
  echo "   ❌ /healthz FAILED"
  exit 1
fi

# 2. Readiness
echo "2️⃣  Checking /readyz..."
READY=$(curl -sf "$URL/readyz")
if echo "$READY" | grep -q '"status":"ok"'; then
  echo "   ✅ /readyz OK"
  echo "   $READY" | jq -c .
else
  echo "   ❌ /readyz FAILED"
  echo "   $READY"
  exit 1
fi

# 3. Metrics
echo "3️⃣  Checking /metrics..."
METRICS=$(curl -sf "$URL/metrics" | head -5)
if echo "$METRICS" | grep -q "# HELP\|# TYPE"; then
  echo "   ✅ /metrics OK (Prometheus format)"
else
  echo "   ⚠️  /metrics format unexpected"
fi

# 4. Version
echo "4️⃣  Checking /api/trpc/system.version..."
VERSION=$(curl -sf "$URL/api/trpc/system.version")
if echo "$VERSION" | grep -q "gitSha"; then
  SHA=$(echo "$VERSION" | jq -r '.result.data.gitSha // .gitSha // "unknown"')
  echo "   ✅ Version OK (SHA: $SHA)"
else
  echo "   ⚠️  Version check returned unexpected format"
fi

echo ""
echo "🎉 Deployment verification complete!"
```

## Workflow Integration

The GitHub Actions workflow should include these verification steps:

```yaml
verify-staging:
  needs: deploy-staging
  runs-on: ubuntu-latest
  steps:
    - name: Wait for deployment to stabilize
      run: sleep 90

    - name: Verify /healthz
      run: |
        response=$(curl -sf "${{ needs.deploy-staging.outputs.staging_url }}/healthz")
        if [ -z "$response" ]; then
          echo "❌ /healthz failed"
          exit 1
        fi
        echo "✅ /healthz passed"

    - name: Verify /readyz
      run: |
        response=$(curl -sf "${{ needs.deploy-staging.outputs.staging_url }}/readyz")
        if ! echo "$response" | grep -q '"status":"ok"'; then
          echo "❌ /readyz failed: $response"
          exit 1
        fi
        echo "✅ /readyz passed: $response"

    - name: Verify /metrics
      run: |
        response=$(curl -sf "${{ needs.deploy-staging.outputs.staging_url }}/metrics" | head -10)
        if ! echo "$response" | grep -q "# TYPE"; then
          echo "❌ /metrics not in Prometheus format"
          exit 1
        fi
        echo "✅ /metrics passed"

    - name: Verify version matches deployed SHA
      run: |
        response=$(curl -sf "${{ needs.deploy-staging.outputs.staging_url }}/api/trpc/system.version")
        deployed_sha=$(echo "$response" | jq -r '.result.data.gitSha // .gitSha')
        expected_sha="${{ github.sha }}"
        
        # Compare first 7 characters
        if [ "${deployed_sha:0:7}" != "${expected_sha:0:7}" ]; then
          echo "❌ SHA mismatch: deployed=$deployed_sha expected=$expected_sha"
          exit 1
        fi
        echo "✅ Version SHA matches: $deployed_sha"
```

## Troubleshooting

### /healthz returns 503

- Container failed to start
- Check: `az containerapp logs show --name <app> --resource-group <rg>`

### /readyz returns 503 with database error

- Database connection failed
- Check: DATABASE_URL is correctly set
- Check: MySQL firewall allows Azure services

### /readyz returns 503 with storage error

- Azure Storage connection failed
- Check: AZURE_STORAGE_CONNECTION_STRING is correctly set
- Check: Storage container exists

### /metrics returns 404

- Metrics endpoint not registered
- Check: Server started correctly

### Version SHA mismatch

- Old container revision still running
- Check: `az containerapp revision list --name <app> --resource-group <rg>`
- Force new revision if needed

## Production Deployment Checklist

Before deploying to production:

- [ ] Staging verification passes
- [ ] No errors in staging logs for 1 hour
- [ ] Manual smoke test completed
- [ ] Production secrets configured
- [ ] Production environment variables set
- [ ] Approval obtained (if required)

After deploying to production:

- [ ] Run verification script against PRODUCTION_URL
- [ ] Monitor error rates for 30 minutes
- [ ] Verify no increase in error logs
- [ ] Update deployment log
