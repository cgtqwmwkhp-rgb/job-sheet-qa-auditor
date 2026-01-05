#!/usr/bin/env bash
# ==================================================
# SANDBOX STARTUP SCRIPT
# ==================================================
# Purpose: Start the application in sandbox mode with deterministic configuration
# Usage: ./scripts/sandbox-start.sh [port]
# ==================================================

set -euo pipefail

# Configuration
PREFERRED_PORT="${1:-3000}"
LOG_DIR="logs"
LOG_FILE="$LOG_DIR/server.log"
MAX_PORT_ATTEMPTS=10

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# ==================================================
# Functions
# ==================================================

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

find_free_port() {
    local port=$1
    local attempts=0
    
    while [ $attempts -lt $MAX_PORT_ATTEMPTS ]; do
        if ! netstat -tuln 2>/dev/null | grep -q ":$port " && \
           ! ss -tuln 2>/dev/null | grep -q ":$port "; then
            echo $port
            return 0
        fi
        log_warn "Port $port is busy, trying next..."
        port=$((port + 1))
        attempts=$((attempts + 1))
    done
    
    log_error "Could not find free port after $MAX_PORT_ATTEMPTS attempts"
    return 1
}

cleanup() {
    log_info "Cleaning up..."
    if [ -n "${SERVER_PID:-}" ]; then
        kill $SERVER_PID 2>/dev/null || true
    fi
}

# ==================================================
# Main
# ==================================================

echo "=================================================="
echo "  SANDBOX STARTUP"
echo "=================================================="
echo "  Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "=================================================="

# Step 1: Unset secrets (sandbox mode)
log_info "Unsetting external API secrets..."
unset MISTRAL_API_KEY 2>/dev/null || true
unset GEMINI_API_KEY 2>/dev/null || true
unset RUN_LIVE_TESTS 2>/dev/null || true

# Step 2: Find free port
log_info "Finding free port (preferred: $PREFERRED_PORT)..."
ACTUAL_PORT=$(find_free_port $PREFERRED_PORT)
log_info "Using port: $ACTUAL_PORT"

# Step 3: Set environment variables
export NODE_ENV=production
export PORT=$ACTUAL_PORT
export ENABLE_PURGE_EXECUTION=false
export ENABLE_SCHEDULER=false
export GIT_SHA=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
export GIT_SHA_SHORT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")

log_info "Environment:"
echo "  NODE_ENV=$NODE_ENV"
echo "  PORT=$PORT"
echo "  ENABLE_PURGE_EXECUTION=$ENABLE_PURGE_EXECUTION"
echo "  ENABLE_SCHEDULER=$ENABLE_SCHEDULER"
echo "  GIT_SHA=$GIT_SHA"

# Step 4: Create logs directory
mkdir -p "$LOG_DIR"

# Step 5: Check if build exists
if [ ! -f "dist/index.js" ]; then
    log_warn "Build not found. Running pnpm build..."
    pnpm build
fi

# Step 6: Start server
log_info "Starting server..."
log_info "Logs: $LOG_FILE"

node dist/index.js > "$LOG_FILE" 2>&1 &
SERVER_PID=$!

# Step 7: Wait for server to be ready
log_info "Waiting for server to start..."
WAIT_ATTEMPTS=0
MAX_WAIT=30

while [ $WAIT_ATTEMPTS -lt $MAX_WAIT ]; do
    if curl -sSf "http://127.0.0.1:$ACTUAL_PORT/" > /dev/null 2>&1; then
        break
    fi
    sleep 1
    WAIT_ATTEMPTS=$((WAIT_ATTEMPTS + 1))
done

if [ $WAIT_ATTEMPTS -eq $MAX_WAIT ]; then
    log_error "Server failed to start within ${MAX_WAIT}s"
    log_error "Last 20 lines of log:"
    tail -20 "$LOG_FILE"
    exit 1
fi

# Step 8: Verify endpoints and get deployed SHA
log_info "Verifying endpoints..."

VERSION_RESPONSE=$(curl -sS "http://127.0.0.1:$ACTUAL_PORT/api/trpc/system.version" 2>/dev/null || echo "FAILED")
DEPLOYED_SHA=$(echo "$VERSION_RESPONSE" | grep -o '"gitSha":"[^"]*"' | cut -d'"' -f4 || echo "unknown")
DEPLOYED_SHA_SHORT="${DEPLOYED_SHA:0:7}"

# Step 9: Determine ADR-003 mode
# In sandbox mode, we use HEALTH_ONLY since /metrics is not a Prometheus exporter
ADR003_MODE="HEALTH_ONLY"

echo ""
echo "=================================================="
echo -e "  ${GREEN}SANDBOX READY${NC}"
echo "=================================================="
echo ""
echo -e "  ${CYAN}URL:${NC}          http://127.0.0.1:$ACTUAL_PORT"
echo -e "  ${CYAN}Deployed SHA:${NC} $DEPLOYED_SHA"
echo -e "  ${CYAN}Mode:${NC}         SANDBOX / $ADR003_MODE"
echo -e "  ${CYAN}Server PID:${NC}   $SERVER_PID"
echo -e "  ${CYAN}Logs:${NC}         $LOG_FILE"
echo ""
echo "=================================================="
echo "  CANONICAL INFO (for evidence packs)"
echo "=================================================="
echo "  GIT_SHA=$DEPLOYED_SHA"
echo "  GIT_SHA_SHORT=$DEPLOYED_SHA_SHORT"
echo "  ENVIRONMENT=sandbox"
echo "  ADR003_MODE=$ADR003_MODE"
echo "  LOGS_DIR=$LOG_DIR"
echo "=================================================="
echo ""
echo "Commands:"
echo "  Stop server:     kill $SERVER_PID"
echo "  View logs:       tail -f $LOG_FILE"
echo "  Load fixture:    pnpm exec tsx scripts/load-fixture.ts <fixture.json>"
echo "  Run UI smoke:    pnpm exec playwright test e2e/sandbox-smoke.spec.ts"
echo ""
