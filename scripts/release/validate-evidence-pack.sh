#!/bin/bash
# =============================================================================
# EVIDENCE PACK VALIDATION SCRIPT
# =============================================================================
# Usage: ./validate-evidence-pack.sh <evidence-pack-file>
#
# Validates that a release closeout evidence pack contains all required sections
# and has populated values (not just template placeholders).
#
# Exit Codes:
#   0 - Validation passed
#   1 - Validation failed (missing sections or unpopulated fields)
# =============================================================================

set -euo pipefail

# =============================================================================
# Arguments
# =============================================================================
EVIDENCE_FILE="${1:-}"

if [[ -z "$EVIDENCE_FILE" ]]; then
  echo "ERROR: evidence-pack-file is required"
  echo "Usage: $0 <evidence-pack-file>"
  exit 1
fi

if [[ ! -f "$EVIDENCE_FILE" ]]; then
  echo "ERROR: File not found: $EVIDENCE_FILE"
  exit 1
fi

# =============================================================================
# Validation Configuration
# =============================================================================
ERRORS=()
WARNINGS=()

# Required sections (must exist)
REQUIRED_SECTIONS=(
  "## Document Metadata"
  "## 1. Pre-Release Verification"
  "## 2. Deployment Verification"
  "## 5. Sign-Off"
)

# Required metadata fields (must not be template placeholders)
REQUIRED_METADATA=(
  "Release Version"
  "Release Date"
  "Git SHA"
  "Environment"
  "Prepared By"
)

# Template placeholder patterns to detect unpopulated fields
PLACEHOLDER_PATTERNS=(
  "<!-- REQUIRED:"
  "<!-- e.g.,"
  "<!-- GitHub Actions"
  "<!-- Name"
  "<!-- YYYY-MM-DD"
  "<!-- ✅ PASS / ❌ FAIL"
  "<!-- Link to"
)

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
  ERRORS+=("$1")
}

log_warn() {
  echo "[WARN] $1"
  WARNINGS+=("$1")
}

# =============================================================================
# Banner
# =============================================================================
echo "=================================================="
echo "  EVIDENCE PACK VALIDATION"
echo "=================================================="
echo "  File: $EVIDENCE_FILE"
echo "=================================================="
echo ""

# =============================================================================
# Read file content
# =============================================================================
CONTENT=$(cat "$EVIDENCE_FILE")

# =============================================================================
# Check 1: Required Sections
# =============================================================================
echo "--- Check 1: Required Sections ---"

for SECTION in "${REQUIRED_SECTIONS[@]}"; do
  if echo "$CONTENT" | grep -qF "$SECTION"; then
    log_pass "Section found: $SECTION"
  else
    log_fail "Missing section: $SECTION"
  fi
done

# =============================================================================
# Check 2: Metadata Fields Populated
# =============================================================================
echo ""
echo "--- Check 2: Metadata Fields ---"

for FIELD in "${REQUIRED_METADATA[@]}"; do
  # Check if field exists
  if echo "$CONTENT" | grep -qF "**$FIELD**"; then
    # Check if it's still a placeholder
    LINE=$(echo "$CONTENT" | grep -F "**$FIELD**" | head -1)
    
    if echo "$LINE" | grep -qE "<!-- REQUIRED:|<!-- e\.g\.,"; then
      log_fail "Metadata field not populated: $FIELD"
    else
      log_pass "Metadata field populated: $FIELD"
    fi
  else
    log_fail "Metadata field missing: $FIELD"
  fi
done

# =============================================================================
# Check 3: Template Placeholders
# =============================================================================
echo ""
echo "--- Check 3: Template Placeholders ---"

PLACEHOLDER_COUNT=0
for PATTERN in "${PLACEHOLDER_PATTERNS[@]}"; do
  COUNT=$(echo "$CONTENT" | grep -c "$PATTERN" || true)
  if [[ $COUNT -gt 0 ]]; then
    PLACEHOLDER_COUNT=$((PLACEHOLDER_COUNT + COUNT))
  fi
