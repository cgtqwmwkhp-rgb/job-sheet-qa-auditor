#!/usr/bin/env bash
# ==================================================
# SANDBOX STARTUP SCRIPT
# ==================================================
# Purpose: Start the application in sandbox mode with deterministic configuration
# Usage: ./scripts/sandbox-start.sh [port]
# 
# Environment Variables:
#   SANDBOX_PORT    - Override preferred port (default: 3000)
#   SANDBOX_NO_BUILD - Skip build step if set to "true"
# ==================================================

set -euo pipefail

# Configuration
PREFERRED_PORT="${1:-${SANDBOX_PORT:-3000}}"
LOG_DIR="logs"
LOG_FILE="$LOG_DIR/server.log"
STARTUP_LOG="$LOG_DIR/sandbox-startup.log"
MAX_PORT_ATTEMPTS=10
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# ==================================================
# Functions
# ==================================================

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
    echo "[INFO] $(date -u +%Y-%m-%dT%H:%M:%SZ) $1" >> "$STARTUP_LOG" 2>/dev/null || true
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
    echo "[WARN] $(date -u +%Y-%m-%dT%H:%M:%SZ) $1" >> "$STARTUP_LOG" 2>/dev/null || true
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
    echo "[ERROR] $(date -u +%Y-%m-%dT%H:%M:%SZ) $1" >> "$STARTUP_LOG" 2>/dev/null || true
}

find_free_port() {
    local port=$1
    local attempts=0
    local tried_ports=""
    
    while [ $attempts -lt $MAX_PORT_ATTEMPTS ]; do
        # Check if port is in use using multiple methods for reliability
        local port_in_use=false
        
        if command -v ss &> /dev/null; then
            if ss -tuln 2>/dev/null | grep -q ":$port "; then
                port_in_use=true
            fi
        elif command -v netstat &> /dev/null; then
            if netstat -tuln 2>/dev/null | grep -q ":$port "; then
                port_in_use=true
            fi
        else
            # Fallback: try to connect
            if (echo > /dev/tcp/127.0.0.1/$port) 2>/dev/null; then
                port_in_use=true
            fi
        fi
        
        if [ "$port_in_use" = false ]; then
            echo $port
            return 0
        fi
        
        tried_ports="$tried_ports $port"
        log_warn "Port $port is busy, trying next..."
        port=$((port + 1))
        attempts=$((attempts + 1))
    done
    
    log_error "Could not find free port after $MAX_PORT_ATTEMPTS attempts"
    log_error "Tried ports:$tried_ports"
    log_error ""
    log_error "To resolve:"
    log_error "  1. Check what's using the port: lsof -i :$PREFERRED_PORT"
    log_error "  2. Kill the process: kill \$(lsof -t -i :$PREFERRED_PORT)"
    log_error "  3. Or specify a different port: ./scripts/sandbox-start.sh 4000"
    return 1
}

cleanup() {
    log_info "Cleaning up..."
    if [ -n "${SERVER_PID:-}" ]; then
        kill $SERVER_PID 2>/dev/null || true
    fi
}

write_env_file() {
    local env_file="$LOG_DIR/sandbox.env"
    cat > "$env_file" << EOF
# Sandbox Environment - Generated $(date -u +%Y-%m-%dT%H:%M:%SZ)
SANDBOX_URL=http://127.0.0.1:$ACTUAL_PORT
SANDBOX_PID=$SERVER_PID
GIT_SHA=$DEPLOYED_SHA
GIT_SHA_SHORT=$DEPLOYED_SHA_SHORT
NODE_ENV=$NODE_ENV
HEALTH_ONLY=$ADR003_MODE
LOG_FILE=$LOG_FILE
STARTUP_LOG=$STARTUP_LOG
EOF
    log_info "Environment saved to: $env_file"
}

# ==================================================
# Main
# ==================================================

cd "$PROJECT_ROOT"

# Create logs directory early
mkdir -p "$LOG_DIR"

echo "=================================================="
echo -e "  ${BOLD}SANDBOX STARTUP${NC}"
echo "=================================================="
echo "  Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "  Project:   $PROJECT_ROOT"
echo "=================================================="

