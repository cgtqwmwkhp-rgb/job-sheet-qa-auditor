#!/bin/bash
# =============================================================================
# Release Monitoring Snapshot Script
# =============================================================================
#
# Captures monitoring metrics and error signals for release verification.
# Works with or without a /metrics endpoint.
#
# Usage:
#   ./scripts/release/monitor-snapshot.sh <BASE_URL>
#
# Example:
#   ./scripts/release/monitor-snapshot.sh https://job-sheet-qa.example.com
#   ./scripts/release/monitor-snapshot.sh http://localhost:3000
#
# Output:
#   - Console output with metrics summary
#   - Detailed logs in logs/release/monitoring/
#
# Exit codes:
#   0 - Snapshot captured (even if metrics endpoint unavailable)
#   1 - Critical error
#
# =============================================================================

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
LOG_DIR="$PROJECT_ROOT/logs/release/monitoring"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
TIMEOUT=10

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# =============================================================================
# Functions
# =============================================================================

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

capture_metrics() {
    local base_url="$1"
    local metrics_file="$LOG_DIR/metrics.txt"
    
    echo "============================================================" > "$metrics_file"
    echo "Metrics Snapshot" >> "$metrics_file"
    echo "Timestamp: $TIMESTAMP" >> "$metrics_file"
    echo "============================================================" >> "$metrics_file"
    
    # Try /metrics endpoint (Prometheus format)
    local metrics_url="$base_url/metrics"
    local response
    local http_code
    
    response=$(curl -sS -w "\n%{http_code}" --max-time "$TIMEOUT" "$metrics_url" 2>&1) || {
        echo "Metrics endpoint not available (curl error)" >> "$metrics_file"
        log_warn "Metrics endpoint not available"
        echo "MISSING_EVIDENCE: /metrics endpoint not available" >> "$metrics_file"
        echo "" >> "$metrics_file"
        echo "To capture monitoring data, use your platform's monitoring dashboard:" >> "$metrics_file"
        echo "- Vercel: https://vercel.com/[org]/[project]/analytics" >> "$metrics_file"
        echo "- Railway: https://railway.app/project/[id]/metrics" >> "$metrics_file"
        echo "- AWS CloudWatch: https://console.aws.amazon.com/cloudwatch/" >> "$metrics_file"
        echo "- Sentry: https://sentry.io/organizations/[org]/issues/" >> "$metrics_file"
        return 0
    }
    
    http_code=$(echo "$response" | tail -n1)
    local body=$(echo "$response" | sed '$d')
    
    if [[ "$http_code" == "200" ]]; then
        log_info "Metrics endpoint available"
        echo "HTTP Code: $http_code" >> "$metrics_file"
        echo "" >> "$metrics_file"
        echo "Raw Metrics:" >> "$metrics_file"
        echo "$body" >> "$metrics_file"
        
        # Extract key metrics if in Prometheus format
        echo "" >> "$metrics_file"
        echo "Key Metrics:" >> "$metrics_file"
        
        # HTTP request counters
        echo "$body" | grep -E "^http_requests_total|^http_request_duration" >> "$metrics_file" 2>/dev/null || true
        
        # Error counters
        echo "$body" | grep -E "^errors_total|^error_count" >> "$metrics_file" 2>/dev/null || true
        
    else
        echo "Metrics endpoint returned HTTP $http_code" >> "$metrics_file"
        log_warn "Metrics endpoint returned HTTP $http_code"
        echo "MISSING_EVIDENCE: Metrics endpoint returned non-200 status" >> "$metrics_file"
    fi
}

capture_health_details() {
    local base_url="$1"
    local health_file="$LOG_DIR/health.txt"
    
    echo "============================================================" > "$health_file"
    echo "Health Check Details" >> "$health_file"
    echo "Timestamp: $TIMESTAMP" >> "$health_file"
    echo "============================================================" >> "$health_file"
    
    # Health endpoint (tRPC requires {"json":{...}} wrapper)
    local health_url="$base_url/api/trpc/system.health?input=%7B%22json%22%3A%7B%22timestamp%22%3A$(date +%s)000%7D%7D"
    local response
    
    response=$(curl -sS --max-time "$TIMEOUT" "$health_url" 2>&1) || {
        echo "Health endpoint not available" >> "$health_file"
        return 0
    }
    
    echo "Response:" >> "$health_file"
    echo "$response" | jq . 2>/dev/null >> "$health_file" || echo "$response" >> "$health_file"
}

