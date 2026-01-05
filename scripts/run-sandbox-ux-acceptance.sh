#!/usr/bin/env bash
# ==================================================
# SANDBOX UX ACCEPTANCE RUNNER
# ==================================================
# Purpose: Run a governed UX acceptance test cycle
# Usage: ./scripts/run-sandbox-ux-acceptance.sh [options]
#
# Options:
#   --start-server    Start sandbox server if not running
#   --playwright      Run Playwright smoke tests (requires PLAYWRIGHT=true or this flag)
#   --skip-fixtures   Skip fixture loading
#   --port PORT       Specify sandbox port (default: 3000)
#   --help            Show this help message
#
# Environment Variables:
#   PLAYWRIGHT=true   Enable Playwright smoke tests
#   SANDBOX_URL       Override sandbox URL
#   SANDBOX_PORT      Override sandbox port
# ==================================================

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_DIR="$PROJECT_ROOT/logs"
ACCEPTANCE_LOG="$LOG_DIR/ux-acceptance.log"
FIXTURE_DIR="$PROJECT_ROOT/docs/testing/sandbox-fixtures"

# Default options
START_SERVER=false
RUN_PLAYWRIGHT="${PLAYWRIGHT:-false}"
SKIP_FIXTURES=false
SANDBOX_PORT="${SANDBOX_PORT:-3000}"
SANDBOX_URL="${SANDBOX_URL:-}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Counters
PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0

# ==================================================
# Functions
# ==================================================

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
    echo "[INFO] $(date -u +%Y-%m-%dT%H:%M:%SZ) $1" >> "$ACCEPTANCE_LOG"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
    echo "[WARN] $(date -u +%Y-%m-%dT%H:%M:%SZ) $1" >> "$ACCEPTANCE_LOG"
    ((WARN_COUNT++)) || true
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
    echo "[ERROR] $(date -u +%Y-%m-%dT%H:%M:%SZ) $1" >> "$ACCEPTANCE_LOG"
}

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    echo "[PASS] $(date -u +%Y-%m-%dT%H:%M:%SZ) $1" >> "$ACCEPTANCE_LOG"
    ((PASS_COUNT++)) || true
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    echo "[FAIL] $(date -u +%Y-%m-%dT%H:%M:%SZ) $1" >> "$ACCEPTANCE_LOG"
    ((FAIL_COUNT++)) || true
}

show_help() {
    head -25 "$0" | tail -20
    exit 0
}

check_sandbox_running() {
    local url="${1:-http://127.0.0.1:$SANDBOX_PORT}"
    if curl -sSf "$url/" > /dev/null 2>&1; then
        return 0
    fi
    return 1
}

get_sandbox_info() {
    local url="$1"
    local version_response
    version_response=$(curl -sS "$url/api/trpc/system.version" 2>/dev/null || echo "{}")
    
    GIT_SHA=$(echo "$version_response" | grep -o '"gitSha":"[^"]*"' | cut -d'"' -f4 || echo "unknown")
    GIT_SHA_SHORT="${GIT_SHA:0:7}"
    NODE_ENV=$(echo "$version_response" | grep -o '"environment":"[^"]*"' | cut -d'"' -f4 || echo "unknown")
}

load_fixture() {
    local fixture_path="$1"
    local fixture_name=$(basename "$fixture_path")
    
    log_info "Loading fixture: $fixture_name"
    
    if [ ! -f "$fixture_path" ]; then
        log_fail "Fixture not found: $fixture_path"
        return 1
    fi
    
    # Run the fixture loader
    if NODE_ENV=development pnpm exec tsx "$PROJECT_ROOT/scripts/load-fixture.ts" "$fixture_path" --verbose >> "$ACCEPTANCE_LOG" 2>&1; then
        log_pass "Fixture loaded: $fixture_name"
        return 0
    else
        log_fail "Failed to load fixture: $fixture_name"
        return 1
    fi
}

run_playwright_smoke() {
    log_info "Running Playwright smoke tests..."
    
    if pnpm exec playwright test "$PROJECT_ROOT/e2e/sandbox-smoke.spec.ts" --reporter=list >> "$ACCEPTANCE_LOG" 2>&1; then
        log_pass "Playwright smoke tests passed"
        return 0
    else
        log_fail "Playwright smoke tests failed"
        return 1
    fi
}

# ==================================================
# Parse Arguments
# ==================================================

while [[ $# -gt 0 ]]; do
    case $1 in
        --start-server)
            START_SERVER=true
            shift
            ;;
        --playwright)
            RUN_PLAYWRIGHT=true
            shift
            ;;
        --skip-fixtures)
            SKIP_FIXTURES=true
            shift
            ;;
        --port)
            SANDBOX_PORT="$2"
            shift 2
            ;;
        --help|-h)
            show_help
            ;;
        *)
            log_error "Unknown option: $1"
            show_help
            ;;
    esac
