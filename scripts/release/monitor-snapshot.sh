#!/bin/bash
# =============================================================================
# MONITORING SNAPSHOT SCRIPT - Contract Aligned
# =============================================================================
# Usage: ./monitor-snapshot.sh <base_url> [mode]
#
# Arguments:
#   base_url - Required. Target URL (e.g., https://staging.example.com)
#   mode     - Optional. soft (default) or strict
#
# Output Files (always written to logs/release/monitoring/):
#   - metrics.txt OR missing_evidence.txt - Metrics data or missing marker
#   - health_sample.json                  - Health endpoint sample
#   - summary.json                        - Structured summary
#
# Exit Codes:
#   0 - Metrics captured (or soft mode with health-only)
#   1 - Critical failure (strict mode with missing metrics)
# =============================================================================

set -euo pipefail

# =============================================================================
# Arguments
# =============================================================================
BASE_URL="${1:-}"
MODE="${2:-soft}"

if [[ -z "$BASE_URL" ]]; then
  echo "ERROR: base_url is required"
  echo "Usage: $0 <base_url> [mode]"
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
LOG_DIR="$REPO_ROOT/logs/release/monitoring"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

mkdir -p "$LOG_DIR"

# Initialize tracking variables
METRICS_STATUS="UNKNOWN"
METRICS_HTTP_CODE="000"
HEALTH_STATUS="UNKNOWN"
HEALTH_HTTP_CODE="000"
EVIDENCE_TYPE="UNKNOWN"
MISSING_EVIDENCE_REASON=""
OVERALL_STATUS="PASS"

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
}

log_captured() {
  echo "[CAPTURED] $1"
}

log_not_available() {
  echo "[NOT_AVAILABLE] $1"
}

# =============================================================================
# Banner
# =============================================================================
echo "=================================================="
echo "  MONITORING SNAPSHOT"
echo "=================================================="
echo "  Base URL:  $BASE_URL"
echo "  Mode:      $MODE"
echo "  Timestamp: $TIMESTAMP"
echo "=================================================="
echo ""

# =============================================================================
# Check 1: Metrics Endpoint
# =============================================================================
echo "--- Check 1: Metrics Endpoint ---"
METRICS_FILE="$LOG_DIR/metrics.txt"
MISSING_EVIDENCE_FILE="$LOG_DIR/missing_evidence.txt"

# Try multiple metrics endpoint patterns
METRICS_ENDPOINTS=(
  "$BASE_URL/metrics"
  "$BASE_URL/api/metrics"
  "$BASE_URL/_metrics"
  "$BASE_URL/api/trpc/system.metrics?input=%7B%7D"
)

METRICS_FOUND=false

for METRICS_URL in "${METRICS_ENDPOINTS[@]}"; do
  echo "  Trying: $METRICS_URL"
  
  METRICS_HTTP_CODE=$(curl -sS -o "$METRICS_FILE" -w "%{http_code}" \
    --max-time 30 \
    --connect-timeout 10 \
    "$METRICS_URL" 2>/dev/null) || METRICS_HTTP_CODE="000"
  
  if [[ "$METRICS_HTTP_CODE" =~ ^2[0-9][0-9]$ ]]; then
    # Check if response looks like Prometheus metrics (contains # HELP or metric names)
    if grep -qE "^# (HELP|TYPE)|^[a-z_]+\{" "$METRICS_FILE" 2>/dev/null; then
      METRICS_FOUND=true
      METRICS_STATUS="CAPTURED"
      log_captured "Metrics - HTTP $METRICS_HTTP_CODE from $METRICS_URL"
      break
    fi
  fi
done

if [[ "$METRICS_FOUND" == "false" ]]; then
  METRICS_STATUS="NOT_AVAILABLE"
  MISSING_EVIDENCE_REASON="No Prometheus-format metrics endpoint found. Tried: ${METRICS_ENDPOINTS[*]}"
  
  # Write missing_evidence.txt instead of metrics.txt
  rm -f "$METRICS_FILE"
  cat > "$MISSING_EVIDENCE_FILE" << EOF
MISSING_EVIDENCE: Metrics endpoint not available

Reason: $MISSING_EVIDENCE_REASON

