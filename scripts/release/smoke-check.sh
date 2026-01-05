#!/bin/bash
# =============================================================================
# Release Smoke Check Script
# =============================================================================
#
# Performs HTTP smoke checks against a target environment.
# Outputs status, response time, and response excerpts.
#
# Usage:
#   ./scripts/release/smoke-check.sh <BASE_URL>
#
# Example:
#   ./scripts/release/smoke-check.sh https://job-sheet-qa.example.com
#   ./scripts/release/smoke-check.sh http://localhost:3000
#
# Output:
#   - Console output with pass/fail status
#   - Detailed logs in logs/release/smoke/
#
# Exit codes:
#   0 - All checks passed
#   1 - One or more checks failed
#
# =============================================================================

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
LOG_DIR="$PROJECT_ROOT/logs/release/smoke"
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

check_endpoint() {
    local name="$1"
    local url="$2"
    local expected_status="${3:-200}"
    local safe_name=$(echo "$name" | tr '/' '_' | tr ' ' '_')
    local log_file="$LOG_DIR/${safe_name}.txt"
    
    echo "============================================================" >> "$log_file"
    echo "Endpoint: $name" >> "$log_file"
    echo "URL: $url" >> "$log_file"
    echo "Timestamp: $TIMESTAMP" >> "$log_file"
    echo "============================================================" >> "$log_file"
    
    # Perform the request and capture timing
    local start_time=$(date +%s%N)
    local response
    local http_code
    
    response=$(curl -sS -w "\n%{http_code}" --max-time "$TIMEOUT" "$url" 2>&1) || {
        local exit_code=$?
        echo "Status: FAIL (curl error: $exit_code)" >> "$log_file"
        echo "Response: $response" >> "$log_file"
        log_error "$name: FAIL (curl error)"
        return 1
    }
    
    local end_time=$(date +%s%N)
    local duration_ms=$(( (end_time - start_time) / 1000000 ))
    
    # Extract HTTP code (last line) and body (everything else)
    http_code=$(echo "$response" | tail -n1)
    local body=$(echo "$response" | sed '$d')
    
    echo "HTTP Code: $http_code" >> "$log_file"
    echo "Response Time: ${duration_ms}ms" >> "$log_file"
    echo "Response Body (first 500 chars):" >> "$log_file"
    echo "$body" | head -c 500 >> "$log_file"
    echo "" >> "$log_file"
    
    # Check status
    if [[ "$http_code" == "$expected_status" ]]; then
        echo "Status: PASS" >> "$log_file"
        log_info "$name: PASS (HTTP $http_code, ${duration_ms}ms)"
        return 0
    else
        echo "Status: FAIL (expected $expected_status, got $http_code)" >> "$log_file"
        log_error "$name: FAIL (expected HTTP $expected_status, got $http_code)"
        return 1
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
    echo "Release Smoke Check"
    echo "============================================================"
    echo "Base URL: $base_url"
    echo "Timestamp: $TIMESTAMP"
    echo "============================================================"
    echo ""
    
    # Create log directory
    mkdir -p "$LOG_DIR"
    
    # Track failures
    local failures=0
    
    # Smoke Check 1: Homepage
    check_endpoint "GET /" "$base_url/" || ((failures++))
    
    # Smoke Check 2: Health endpoint (tRPC requires {"json":{...}} wrapper)
    local health_url="$base_url/api/trpc/system.health?input=%7B%22json%22%3A%7B%22timestamp%22%3A$(date +%s)000%7D%7D"
    check_endpoint "GET /api/trpc/system.health" "$health_url" || ((failures++))
    
    # Smoke Check 3: Version endpoint (tRPC requires {"json":{...}} wrapper)
    local version_url="$base_url/api/trpc/system.version?input=%7B%22json%22%3A%7B%7D%7D"
    check_endpoint "GET /api/trpc/system.version" "$version_url" || ((failures++))
    
    echo ""
    echo "============================================================"
    echo "Summary"
    echo "============================================================"
    echo "Log directory: $LOG_DIR"
    
    if [[ $failures -eq 0 ]]; then
        log_info "All smoke checks PASSED"
        echo ""
        echo "✅ SMOKE CHECKS PASSED"
        exit 0
    else
        log_error "$failures smoke check(s) FAILED"
        echo ""
        echo "❌ SMOKE CHECKS FAILED"
        exit 1
    fi
}

main "$@"
