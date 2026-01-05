#!/bin/bash
# =============================================================================
# Release Smoke Check Script
# =============================================================================
# Performs HTTP smoke checks against a target environment and captures
# deployed SHA from the version endpoint.
#
# Usage:
#   ./smoke-check.sh <target_url> [expected_git_sha] [mode]
#
# Arguments:
#   target_url       - Required. Base URL of the target environment
#   expected_git_sha - Optional. Expected Git SHA to verify against deployed
#   mode             - Optional. "soft" (default) or "strict"
#
# Outputs:
#   logs/release/smoke/homepage.log
#   logs/release/smoke/health.log
#   logs/release/smoke/version.json
#   logs/release/smoke/deployed_sha.txt
#   logs/release/smoke/summary.json
#
# Exit Codes:
#   0 - All checks passed
#   1 - Check failed (in strict mode) or critical error
# =============================================================================

set -euo pipefail

# =============================================================================
# Configuration
# =============================================================================
TARGET_URL="${1:-}"
EXPECTED_GIT_SHA="${2:-}"
MODE="${3:-soft}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
LOG_DIR="$PROJECT_ROOT/logs/release/smoke"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# =============================================================================
# Validation
# =============================================================================
if [[ -z "$TARGET_URL" ]]; then
  echo "ERROR: target_url is required"
  echo "Usage: $0 <target_url> [expected_git_sha] [mode]"
  exit 1
fi

if [[ "$MODE" != "soft" && "$MODE" != "strict" ]]; then
  echo "ERROR: mode must be 'soft' or 'strict', got '$MODE'"
  exit 1
fi

# Remove trailing slash from URL
TARGET_URL="${TARGET_URL%/}"

echo "=================================================="
echo "  SMOKE CHECK"
echo "=================================================="
echo "  Target:       $TARGET_URL"
echo "  Expected SHA: ${EXPECTED_GIT_SHA:-<not specified>}"
echo "  Mode:         $MODE"
echo "  Timestamp:    $TIMESTAMP"
echo "=================================================="

# =============================================================================
# Setup
# =============================================================================
mkdir -p "$LOG_DIR"

# Initialize summary
SUMMARY_FILE="$LOG_DIR/summary.json"
HOMEPAGE_STATUS="UNKNOWN"
HEALTH_STATUS="UNKNOWN"
VERSION_STATUS="UNKNOWN"
DEPLOYED_SHA=""
SHA_MATCH="N/A"
OVERALL_STATUS="UNKNOWN"

# =============================================================================
# Helper Functions
# =============================================================================
log_check() {
  local name="$1"
  local status="$2"
  local details="${3:-}"
  echo "[$status] $name${details:+ - $details}"
}

write_summary() {
  cat > "$SUMMARY_FILE" << EOF
{
  "timestamp": "$TIMESTAMP",
  "target_url": "$TARGET_URL",
  "mode": "$MODE",
  "expected_git_sha": "${EXPECTED_GIT_SHA:-null}",
  "deployed_git_sha": "${DEPLOYED_SHA:-null}",
  "sha_match": "$SHA_MATCH",
  "checks": {
    "homepage": "$HOMEPAGE_STATUS",
    "health": "$HEALTH_STATUS",
    "version": "$VERSION_STATUS"
  },
  "overall_status": "$OVERALL_STATUS"
}
EOF
}

# =============================================================================
# Check 1: Homepage
# =============================================================================
echo ""
echo "--- Check 1: Homepage ---"
HOMEPAGE_LOG="$LOG_DIR/homepage.log"

HTTP_CODE=$(curl -sS -o "$HOMEPAGE_LOG" -w "%{http_code}" \
  --max-time 30 \
  --connect-timeout 10 \
  "$TARGET_URL/" 2>&1) || HTTP_CODE="000"

if [[ "$HTTP_CODE" =~ ^2[0-9][0-9]$ ]]; then
  HOMEPAGE_STATUS="PASS"
  log_check "Homepage" "PASS" "HTTP $HTTP_CODE"