To capture metrics manually:
1. Check if your application exposes a /metrics endpoint
2. If using a metrics aggregator (Prometheus, Datadog), capture from there
3. Document the metrics source in your evidence pack

Timestamp: $TIMESTAMP
EOF

  log_not_available "Metrics - No metrics endpoint found"
fi

# =============================================================================
# Check 2: Health Sample
# =============================================================================
echo ""
echo "--- Check 2: Health Sample ---"
HEALTH_FILE="$LOG_DIR/health_sample.json"

# Try tRPC health endpoint first
HEALTH_URL="$BASE_URL/api/trpc/system.health?input=%7B%7D"
HEALTH_HTTP_CODE=$(curl -sS -o "$HEALTH_FILE" -w "%{http_code}" \
  --max-time 30 \
  --connect-timeout 10 \
  "$HEALTH_URL" 2>/dev/null) || HEALTH_HTTP_CODE="000"

if [[ ! "$HEALTH_HTTP_CODE" =~ ^2[0-9][0-9]$ ]]; then
  # Fallback to /api/health
  HEALTH_URL="$BASE_URL/api/health"
  HEALTH_HTTP_CODE=$(curl -sS -o "$HEALTH_FILE" -w "%{http_code}" \
    --max-time 30 \
    --connect-timeout 10 \
    "$HEALTH_URL" 2>/dev/null) || HEALTH_HTTP_CODE="000"
fi

if [[ "$HEALTH_HTTP_CODE" =~ ^2[0-9][0-9]$ ]]; then
  HEALTH_STATUS="CAPTURED"
  log_captured "Health Sample - HTTP $HEALTH_HTTP_CODE"
else
  HEALTH_STATUS="FAIL"
  log_fail "Health Sample - HTTP $HEALTH_HTTP_CODE"
  OVERALL_STATUS="FAIL"
fi

# =============================================================================
# Determine Evidence Type and Overall Status
# =============================================================================
if [[ "$METRICS_STATUS" == "CAPTURED" ]]; then
  EVIDENCE_TYPE="METRICS"
elif [[ "$HEALTH_STATUS" == "CAPTURED" ]]; then
  EVIDENCE_TYPE="HEALTH_ONLY"
  
  if [[ "$MODE" == "strict" ]]; then
    OVERALL_STATUS="FAIL"
  fi
else
  EVIDENCE_TYPE="NONE"
  OVERALL_STATUS="FAIL"
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
  "metricsStatus": "$METRICS_STATUS",
  "metricsHttpCode": $METRICS_HTTP_CODE,
  "healthStatus": "$HEALTH_STATUS",
  "healthHttpCode": $HEALTH_HTTP_CODE,
  "evidenceType": "$EVIDENCE_TYPE",
  "missingEvidenceReason": $(if [[ -n "$MISSING_EVIDENCE_REASON" ]]; then echo "\"$MISSING_EVIDENCE_REASON\""; else echo "null"; fi),
  "overallStatus": "$OVERALL_STATUS"
}
EOF

# =============================================================================
# Summary
# =============================================================================
echo ""
echo "--- Summary ---"
echo "  Metrics:       $METRICS_STATUS"
echo "  Health Sample: $HEALTH_STATUS"
echo "  Evidence Type: $EVIDENCE_TYPE"
echo "  Overall:       $OVERALL_STATUS"
echo "  Logs:          $LOG_DIR"

# =============================================================================
# Exit
# =============================================================================
if [[ "$OVERALL_STATUS" == "FAIL" ]]; then
  echo ""
  if [[ "$MODE" == "strict" && "$EVIDENCE_TYPE" == "HEALTH_ONLY" ]]; then
    echo "❌ Monitoring snapshot failed (strict mode requires metrics)"
  else
    echo "❌ Monitoring snapshot failed"
  fi
  exit 1
elif [[ "$EVIDENCE_TYPE" == "HEALTH_ONLY" ]]; then
  echo ""
  echo "⚠️  Monitoring snapshot captured (health only, no metrics)"
  exit 0
else
  echo ""
  echo "✅ Monitoring snapshot captured (full metrics)"
  exit 0
fi