done

# ==================================================
# Main
# ==================================================

cd "$PROJECT_ROOT"
mkdir -p "$LOG_DIR"

echo "=================================================="
echo -e "  ${BOLD}SANDBOX UX ACCEPTANCE RUNNER${NC}"
echo "=================================================="
echo "  Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "  Project:   $PROJECT_ROOT"
echo "=================================================="

# Initialize log
echo "=== UX Acceptance Log ===" > "$ACCEPTANCE_LOG"
echo "Started: $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$ACCEPTANCE_LOG"

# Step 1: Check or start sandbox
echo ""
log_info "Step 1: Checking sandbox status..."

if [ -n "$SANDBOX_URL" ]; then
    # Use provided URL
    if check_sandbox_running "$SANDBOX_URL"; then
        log_pass "Sandbox is running at $SANDBOX_URL"
    else
        log_fail "Sandbox not responding at $SANDBOX_URL"
        exit 1
    fi
elif check_sandbox_running "http://127.0.0.1:$SANDBOX_PORT"; then
    SANDBOX_URL="http://127.0.0.1:$SANDBOX_PORT"
    log_pass "Sandbox is running at $SANDBOX_URL"
elif [ "$START_SERVER" = true ]; then
    log_info "Starting sandbox server..."
    "$SCRIPT_DIR/sandbox-start.sh" "$SANDBOX_PORT"
    SANDBOX_URL="http://127.0.0.1:$SANDBOX_PORT"
    
    if check_sandbox_running "$SANDBOX_URL"; then
        log_pass "Sandbox started at $SANDBOX_URL"
    else
        log_fail "Failed to start sandbox"
        exit 1
    fi
else
    log_error "Sandbox is not running."
    log_error "Either:"
    log_error "  1. Start it manually: ./scripts/sandbox-start.sh"
    log_error "  2. Use --start-server flag"
    log_error "  3. Set SANDBOX_URL environment variable"
    exit 1
fi

# Get sandbox info
get_sandbox_info "$SANDBOX_URL"

echo ""
echo "=================================================="
echo "  SANDBOX IDENTITY"
echo "=================================================="
echo "  URL:        $SANDBOX_URL"
echo "  Git SHA:    $GIT_SHA"
echo "  NODE_ENV:   $NODE_ENV"
echo "=================================================="

# Step 2: Load fixtures
echo ""
log_info "Step 2: Loading fixtures..."

if [ "$SKIP_FIXTURES" = true ]; then
    log_warn "Skipping fixture loading (--skip-fixtures)"
else
    # Load all three fixtures
    load_fixture "$FIXTURE_DIR/fixture_pass.json" || true
    load_fixture "$FIXTURE_DIR/fixture_fail_missing_field.json" || true
    load_fixture "$FIXTURE_DIR/fixture_fail_invalid_date.json" || true
fi

# Step 3: Print verification URLs
echo ""
echo "=================================================="
echo "  MANUAL VERIFICATION URLS"
echo "=================================================="
echo ""
echo "  Dashboard:        $SANDBOX_URL/"
echo "  Version API:      $SANDBOX_URL/api/trpc/system.version"
echo "  Health API:       $SANDBOX_URL/api/trpc/system.health"
echo ""
echo "  Expected UI Checks:"
echo "    1. Dashboard loads without errors"
echo "    2. fixture_pass.json shows 0 issues"
echo "    3. fixture_fail_missing_field.json shows 1 issue (MISSING_FIELD)"
echo "    4. fixture_fail_invalid_date.json shows 1 issue (INVALID_FORMAT)"
echo "    5. Export produces valid JSON with no PII"
echo "    6. Version endpoint shows correct SHA: $GIT_SHA_SHORT"
echo ""
echo "=================================================="

# Step 4: Run Playwright (optional)
echo ""
log_info "Step 4: Playwright smoke tests..."

if [ "$RUN_PLAYWRIGHT" = true ]; then
    run_playwright_smoke || true
else
    log_warn "Playwright smoke tests skipped (use --playwright or PLAYWRIGHT=true)"
fi

# Step 5: Summary
echo ""
echo "=================================================="
echo -e "  ${BOLD}ACCEPTANCE SUMMARY${NC}"
echo "=================================================="
echo ""
echo "  Passed:   $PASS_COUNT"
echo "  Failed:   $FAIL_COUNT"
echo "  Warnings: $WARN_COUNT"
echo ""
echo "  Log file: $ACCEPTANCE_LOG"
echo ""

if [ $FAIL_COUNT -gt 0 ]; then
    echo -e "  ${RED}${BOLD}OVERALL: FAIL${NC}"
    echo ""
    echo "=================================================="
    exit 1
else
    echo -e "  ${GREEN}${BOLD}OVERALL: PASS${NC}"
    echo ""
    echo "=================================================="
    exit 0
fi