else
  HOMEPAGE_STATUS="FAIL"
  log_check "Homepage" "FAIL" "HTTP $HTTP_CODE"
fi

# =============================================================================
# Check 2: Health Endpoint
# =============================================================================
echo ""
echo "--- Check 2: Health Endpoint ---"
HEALTH_LOG="$LOG_DIR/health.log"

# Try tRPC health endpoint first
HEALTH_URL="$TARGET_URL/api/trpc/system.health?input=%7B%7D"
HTTP_CODE=$(curl -sS -o "$HEALTH_LOG" -w "%{http_code}" \
  --max-time 30 \
  --connect-timeout 10 \
  "$HEALTH_URL" 2>&1) || HTTP_CODE="000"

if [[ ! "$HTTP_CODE" =~ ^2[0-9][0-9]$ ]]; then
  # Fallback to /api/health
  HEALTH_URL="$TARGET_URL/api/health"
  HTTP_CODE=$(curl -sS -o "$HEALTH_LOG" -w "%{http_code}" \
    --max-time 30 \
    --connect-timeout 10 \
    "$HEALTH_URL" 2>&1) || HTTP_CODE="000"
fi

if [[ "$HTTP_CODE" =~ ^2[0-9][0-9]$ ]]; then
  HEALTH_STATUS="PASS"
  log_check "Health" "PASS" "HTTP $HTTP_CODE"
  # Show excerpt
  echo "  Response excerpt: $(head -c 200 "$HEALTH_LOG")"
else
  HEALTH_STATUS="FAIL"
  log_check "Health" "FAIL" "HTTP $HTTP_CODE"
fi

# =============================================================================
# Check 3: Version Endpoint (Critical for SHA capture)
# =============================================================================
echo ""
echo "--- Check 3: Version Endpoint ---"
VERSION_LOG="$LOG_DIR/version.json"
DEPLOYED_SHA_FILE="$LOG_DIR/deployed_sha.txt"

# Try tRPC version endpoint first
VERSION_URL="$TARGET_URL/api/trpc/system.version?input=%7B%7D"
HTTP_CODE=$(curl -sS -o "$VERSION_LOG" -w "%{http_code}" \
  --max-time 30 \
  --connect-timeout 10 \
  "$VERSION_URL" 2>&1) || HTTP_CODE="000"

if [[ ! "$HTTP_CODE" =~ ^2[0-9][0-9]$ ]]; then
  # Fallback to /api/version
  VERSION_URL="$TARGET_URL/api/version"
  HTTP_CODE=$(curl -sS -o "$VERSION_LOG" -w "%{http_code}" \
    --max-time 30 \
    --connect-timeout 10 \
    "$VERSION_URL" 2>&1) || HTTP_CODE="000"
fi

