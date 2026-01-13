#!/bin/bash
# =============================================================================
# SMOKE CHECK SCRIPT - Contract Aligned
# =============================================================================
# Usage: ./smoke-check.sh <base_url> [expected_git_sha] [mode]
#
# Arguments:
#   base_url         - Required. Target URL (e.g., https://staging.example.com)
#   expected_git_sha - Optional. Expected SHA to verify against deployed version
#   mode             - Optional. soft (default) or strict
#
# Output Files (always written to logs/release/smoke/):
#   - homepage.txt      - Homepage response body
#   - health.txt        - Health endpoint response body
#   - version.json      - Full version endpoint JSON response
#   - deployed_sha.txt  - Extracted gitSha or MISSING_EVIDENCE marker
#   - summary.json      - Structured summary with all check results
#
# Exit Codes:
#   0 - All checks passed (or soft mode with warnings)
#   1 - Critical failure (strict mode) or missing required evidence
# =============================================================================

set -euo pipefail

# =============================================================================
# Arguments
# =============================================================================
BASE_URL="${1:-}"
EXPECTED_GIT_SHA="${2:-}"
MODE="${3:-soft}"

if [[ -z "$BASE_URL" ]]; then
  echo "ERROR: base_url is required"
  echo "Usage: $0 <base_url> [expected_git_sha] [mode]"
  exit 1
fi

# Validate mode
if [[ "$MODE" != "soft" && "$MODE" != "strict" ]]; then
  echo "ERROR: mode must be 'soft' or 'strict', got '$MODE'"
  exit 1
fi

# =============================================================================
# Setup
# =============================================================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
LOG_DIR="$REPO_ROOT/logs/release/smoke"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

mkdir -p "$LOG_DIR"

# Initialize tracking variables
HOMEPAGE_STATUS="UNKNOWN"
HOMEPAGE_HTTP_CODE="000"
HOMEPAGE_DURATION_MS=0
HEALTH_STATUS="UNKNOWN"
HEALTH_HTTP_CODE="000"
HEALTH_DURATION_MS=0
VERSION_STATUS="UNKNOWN"
VERSION_HTTP_CODE="000"
VERSION_DURATION_MS=0
DEPLOYED_SHA=""
SHA_MATCH_STATUS="N/A"
OVERALL_STATUS="PASS"
WARNINGS=()

# =============================================================================
# Helper Functions
# =============================================================================
log_info() {
  echo "[INFO] $1"
}

log_pass() {
  echo "[PASS] $1"
}

log_fail() {
  echo "[FAIL] $1"
}

log_warn() {
  echo "[WARN] $1"
  WARNINGS+=("$1")
}

measure_request() {
  local url="$1"
  local output_file="$2"
  local start_time=$(date +%s%N)
  
  local http_code
  http_code=$(curl -sS -o "$output_file" -w "%{http_code}" \
    --max-time 30 \
    --connect-timeout 10 \
    "$url" 2>/dev/null) || http_code="000"
  
  local end_time=$(date +%s%N)
  local duration_ms=$(( (end_time - start_time) / 1000000 ))
  
  echo "$http_code $duration_ms"
}

# =============================================================================
# Banner
# =============================================================================
echo "=================================================="
echo "  SMOKE CHECK"
echo "=================================================="
echo "  Base URL:     $BASE_URL"
echo "  Expected SHA: ${EXPECTED_GIT_SHA:-<not specified>}"
echo "  Mode:         $MODE"
echo "  Timestamp:    $TIMESTAMP"
echo "=================================================="
echo ""

# =============================================================================
# Check 1: Homepage
# =============================================================================
echo "--- Check 1: Homepage ---"
HOMEPAGE_FILE="$LOG_DIR/homepage.txt"

read HOMEPAGE_HTTP_CODE HOMEPAGE_DURATION_MS <<< $(measure_request "$BASE_URL" "$HOMEPAGE_FILE")

if [[ "$HOMEPAGE_HTTP_CODE" =~ ^2[0-9][0-9]$ ]]; then
  HOMEPAGE_STATUS="PASS"
  log_pass "Homepage - HTTP $HOMEPAGE_HTTP_CODE (${HOMEPAGE_DURATION_MS}ms)"
else
  HOMEPAGE_STATUS="FAIL"
  log_fail "Homepage - HTTP $HOMEPAGE_HTTP_CODE"
  OVERALL_STATUS="FAIL"
fi

# =============================================================================
# Check 2: Health Endpoint
# =============================================================================
echo ""
echo "--- Check 2: Health Endpoint ---"
HEALTH_FILE="$LOG_DIR/health.txt"

# Try tRPC health endpoint first
HEALTH_URL="$BASE_URL/api/trpc/system.health?input=%7B%7D"
read HEALTH_HTTP_CODE HEALTH_DURATION_MS <<< $(measure_request "$HEALTH_URL" "$HEALTH_FILE")