capture_version_details() {
    local base_url="$1"
    local version_file="$LOG_DIR/version.txt"
    
    echo "============================================================" > "$version_file"
    echo "Version Details" >> "$version_file"
    echo "Timestamp: $TIMESTAMP" >> "$version_file"
    echo "============================================================" >> "$version_file"
    
    # Version endpoint (tRPC requires {"json":{...}} wrapper)
    local version_url="$base_url/api/trpc/system.version?input=%7B%22json%22%3A%7B%7D%7D"
    local response
    
    response=$(curl -sS --max-time "$TIMEOUT" "$version_url" 2>&1) || {
        echo "Version endpoint not available" >> "$version_file"
        return 0
    }
    
    echo "Response:" >> "$version_file"
    echo "$response" | jq . 2>/dev/null >> "$version_file" || echo "$response" >> "$version_file"
    
    # Extract key fields for summary
    local git_sha=$(echo "$response" | jq -r '.result.data.gitSha // "unknown"' 2>/dev/null || echo "unknown")
    local platform_version=$(echo "$response" | jq -r '.result.data.platformVersion // "unknown"' 2>/dev/null || echo "unknown")
    
    echo "" >> "$version_file"
    echo "Summary:" >> "$version_file"
    echo "  Git SHA: $git_sha" >> "$version_file"
    echo "  Platform Version: $platform_version" >> "$version_file"
}

generate_summary() {
    local summary_file="$LOG_DIR/summary.txt"
    
    echo "============================================================" > "$summary_file"
    echo "Monitoring Snapshot Summary" >> "$summary_file"
    echo "Timestamp: $TIMESTAMP" >> "$summary_file"
    echo "============================================================" >> "$summary_file"
    echo "" >> "$summary_file"
    
    # Check for MISSING_EVIDENCE markers
    local missing_count=0
    if grep -q "MISSING_EVIDENCE" "$LOG_DIR"/*.txt 2>/dev/null; then
        missing_count=$(grep -c "MISSING_EVIDENCE" "$LOG_DIR"/*.txt 2>/dev/null || echo "0")
    fi
    
    echo "Files Generated:" >> "$summary_file"
    ls -la "$LOG_DIR"/*.txt >> "$summary_file" 2>/dev/null || true
    echo "" >> "$summary_file"
    
    if [[ "$missing_count" -gt 0 ]]; then
        echo "⚠️  MISSING_EVIDENCE markers found: $missing_count" >> "$summary_file"
        echo "" >> "$summary_file"
        echo "Some monitoring data could not be captured automatically." >> "$summary_file"
        echo "Please manually capture metrics from your monitoring platform." >> "$summary_file"
    else
        echo "✅ All monitoring data captured successfully" >> "$summary_file"
    fi
}

# =============================================================================
# Main
# =============================================================================

main() {
    if [[ $# -lt 1 ]]; then
        echo "Usage: $0 <BASE_URL>"
        echo "Example: $0 https://job-sheet-qa.example.com"
        exit 1
    fi
    
    local base_url="${1%/}"  # Remove trailing slash if present
    
    echo "============================================================"
    echo "Release Monitoring Snapshot"
    echo "============================================================"
    echo "Base URL: $base_url"
    echo "Timestamp: $TIMESTAMP"
    echo "============================================================"
    echo ""
    
    # Create log directory
    mkdir -p "$LOG_DIR"
    
    # Capture data
    log_info "Capturing metrics..."
    capture_metrics "$base_url"
    
    log_info "Capturing health details..."
    capture_health_details "$base_url"
    
    log_info "Capturing version details..."
    capture_version_details "$base_url"
    
    log_info "Generating summary..."
    generate_summary
    
    echo ""
    echo "============================================================"
    echo "Summary"
    echo "============================================================"
    echo "Log directory: $LOG_DIR"
    cat "$LOG_DIR/summary.txt" | tail -10
    
    echo ""
    echo "✅ MONITORING SNAPSHOT COMPLETE"
    exit 0
}

main "$@"