if [[ "$HTTP_CODE" =~ ^2[0-9][0-9]$ ]]; then
  VERSION_STATUS="PASS"
  log_check "Version" "PASS" "HTTP $HTTP_CODE"
  
  # Extract gitSha from response
  # Handle both tRPC format {"result":{"data":{"gitSha":"..."}}} and direct {"gitSha":"..."}
  if command -v jq &> /dev/null; then
    DEPLOYED_SHA=$(jq -r '.result.data.json.gitSha // .result.data.gitSha // .gitSha // empty' "$VERSION_LOG" 2>/dev/null || echo "")
  else
    # Fallback: grep for gitSha
    DEPLOYED_SHA=$(grep -oP '"gitSha"\s*:\s*"\K[^"]+' "$VERSION_LOG" 2>/dev/null | head -1 || echo "")
  fi
  
  if [[ -n "$DEPLOYED_SHA" ]]; then
    echo "$DEPLOYED_SHA" > "$DEPLOYED_SHA_FILE"
    log_check "Deployed SHA" "CAPTURED" "$DEPLOYED_SHA"
    
    # Check SHA match if expected SHA provided
    if [[ -n "$EXPECTED_GIT_SHA" ]]; then
      # Compare short SHAs (first 7 chars) or full SHAs
      DEPLOYED_SHORT="${DEPLOYED_SHA:0:7}"
      EXPECTED_SHORT="${EXPECTED_GIT_SHA:0:7}"
      
      if [[ "$DEPLOYED_SHORT" == "$EXPECTED_SHORT" ]]; then
        SHA_MATCH="MATCH"
        log_check "SHA Match" "PASS" "deployed=$DEPLOYED_SHORT expected=$EXPECTED_SHORT"
      else
        SHA_MATCH="MISMATCH"
        log_check "SHA Match" "FAIL" "deployed=$DEPLOYED_SHORT expected=$EXPECTED_SHORT"
      fi
    fi
  else
    log_check "Deployed SHA" "MISSING" "Could not extract gitSha from response"
    echo "MISSING_EVIDENCE: gitSha not found in version response" > "$DEPLOYED_SHA_FILE"
  fi
  
  echo "  Response: $(cat "$VERSION_LOG")"
else
  VERSION_STATUS="FAIL"
  log_check "Version" "FAIL" "HTTP $HTTP_CODE"
  echo "MISSING_EVIDENCE: Version endpoint returned HTTP $HTTP_CODE" > "$DEPLOYED_SHA_FILE"
fi

# =============================================================================
# Determine Overall Status
# =============================================================================
echo ""
echo "--- Summary ---"

FAILED_CHECKS=0
[[ "$HOMEPAGE_STATUS" != "PASS" ]] && ((FAILED_CHECKS++))
[[ "$HEALTH_STATUS" != "PASS" ]] && ((FAILED_CHECKS++))
[[ "$VERSION_STATUS" != "PASS" ]] && ((FAILED_CHECKS++))

if [[ "$FAILED_CHECKS" -eq 0 ]]; then
  if [[ "$SHA_MATCH" == "MISMATCH" ]]; then
    OVERALL_STATUS="SHA_MISMATCH"
  elif [[ -z "$DEPLOYED_SHA" || "$DEPLOYED_SHA" == "MISSING_EVIDENCE"* ]]; then
    OVERALL_STATUS="SHA_MISSING"
  else
    OVERALL_STATUS="PASS"
  fi
else
  OVERALL_STATUS="FAIL"
fi

write_summary

echo "  Homepage:     $HOMEPAGE_STATUS"
echo "  Health:       $HEALTH_STATUS"
echo "  Version:      $VERSION_STATUS"
echo "  Deployed SHA: ${DEPLOYED_SHA:-<not captured>}"
echo "  SHA Match:    $SHA_MATCH"
echo "  Overall:      $OVERALL_STATUS"
echo ""
echo "  Logs written to: $LOG_DIR"

# =============================================================================
# Exit Based on Mode
# =============================================================================
if [[ "$MODE" == "strict" ]]; then
  if [[ "$OVERALL_STATUS" == "FAIL" ]]; then
    echo ""
    echo "ERROR: Smoke checks failed in strict mode"
    exit 1
  fi
  
  if [[ -z "$DEPLOYED_SHA" || "$DEPLOYED_SHA" == "MISSING_EVIDENCE"* ]]; then
    echo ""
    echo "ERROR: Deployed SHA not captured in strict mode"
    exit 1
  fi
  
  if [[ "$SHA_MATCH" == "MISMATCH" ]]; then
    echo ""
    echo "ERROR: SHA mismatch in strict mode"
    exit 1
  fi
fi

if [[ "$OVERALL_STATUS" == "PASS" ]]; then
  echo ""
  echo "✅ Smoke checks passed"
  exit 0
else
  echo ""
  echo "⚠️  Smoke checks completed with issues (mode=$MODE)"
  exit 0
fi