if [[ ! "$HEALTH_HTTP_CODE" =~ ^2[0-9][0-9]$ ]]; then
  # Fallback to /api/health
  HEALTH_URL="$BASE_URL/api/health"
  read HEALTH_HTTP_CODE HEALTH_DURATION_MS <<< $(measure_request "$HEALTH_URL" "$HEALTH_FILE")
fi

if [[ "$HEALTH_HTTP_CODE" =~ ^2[0-9][0-9]$ ]]; then
  HEALTH_STATUS="PASS"
  log_pass "Health - HTTP $HEALTH_HTTP_CODE (${HEALTH_DURATION_MS}ms)"
else
  HEALTH_STATUS="FAIL"
  log_fail "Health - HTTP $HEALTH_HTTP_CODE"
  OVERALL_STATUS="FAIL"
fi

# =============================================================================
# Check 3: Version Endpoint (Critical for SHA capture)
# =============================================================================
echo ""
echo "--- Check 3: Version Endpoint ---"
VERSION_FILE="$LOG_DIR/version.json"
DEPLOYED_SHA_FILE="$LOG_DIR/deployed_sha.txt"

# Try tRPC version endpoint first
VERSION_URL="$BASE_URL/api/trpc/system.version?input=%7B%7D"
read VERSION_HTTP_CODE VERSION_DURATION_MS <<< $(measure_request "$VERSION_URL" "$VERSION_FILE")

if [[ ! "$VERSION_HTTP_CODE" =~ ^2[0-9][0-9]$ ]]; then
  # Fallback to /api/version
  VERSION_URL="$BASE_URL/api/version"
  read VERSION_HTTP_CODE VERSION_DURATION_MS <<< $(measure_request "$VERSION_URL" "$VERSION_FILE")
fi

if [[ "$VERSION_HTTP_CODE" =~ ^2[0-9][0-9]$ ]]; then
  VERSION_STATUS="PASS"
  log_pass "Version - HTTP $VERSION_HTTP_CODE (${VERSION_DURATION_MS}ms)"
  
  # Extract gitSha from response
  # Handle both: result.data.json.gitSha AND result.data.gitSha
  if command -v jq &> /dev/null; then
    DEPLOYED_SHA=$(jq -r '.result.data.json.gitSha // .result.data.gitSha // .gitSha // empty' "$VERSION_FILE" 2>/dev/null || echo "")
  else
    # Fallback: grep for gitSha
    DEPLOYED_SHA=$(grep -oP '"gitSha"\s*:\s*"\K[^"]+' "$VERSION_FILE" 2>/dev/null | head -1 || echo "")
  fi
  
  if [[ -n "$DEPLOYED_SHA" && "$DEPLOYED_SHA" != "null" ]]; then
    echo "$DEPLOYED_SHA" > "$DEPLOYED_SHA_FILE"
    log_pass "Deployed SHA captured: $DEPLOYED_SHA"
  else
    echo "MISSING_EVIDENCE: version endpoint returned 200 but gitSha field is missing or null" > "$DEPLOYED_SHA_FILE"
    log_warn "Could not extract gitSha from version response"
    DEPLOYED_SHA=""
    
    if [[ "$MODE" == "strict" ]]; then
      OVERALL_STATUS="FAIL"
    else
      if [[ "$OVERALL_STATUS" == "PASS" ]]; then
        OVERALL_STATUS="WARN"
      fi
    fi
  fi
else
  VERSION_STATUS="FAIL"
  log_fail "Version - HTTP $VERSION_HTTP_CODE"
  echo "MISSING_EVIDENCE: version endpoint returned HTTP $VERSION_HTTP_CODE" > "$DEPLOYED_SHA_FILE"
  
  if [[ "$MODE" == "strict" ]]; then
    OVERALL_STATUS="FAIL"
  else
    if [[ "$OVERALL_STATUS" == "PASS" ]]; then
      OVERALL_STATUS="WARN"
    fi
  fi
fi

# =============================================================================
# Check 4: SHA Match (if expected SHA provided)
# =============================================================================
if [[ -n "$EXPECTED_GIT_SHA" && -n "$DEPLOYED_SHA" ]]; then
  echo ""
  echo "--- Check 4: SHA Match ---"
  
  # Compare (handle both full and short SHA)
  if [[ "$DEPLOYED_SHA" == "$EXPECTED_GIT_SHA" || "$DEPLOYED_SHA" == "${EXPECTED_GIT_SHA:0:7}"* || "${DEPLOYED_SHA:0:7}" == "${EXPECTED_GIT_SHA:0:7}" ]]; then
    SHA_MATCH_STATUS="MATCH"
    log_pass "SHA Match - Expected: $EXPECTED_GIT_SHA, Deployed: $DEPLOYED_SHA"
  else
    SHA_MATCH_STATUS="MISMATCH"
    log_warn "SHA Mismatch - Expected: $EXPECTED_GIT_SHA, Deployed: $DEPLOYED_SHA"
    
    if [[ "$MODE" == "strict" ]]; then
      OVERALL_STATUS="FAIL"
    else
      if [[ "$OVERALL_STATUS" == "PASS" ]]; then
        OVERALL_STATUS="WARN"
      fi
    fi
  fi