# Initialize startup log
echo "=== Sandbox Startup Log ===" > "$STARTUP_LOG"
echo "Started: $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$STARTUP_LOG"

# Step 1: Unset secrets (sandbox mode)
log_info "Unsetting external API secrets..."
unset MISTRAL_API_KEY 2>/dev/null || true
unset GEMINI_API_KEY 2>/dev/null || true
unset RUN_LIVE_TESTS 2>/dev/null || true

# Step 2: Find free port
log_info "Finding free port (preferred: $PREFERRED_PORT)..."
ACTUAL_PORT=$(find_free_port $PREFERRED_PORT) || exit 1
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

# Step 4: Check if build exists
if [ ! -f "dist/index.js" ]; then
    if [ "${SANDBOX_NO_BUILD:-false}" = "true" ]; then
        log_error "Build not found and SANDBOX_NO_BUILD=true. Run 'pnpm build' first."
        exit 1
    fi
    log_warn "Build not found. Running pnpm build..."
    pnpm build
fi

# Step 5: Start server
log_info "Starting server..."
log_info "Server log: $LOG_FILE"

node dist/index.js > "$LOG_FILE" 2>&1 &
SERVER_PID=$!

# Step 6: Wait for server to be ready
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

# Step 7: Verify endpoints and get deployed SHA
log_info "Verifying endpoints..."

VERSION_RESPONSE=$(curl -sS "http://127.0.0.1:$ACTUAL_PORT/api/trpc/system.version" 2>/dev/null || echo "FAILED")
DEPLOYED_SHA=$(echo "$VERSION_RESPONSE" | grep -o '"gitSha":"[^"]*"' | cut -d'"' -f4 || echo "unknown")
DEPLOYED_SHA_SHORT="${DEPLOYED_SHA:0:7}"

# Step 8: Determine ADR-003 mode
# In sandbox mode, we use HEALTH_ONLY since /metrics is not a Prometheus exporter
ADR003_MODE="HEALTH_ONLY"

# Step 9: Write environment file for other scripts
write_env_file

echo ""
echo "=================================================="
echo -e "  ${GREEN}${BOLD}SANDBOX READY${NC}"
echo "=================================================="
echo ""
echo -e "  ${CYAN}URL:${NC}            http://127.0.0.1:$ACTUAL_PORT"
echo -e "  ${CYAN}Git SHA:${NC}        $DEPLOYED_SHA"
echo -e "  ${CYAN}Git SHA (short):${NC} $DEPLOYED_SHA_SHORT"
echo -e "  ${CYAN}NODE_ENV:${NC}       $NODE_ENV"
echo -e "  ${CYAN}HEALTH_ONLY:${NC}    $ADR003_MODE"
echo -e "  ${CYAN}Server PID:${NC}     $SERVER_PID"
echo ""
echo "=================================================="
echo "  LOG FILES"
echo "=================================================="
echo "  Server log:     $LOG_FILE"
echo "  Startup log:    $STARTUP_LOG"
echo "  Environment:    $LOG_DIR/sandbox.env"
echo "=================================================="
echo ""
echo "=================================================="
echo "  CANONICAL INFO (for evidence packs)"
echo "=================================================="
echo "  SANDBOX_URL=http://127.0.0.1:$ACTUAL_PORT"
echo "  GIT_SHA=$DEPLOYED_SHA"
echo "  GIT_SHA_SHORT=$DEPLOYED_SHA_SHORT"
echo "  NODE_ENV=$NODE_ENV"
echo "  HEALTH_ONLY=$ADR003_MODE"
echo "=================================================="
echo ""
echo "Commands:"
echo "  Stop server:        kill $SERVER_PID"
echo "  View logs:          tail -f $LOG_FILE"
echo "  Load fixture:       pnpm exec tsx scripts/load-fixture.ts <fixture.json>"
echo "  Run UI smoke:       pnpm exec playwright test e2e/sandbox-smoke.spec.ts"
echo "  Run UX acceptance:  ./scripts/run-sandbox-ux-acceptance.sh"
echo ""
