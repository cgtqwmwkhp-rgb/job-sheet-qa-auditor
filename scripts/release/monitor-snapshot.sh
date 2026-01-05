#!/bin/bash
# =============================================================================
# Release Monitoring Snapshot Script
# =============================================================================
# Captures monitoring metrics from a target environment. If metrics are not
# available, writes a MISSING_EVIDENCE marker instead of faking success.
#
# Usage:
#   ./monitor-snapshot.sh <target_url> [mode]
#
# Arguments:
#   target_url - Required. Base URL of the target environment
#   mode       - Optional. "soft" (default) or "strict"
#
# Outputs:
#   logs/release/monitoring/metrics.txt (if available)
#   logs/release/monitoring/missing_evidence.txt (if metrics unavailable)
#   logs/release/monitoring/health_sample.json
#   logs/release/monitoring/summary.json
#
# Exit Codes:
#   0 - Snapshot captured (or missing evidence recorded in soft mode)
#   1 - Failed in strict mode when evidence is missing
# =============================================================================

set -euo pipefail

# =============================================================================
# Configuration
# =============================================================================
TARGET_URL="${1:-}"
MODE="${2:-soft}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
LOG_DIR="$PROJECT_ROOT/logs/release/monitoring"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# =============================================================================
# Validation
# =============================================================================
if [[ -z "$TARGET_URL" ]]; then
  echo "ERROR: target_url is required"
  echo "Usage: $0 <target_url> [mode]"
  exit 1
fi

if [[ "$MODE" != "soft" && "$MODE" != "strict" ]]; then
  echo "ERROR: mode must be 'soft' or 'strict', got '$MODE'"
  exit 1
fi

# Remove trailing slash from URL
TARGET_URL="${TARGET_URL%/}"

echo "=================================================="
echo "  MONITORING SNAPSHOT"
echo "=================================================="
echo "  Target:    $TARGET_URL"
echo "  Mode:      $MODE"
echo "  Timestamp: $TIMESTAMP"
echo "=================================================="

# =============================================================================
# Setup
# =============================================================================
mkdir -p "$LOG_DIR"

# Initialize status tracking
METRICS_STATUS="UNKNOWN"
HEALTH_SAMPLE_STATUS="UNKNOWN"
OVERALL_STATUS="UNKNOWN"
EVIDENCE_TYPE="NONE"

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
  cat > "$LOG_DIR/summary.json" << EOF
{
  "timestamp": "$TIMESTAMP",
  "target_url": "$TARGET_URL",
  "mode": "$MODE",
  "evidence_type": "$EVIDENCE_TYPE",
  "checks": {
    "metrics": "$METRICS_STATUS",
    "health_sample": "$HEALTH_SAMPLE_STATUS"
  },
  "overall_status": "$OVERALL_STATUS"
}
EOF
}

write_missing_evidence() {
  local reason="$1"
  cat > "$LOG_DIR/missing_evidence.txt" << EOF
MISSING_EVIDENCE
================
Timestamp: $TIMESTAMP
Target: $TARGET_URL
Reason: $reason

This file indicates that monitoring metrics could not be captured.
This is NOT a failure - it documents the absence of metrics endpoint.

To resolve:
1. Ensure the target has a /metrics endpoint (Prometheus format)
2. Or configure an alternative metrics source
3. Or accept that metrics are not available for this environment
EOF
  EVIDENCE_TYPE="MISSING_EVIDENCE"
}

# =============================================================================
# Check 1: Metrics Endpoint
# =============================================================================
echo ""
echo "--- Check 1: Metrics Endpoint ---"
METRICS_FILE="$LOG_DIR/metrics.txt"

# Try common metrics endpoints
METRICS_ENDPOINTS=(
  "$TARGET_URL/metrics"
  "$TARGET_URL/api/metrics"
  "$TARGET_URL/_metrics"
)

METRICS_CAPTURED=false
for METRICS_URL in "${METRICS_ENDPOINTS[@]}"; do
  echo "  Trying: $METRICS_URL"
  HTTP_CODE=$(curl -sS -o "$METRICS_FILE" -w "%{http_code}" \
    --max-time 30 \
    --connect-timeout 10 \
    "$METRICS_URL" 2>&1) || HTTP_CODE="000"
  
  if [[ "$HTTP_CODE" =~ ^2[0-9][0-9]$ ]]; then
    # Verify it looks like Prometheus metrics (contains # HELP or # TYPE)
    if grep -qE "^# (HELP|TYPE)" "$METRICS_FILE" 2>/dev/null; then
      METRICS_STATUS="CAPTURED"
      METRICS_CAPTURED=true
      EVIDENCE_TYPE="METRICS"
      log_check "Metrics" "CAPTURED" "from $METRICS_URL"
      echo "  Lines captured: $(wc -l < "$METRICS_FILE")"
      break
    fi
  fi