fi

# =============================================================================
# Check 5: PDF Proxy Endpoint (must return 401 for unauth, not redirect)
# =============================================================================
echo ""
echo "--- Check 5: PDF Proxy Auth ---"
PDF_PROXY_STATUS="UNKNOWN"
PDF_PROXY_HTTP_CODE="000"
PDF_DURATION_MS=0

# Test with a sample job ID (31) - should return 401 for unauthenticated, not 302
PDF_START_TIME=$(date +%s%N)
PDF_PROXY_HTTP_CODE=$(curl -sS -o /dev/null -w "%{http_code}" "$BASE_URL/api/documents/31/pdf" --max-time 10 2>/dev/null || echo "000")
PDF_END_TIME=$(date +%s%N)
PDF_DURATION_MS=$(( (PDF_END_TIME - PDF_START_TIME) / 1000000 ))

if [[ "$PDF_PROXY_HTTP_CODE" == "401" ]]; then
  PDF_PROXY_STATUS="PASS"
  log_pass "PDF Proxy Auth - HTTP 401 (correct for unauthenticated) (${PDF_DURATION_MS}ms)"
elif [[ "$PDF_PROXY_HTTP_CODE" == "302" || "$PDF_PROXY_HTTP_CODE" == "301" ]]; then
  PDF_PROXY_STATUS="FAIL"
  log_fail "PDF Proxy Auth - HTTP $PDF_PROXY_HTTP_CODE (redirect not allowed, should be 401)"
  if [[ "$MODE" == "strict" ]]; then
    OVERALL_STATUS="FAIL"
  fi
else
  # 404 or other codes might be acceptable in some cases
  PDF_PROXY_STATUS="WARN"
  log_warn "PDF Proxy Auth - HTTP $PDF_PROXY_HTTP_CODE (expected 401)"
  if [[ "$MODE" == "strict" && "$PDF_PROXY_HTTP_CODE" != "404" ]]; then
    OVERALL_STATUS="FAIL"
  fi
fi

# =============================================================================
# Write Summary JSON
# =============================================================================
SUMMARY_FILE="$LOG_DIR/summary.json"

cat > "$SUMMARY_FILE" << EOF
{
  "timestamp": "$TIMESTAMP",
  "baseUrl": "$BASE_URL",
  "mode": "$MODE",
  "expectedGitSha": "${EXPECTED_GIT_SHA:-null}",
  "deployedGitSha": "${DEPLOYED_SHA:-null}",
  "shaMatchStatus": "$SHA_MATCH_STATUS",
  "overallStatus": "$OVERALL_STATUS",
  "checks": [
    {
      "name": "homepage",
      "status": "$HOMEPAGE_STATUS",
      "httpCode": $HOMEPAGE_HTTP_CODE,
      "durationMs": $HOMEPAGE_DURATION_MS
    },
    {
      "name": "health",
      "status": "$HEALTH_STATUS",
      "httpCode": $HEALTH_HTTP_CODE,
      "durationMs": $HEALTH_DURATION_MS
    },
    {
      "name": "version",
      "status": "$VERSION_STATUS",
      "httpCode": $VERSION_HTTP_CODE,
      "durationMs": $VERSION_DURATION_MS
    },
    {
      "name": "pdfProxyAuth",
      "status": "$PDF_PROXY_STATUS",
      "httpCode": $PDF_PROXY_HTTP_CODE,
      "durationMs": $PDF_DURATION_MS
    }
  ],
  "warnings": $(printf '%s\n' "${WARNINGS[@]:-}" | jq -R . | jq -s . 2>/dev/null || echo "[]")
}
EOF

# =============================================================================
# Summary
# =============================================================================
echo ""
echo "--- Summary ---"
echo "  Homepage:      $HOMEPAGE_STATUS"
echo "  Health:        $HEALTH_STATUS"
echo "  Version:       $VERSION_STATUS"
echo "  PDF Proxy:     $PDF_PROXY_STATUS"
echo "  Deployed SHA:  ${DEPLOYED_SHA:-<not captured>}"
echo "  SHA Match:     $SHA_MATCH_STATUS"
echo "  Overall:       $OVERALL_STATUS"
echo "  Logs:          $LOG_DIR"

# =============================================================================
# Exit
# =============================================================================
if [[ "$OVERALL_STATUS" == "FAIL" ]]; then
  echo ""
  echo "❌ Smoke checks failed"
  exit 1
elif [[ "$OVERALL_STATUS" == "WARN" ]]; then
  echo ""
  echo "⚠️  Smoke checks completed with warnings (mode=$MODE)"
  exit 0
else
  echo ""
  echo "✅ Smoke checks passed"
  exit 0
fi
