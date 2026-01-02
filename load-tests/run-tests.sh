#!/bin/bash

# Load Test Runner Script
# =======================
# Runs k6 load tests with different scenarios

set -e

# Configuration
BASE_URL="${BASE_URL:-http://localhost:3000}"
OUTPUT_DIR="./load-tests/results"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Create output directory
mkdir -p "$OUTPUT_DIR"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Job Sheet QA Auditor - Load Tests${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Base URL: $BASE_URL"
echo "Output Directory: $OUTPUT_DIR"
echo "Timestamp: $TIMESTAMP"
echo ""

# Function to run a test
run_test() {
    local test_name=$1
    local test_file=$2
    local scenario=${3:-load}
    
    echo -e "${YELLOW}Running: $test_name (scenario: $scenario)${NC}"
    
    k6 run \
        --env BASE_URL="$BASE_URL" \
        --env SCENARIO="$scenario" \
        --out json="$OUTPUT_DIR/${test_name}_${scenario}_${TIMESTAMP}.json" \
        --summary-export="$OUTPUT_DIR/${test_name}_${scenario}_${TIMESTAMP}_summary.json" \
        "$test_file"
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ $test_name completed successfully${NC}"
    else
        echo -e "${RED}✗ $test_name failed${NC}"
    fi
    echo ""
}

# Parse command line arguments
TEST_TYPE="${1:-all}"
SCENARIO="${2:-smoke}"

case $TEST_TYPE in
    "concurrent")
        run_test "concurrent-users" "./load-tests/concurrent-users.js" "$SCENARIO"
        ;;
    "batch")
        run_test "batch-uploads" "./load-tests/batch-uploads.js" "$SCENARIO"
        ;;
    "api")
        run_test "api-stress" "./load-tests/api-stress.js" "$SCENARIO"
        ;;
    "all")
        echo -e "${YELLOW}Running all load tests with scenario: $SCENARIO${NC}"
        echo ""
        run_test "concurrent-users" "./load-tests/concurrent-users.js" "$SCENARIO"
        run_test "batch-uploads" "./load-tests/batch-uploads.js" "$SCENARIO"
        run_test "api-stress" "./load-tests/api-stress.js" "$SCENARIO"
        ;;
    *)
        echo "Usage: $0 [test_type] [scenario]"
        echo ""
        echo "Test types:"
        echo "  concurrent  - Concurrent users test"
        echo "  batch       - Batch uploads test"
        echo "  api         - API stress test"
        echo "  all         - Run all tests (default)"
        echo ""
        echo "Scenarios:"
        echo "  smoke       - Quick verification (default)"
        echo "  load        - Normal load test"
        echo "  stress      - Stress test"
        echo "  spike       - Spike test"
        echo "  soak        - Extended duration test"
        exit 1
        ;;
esac

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Load tests completed!${NC}"
echo -e "${GREEN}Results saved to: $OUTPUT_DIR${NC}"
echo -e "${GREEN}========================================${NC}"
