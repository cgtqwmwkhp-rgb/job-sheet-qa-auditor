#!/bin/bash
# =============================================================================
# DEPLOYMENT VERIFICATION SCRIPT
# =============================================================================
# Verifies that a deployment is healthy and operational.
#
# Usage:
#   ./scripts/verify-deployment.sh <URL>
#   ./scripts/verify-deployment.sh https://jobsheet-qa-staging.azurecontainerapps.io
#
# Required:
#   - curl
#   - jq (optional, for pretty output)
#
# Checks:
#   1. /healthz - Liveness probe
#   2. /readyz  - Readiness probe (DB + Storage)
#   3. /metrics - Prometheus metrics
#   4. /api/trpc/system.version - Version info
#
# Exit codes:
#   0 - All checks passed
#   1 - One or more checks failed
# =============================================================================

set -e

URL="${1:-$STAGING_URL}"

if [ -z "$URL" ]; then
  echo "❌ Error: No URL provided"
  echo ""
  echo "Usage: $0 <deployment-url>"
  echo "Example: $0 https://jobsheet-qa-staging.azurecontainerapps.io"
  echo ""
  echo "Or set STAGING_URL environment variable"
  exit 1
fi

# Remove trailing slash if present
URL="${URL%/}"

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║           DEPLOYMENT VERIFICATION                              ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "🔍 Target: $URL"
echo ""

FAILED=0

# 1. Liveness Check
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1️⃣  Checking /healthz (Liveness)..."
HEALTH_RESPONSE=$(curl -sf --max-time 10 "$URL/healthz" 2>&1 || echo "CURL_FAILED")
if [ "$HEALTH_RESPONSE" != "CURL_FAILED" ] && [ -n "$HEALTH_RESPONSE" ]; then
  echo "   ✅ /healthz OK"
else
  echo "   ❌ /healthz FAILED"
  FAILED=1
fi

# 2. Readiness Check
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "2️⃣  Checking /readyz (Readiness)..."
READY_RESPONSE=$(curl -sf --max-time 10 "$URL/readyz" 2>&1 || echo "CURL_FAILED")
if [ "$READY_RESPONSE" = "CURL_FAILED" ]; then
  echo "   ❌ /readyz FAILED (no response)"
  FAILED=1
elif echo "$READY_RESPONSE" | grep -q '"status":"ok"'; then
  echo "   ✅ /readyz OK"
  # Pretty print if jq is available
  if command -v jq &> /dev/null; then
    echo "$READY_RESPONSE" | jq -C '.' 2>/dev/null || echo "$READY_RESPONSE"
  else
    echo "   Response: $READY_RESPONSE"
  fi
else
  echo "   ❌ /readyz FAILED (unhealthy status)"
  echo "   Response: $READY_RESPONSE"
  FAILED=1
fi

# 3. Metrics Check
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "3️⃣  Checking /metrics (Prometheus)..."
METRICS_RESPONSE=$(curl -sf --max-time 10 "$URL/metrics" 2>&1 | head -10 || echo "CURL_FAILED")
if [ "$METRICS_RESPONSE" = "CURL_FAILED" ] || [ -z "$METRICS_RESPONSE" ]; then
  echo "   ⚠️  /metrics not available or empty"
elif echo "$METRICS_RESPONSE" | grep -q "# HELP\|# TYPE"; then
  echo "   ✅ /metrics OK (Prometheus format)"
  echo "   Sample:"
  echo "$METRICS_RESPONSE" | head -5 | sed 's/^/   /'
else
  echo "   ⚠️  /metrics returned unexpected format"
fi

# 4. Version Check
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "4️⃣  Checking /api/trpc/system.version..."
VERSION_RESPONSE=$(curl -sf --max-time 10 "$URL/api/trpc/system.version" 2>&1 || echo "CURL_FAILED")
if [ "$VERSION_RESPONSE" = "CURL_FAILED" ]; then
  echo "   ⚠️  Version endpoint not available"
elif echo "$VERSION_RESPONSE" | grep -q "gitSha\|version"; then
  echo "   ✅ Version info available"
  if command -v jq &> /dev/null; then
    # Extract key info
    SHA=$(echo "$VERSION_RESPONSE" | jq -r '.result.data.gitSha // .gitSha // "unknown"' 2>/dev/null)
    BUILD=$(echo "$VERSION_RESPONSE" | jq -r '.result.data.buildTime // .buildTime // "unknown"' 2>/dev/null)
    echo "   Git SHA: $SHA"
    echo "   Build: $BUILD"
  else
    echo "   Response: $VERSION_RESPONSE"
  fi
else
  echo "   ⚠️  Version info format unexpected"
  echo "   Response: $VERSION_RESPONSE"
fi

# Summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ $FAILED -eq 0 ]; then
  echo "✅ VERIFICATION PASSED"
  echo ""
  echo "🎉 Deployment at $URL is healthy!"
  exit 0
else
  echo "❌ VERIFICATION FAILED"
  echo ""
  echo "One or more critical checks failed. See above for details."
  exit 1
fi
