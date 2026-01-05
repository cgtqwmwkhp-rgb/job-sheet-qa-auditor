#!/usr/bin/env bash
# ==================================================
# SANDBOX UX ACCEPTANCE PACK VALIDATOR
# ==================================================
# Purpose: Validate a completed UX acceptance pack
# Usage: ./scripts/validate-sandbox-ux-pack.sh <path-to-pack.md>
#
# Validation Rules:
#   1. No placeholders remain (e.g., [GIT_SHA], [YOUR_NAME])
#   2. Required sections present
#   3. At least one screenshot listed
#   4. No non-canonical reason codes
#   5. Sign-off section completed
# ==================================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Counters
ERRORS=0
WARNINGS=0

# ==================================================
# Functions
# ==================================================

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((ERRORS++)) || true
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
    ((WARNINGS++)) || true
}

check_placeholder() {
    local file="$1"
    local placeholder="$2"
    local description="$3"
    
    if grep -q "$placeholder" "$file"; then
        log_fail "Placeholder found: $placeholder ($description)"
        return 1
    fi
    return 0
}

check_section() {
    local file="$1"
    local section="$2"
    
    if grep -q "^## $section" "$file"; then
        log_pass "Section present: $section"
        return 0
    else
        log_fail "Missing section: $section"
        return 1
    fi
}

check_non_canonical_reason_codes() {
    local file="$1"
    
    # List of non-canonical codes that should not appear
    local non_canonical=("MISSING" "INVALID" "OUT_OF_RANGE" "ERROR" "UNKNOWN")
    
    for code in "${non_canonical[@]}"; do
        # Check for the code as a standalone word (not part of MISSING_FIELD, etc.)
        if grep -E "\`$code\`" "$file" | grep -vE "(MISSING_FIELD|INVALID_FORMAT|OUT_OF_POLICY)" > /dev/null 2>&1; then
            log_fail "Non-canonical reason code found: $code"
        fi
    done
}

# ==================================================
# Main
# ==================================================

if [ $# -lt 1 ]; then
    echo "Usage: $0 <path-to-acceptance-pack.md>"
    exit 1
fi

PACK_FILE="$1"

if [ ! -f "$PACK_FILE" ]; then
    echo -e "${RED}ERROR: File not found: $PACK_FILE${NC}"
    exit 1
fi

echo "=================================================="
echo "  SANDBOX UX ACCEPTANCE PACK VALIDATOR"
echo "=================================================="
echo "  File: $PACK_FILE"
echo "  Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "=================================================="
echo ""

# Check 1: Required sections
echo "--- Checking required sections ---"
check_section "$PACK_FILE" "1. Governance & Rules" || true
check_section "$PACK_FILE" "2. Identity & Environment" || true
check_section "$PACK_FILE" "3. Fixtures Loaded" || true
check_section "$PACK_FILE" "4. Manual Checks Checklist" || true
check_section "$PACK_FILE" "5. Optional Playwright Smoke Test" || true
check_section "$PACK_FILE" "6. Screenshot Index" || true
check_section "$PACK_FILE" "7. Findings and Follow-up Actions" || true
check_section "$PACK_FILE" "8. Sign-Off" || true
echo ""

# Check 2: Placeholders
echo "--- Checking for placeholders ---"
PLACEHOLDERS=(
    "\[GIT_SHA\]"
    "\[GIT_SHA_SHORT\]"
    "\[SANDBOX_URL\]"
    "\[NODE_ENV\]"
    "\[YOUR_NAME\]"
    "\[REVIEWER_NAME\]"
    "\[HEALTH_ONLY_STATUS\]"
    "\[LOG_FILE_PATH\]"
    "\[LOADED/SKIPPED\]"
    "\[✅/❌\]"
    "\[NOTES\]"
    "\[RUN/SKIPPED\]"
    "\[PASS/FAIL\]"
    "\[PASTE_LOG_EXCERPT_HERE\]"
    "\[FILENAME_1.png\]"
    "\[DESCRIPTION_1\]"
    "\[FINDING-01\]"
    "YYYY-MM-DD"
)

for placeholder in "${PLACEHOLDERS[@]}"; do
    check_placeholder "$PACK_FILE" "$placeholder" "template placeholder" || true
done
echo ""

# Check 3: Screenshots
echo "--- Checking screenshot index ---"
SCREENSHOT_SECTION=$(sed -n '/^## 6. Screenshot Index/,/^## 7./p' "$PACK_FILE" 2>/dev/null || echo "")

if echo "$SCREENSHOT_SECTION" | grep -qE "\.png|\.jpg|\.jpeg|\.gif"; then
    log_pass "At least one screenshot listed"
else
    # Check if N/A is explicitly stated
    if echo "$SCREENSHOT_SECTION" | grep -q "N/A"; then
        log_warn "No screenshots listed (marked as N/A)"
    else
        log_fail "No screenshots listed in Screenshot Index"
    fi
fi
echo ""

# Check 4: Non-canonical reason codes
echo "--- Checking for non-canonical reason codes ---"
check_non_canonical_reason_codes "$PACK_FILE"
log_pass "No non-canonical reason codes found (or none detected)"
echo ""

# Check 5: Sign-off
echo "--- Checking sign-off ---"
SIGNOFF_SECTION=$(sed -n '/^## 8. Sign-Off/,/^---/p' "$PACK_FILE" 2>/dev/null || echo "")

if echo "$SIGNOFF_SECTION" | grep -q "✅ Approved"; then
    log_pass "Sign-off approval found"
else
    log_fail "No sign-off approval found"
fi
echo ""

# Check 6: No simulated evidence rule
echo "--- Checking governance rules ---"
if grep -q "No Simulated Evidence" "$PACK_FILE"; then
    log_pass "Governance rule present: No Simulated Evidence"
else
    log_fail "Missing governance rule: No Simulated Evidence"
fi
echo ""

# Summary
echo "=================================================="
echo "  VALIDATION SUMMARY"
echo "=================================================="
echo ""
echo "  Errors:   $ERRORS"
echo "  Warnings: $WARNINGS"
echo ""

if [ $ERRORS -gt 0 ]; then
    echo -e "  ${RED}OVERALL: FAIL${NC}"
    echo ""
    echo "  Fix the errors above and re-run validation."
    echo "=================================================="
    exit 1
else
    if [ $WARNINGS -gt 0 ]; then
        echo -e "  ${YELLOW}OVERALL: PASS (with warnings)${NC}"
    else
        echo -e "  ${GREEN}OVERALL: PASS${NC}"
    fi
    echo ""
    echo "=================================================="
    exit 0
fi