done

if [[ $PLACEHOLDER_COUNT -gt 0 ]]; then
  log_warn "Found $PLACEHOLDER_COUNT unpopulated template placeholders"
  log_info "This may be acceptable for draft evidence packs"
else
  log_pass "No template placeholders found"
fi

# =============================================================================
# Check 4: Sign-Off Section
# =============================================================================
echo ""
echo "--- Check 4: Sign-Off Section ---"

# Check for at least one approval
if echo "$CONTENT" | grep -qE "✅ Approved"; then
  log_pass "At least one approval found"
else
  log_fail "No approvals found in Sign-Off section"
fi

# Check for final status
if echo "$CONTENT" | grep -qE "Release Status.*✅ APPROVED|Release Status.*❌ REJECTED|Release Status.*⚠️ APPROVED_WITH_CONDITIONS"; then
  log_pass "Final release status is set"
else
  log_fail "Final release status not set"
fi

# =============================================================================
# Check 5: SHA Verification
# =============================================================================
echo ""
echo "--- Check 5: SHA Verification ---"

# Check if SHA verification is present
if echo "$CONTENT" | grep -qE "SHA Verification.*✅ MATCH|SHA Verification.*❌ MISMATCH"; then
  if echo "$CONTENT" | grep -qE "SHA Verification.*✅ MATCH"; then
    log_pass "SHA verification: MATCH"
  else
    log_fail "SHA verification: MISMATCH"
  fi
else
  log_warn "SHA verification not completed"
fi

# =============================================================================
# Check 6: ADR-003 Compliance
# =============================================================================
echo ""
echo "--- Check 6: ADR-003 Compliance ---"

# Check environment
ENVIRONMENT=$(echo "$CONTENT" | grep -oP '\*\*Environment\*\* \| \K[^|]+' | tr -d ' ' || echo "")

if [[ -n "$ENVIRONMENT" ]]; then
  log_info "Environment: $ENVIRONMENT"
  
  # Check ADR-003 mode
  if echo "$CONTENT" | grep -qE "HEALTH_ONLY=true"; then
    if [[ "$ENVIRONMENT" == "production" || "$ENVIRONMENT" == "staging" ]]; then
      log_fail "ADR-003 VIOLATION: HEALTH_ONLY=true not allowed for $ENVIRONMENT"
    else
      log_pass "ADR-003: HEALTH_ONLY=true acceptable for $ENVIRONMENT"
    fi
  elif echo "$CONTENT" | grep -qE "HEALTH_ONLY=false"; then
    log_pass "ADR-003: HEALTH_ONLY=false (metrics required)"
  else
    log_warn "ADR-003 mode not specified"
  fi
else
  log_warn "Environment not specified"
fi

# =============================================================================
# Summary
# =============================================================================
echo ""
echo "=================================================="
echo "  VALIDATION SUMMARY"
echo "=================================================="

if [[ ${#ERRORS[@]} -gt 0 ]]; then
  echo ""
  echo "❌ ERRORS (${#ERRORS[@]}):"
  for ERROR in "${ERRORS[@]}"; do
    echo "   - $ERROR"
  done
fi

if [[ ${#WARNINGS[@]} -gt 0 ]]; then
  echo ""
  echo "⚠️  WARNINGS (${#WARNINGS[@]}):"
  for WARNING in "${WARNINGS[@]}"; do
    echo "   - $WARNING"
  done
fi

echo ""
if [[ ${#ERRORS[@]} -eq 0 ]]; then
  echo "✅ VALIDATION PASSED"
  if [[ ${#WARNINGS[@]} -gt 0 ]]; then
    echo "   (with ${#WARNINGS[@]} warnings)"
  fi
  exit 0
else
  echo "❌ VALIDATION FAILED (${#ERRORS[@]} errors)"
  exit 1
fi