done

if [[ "$METRICS_CAPTURED" == "false" ]]; then
  METRICS_STATUS="NOT_AVAILABLE"
  rm -f "$METRICS_FILE"
  write_missing_evidence "No Prometheus metrics endpoint found at standard paths (/metrics, /api/metrics, /_metrics)"
  log_check "Metrics" "NOT_AVAILABLE" "No metrics endpoint found"
fi

# =============================================================================
# Check 2: Health Sample (as fallback monitoring data)
# =============================================================================
echo ""
echo "--- Check 2: Health Sample ---"
HEALTH_SAMPLE_FILE="$LOG_DIR/health_sample.json"

# Try tRPC health endpoint first
HEALTH_URL="$TARGET_URL/api/trpc/system.health?input=%7B%7D"
HTTP_CODE=$(curl -sS -o "$HEALTH_SAMPLE_FILE" -w "%{http_code}" \
  --max-time 30 \
  --connect-timeout 10 \
  "$HEALTH_URL" 2>&1) || HTTP_CODE="000"

if [[ ! "$HTTP_CODE" =~ ^2[0-9][0-9]$ ]]; then
  # Fallback to /api/health
  HEALTH_URL="$TARGET_URL/api/health"
  HTTP_CODE=$(curl -sS -o "$HEALTH_SAMPLE_FILE" -w "%{http_code}" \
    --max-time 30 \
    --connect-timeout 10 \
    "$HEALTH_URL" 2>&1) || HTTP_CODE="000"
fi

if [[ "$HTTP_CODE" =~ ^2[0-9][0-9]$ ]]; then
  HEALTH_SAMPLE_STATUS="CAPTURED"
  log_check "Health Sample" "CAPTURED" "HTTP $HTTP_CODE"
  
  # If no metrics, health sample becomes our evidence
  if [[ "$EVIDENCE_TYPE" == "MISSING_EVIDENCE" ]]; then
    EVIDENCE_TYPE="HEALTH_ONLY"
  fi
else
  HEALTH_SAMPLE_STATUS="FAILED"
  rm -f "$HEALTH_SAMPLE_FILE"
  log_check "Health Sample" "FAILED" "HTTP $HTTP_CODE"
fi

# =============================================================================
# Determine Overall Status
# =============================================================================
echo ""
echo "--- Summary ---"

if [[ "$METRICS_STATUS" == "CAPTURED" ]]; then
  OVERALL_STATUS="METRICS_CAPTURED"
elif [[ "$HEALTH_SAMPLE_STATUS" == "CAPTURED" ]]; then
  OVERALL_STATUS="HEALTH_ONLY"
else
  OVERALL_STATUS="NO_EVIDENCE"
fi

write_summary

echo "  Metrics:       $METRICS_STATUS"
echo "  Health Sample: $HEALTH_SAMPLE_STATUS"
echo "  Evidence Type: $EVIDENCE_TYPE"
echo "  Overall:       $OVERALL_STATUS"
echo ""
echo "  Logs written to: $LOG_DIR"

# =============================================================================
# Exit Based on Mode
# =============================================================================
if [[ "$MODE" == "strict" ]]; then
  if [[ "$OVERALL_STATUS" == "NO_EVIDENCE" ]]; then
    echo ""
    echo "ERROR: No monitoring evidence captured in strict mode"
    exit 1
  fi
  
  # In strict mode, we require either metrics or health sample
  if [[ "$EVIDENCE_TYPE" == "MISSING_EVIDENCE" && "$HEALTH_SAMPLE_STATUS" != "CAPTURED" ]]; then
    echo ""
    echo "ERROR: No usable monitoring evidence in strict mode"
    exit 1
  fi
fi

if [[ "$OVERALL_STATUS" == "METRICS_CAPTURED" ]]; then
  echo ""
  echo "✅ Monitoring snapshot captured (metrics)"
  exit 0
elif [[ "$OVERALL_STATUS" == "HEALTH_ONLY" ]]; then
  echo ""
  echo "⚠️  Monitoring snapshot captured (health only, no metrics)"
  exit 0
else
  echo ""
  echo "⚠️  Monitoring snapshot completed with missing evidence (mode=$MODE)"
  exit 0
fi
