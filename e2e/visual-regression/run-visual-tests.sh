#!/bin/bash

# Visual Regression Test Runner Script
# =====================================
# Runs Playwright visual regression tests

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Visual Regression Tests${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Parse command line arguments
ACTION="${1:-test}"
PROJECT="${2:-desktop-chrome}"

case $ACTION in
    "update")
        echo -e "${YELLOW}Updating baseline snapshots...${NC}"
        npx playwright test --config=playwright.visual.config.ts --project="$PROJECT" --update-snapshots
        echo -e "${GREEN}✓ Baseline snapshots updated${NC}"
        ;;
    "test")
        echo -e "${YELLOW}Running visual regression tests...${NC}"
        npx playwright test --config=playwright.visual.config.ts --project="$PROJECT"
        echo -e "${GREEN}✓ Visual regression tests completed${NC}"
        ;;
    "report")
        echo -e "${YELLOW}Opening test report...${NC}"
        npx playwright show-report visual-regression-report
        ;;
    "all")
        echo -e "${YELLOW}Running visual regression tests on all projects...${NC}"
        npx playwright test --config=playwright.visual.config.ts
        echo -e "${GREEN}✓ All visual regression tests completed${NC}"
        ;;
    *)
        echo "Usage: $0 [action] [project]"
        echo ""
        echo "Actions:"
        echo "  test    - Run visual regression tests (default)"
        echo "  update  - Update baseline snapshots"
        echo "  report  - Open HTML test report"
        echo "  all     - Run tests on all browser projects"
        echo ""
        echo "Projects:"
        echo "  desktop-chrome  - Desktop Chrome (default)"
        echo "  desktop-firefox - Desktop Firefox"
        echo "  tablet          - Tablet viewport"
        echo "  mobile          - Mobile viewport"
        exit 1
        ;;
esac

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Done!${NC}"
echo -e "${GREEN}========================================${NC}"
