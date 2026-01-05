# Sandbox UX Acceptance Pack

> **Template Version:** 1.0.0  
> **Last Updated:** 2026-01-05  
> **Governance:** This template is validated by `scripts/validate-sandbox-ux-pack.sh`

---

## Document Metadata

| Field | Value |
|-------|-------|
| **Acceptance Date** | `YYYY-MM-DD` |
| **Git SHA** | `[GIT_SHA]` |
| **Sandbox URL** | `[SANDBOX_URL]` |
| **NODE_ENV** | `[NODE_ENV]` |
| **Prepared By** | `[YOUR_NAME]` |
| **Reviewed By** | `[REVIEWER_NAME]` |

---

## 1. Governance & Rules

> **No Simulated Evidence:** All evidence in this pack must be from a real run of the acceptance script. Do not manually edit outputs. Placeholders must be replaced with real data or marked `N/A`.

---

## 2. Identity & Environment

| Field | Value |
|-------|-------|
| **Git SHA** | `[GIT_SHA]` |
| **Git SHA (short)** | `[GIT_SHA_SHORT]` |
| **Sandbox URL** | `[SANDBOX_URL]` |
| **NODE_ENV** | `[NODE_ENV]` |
| **HEALTH_ONLY** | `[HEALTH_ONLY_STATUS]` |
| **Log File** | `[LOG_FILE_PATH]` |

---

## 3. Fixtures Loaded

| Fixture File | Purpose | Status |
|--------------|---------|--------|
| `docs/testing/sandbox-fixtures/fixture_pass.json` | Verify passing case (0 issues) | `[LOADED/SKIPPED]` |
| `docs/testing/sandbox-fixtures/fixture_fail_missing_field.json` | Verify failing case (1 issue) | `[LOADED/SKIPPED]` |
| `docs/testing/sandbox-fixtures/fixture_fail_invalid_date.json` | Verify failing case (1 issue) | `[LOADED/SKIPPED]` |

---

## 4. Manual Checks Checklist

> **Instructions:** For each item, perform the check in the UI and mark as ✅ (Pass) or ❌ (Fail). Add notes for any failures.

| Check | Status | Notes |
|-------|--------|-------|
| **Dashboard:** Loads without errors | `[✅/❌]` | `[NOTES]` |
| **Passing Case:** `fixture_pass.json` shows 0 issues | `[✅/❌]` | `[NOTES]` |
| **Failing Case 1:** `fixture_fail_missing_field.json` shows 1 issue | `[✅/❌]` | `[NOTES]` |
| **Failing Case 2:** `fixture_fail_invalid_date.json` shows 1 issue | `[✅/❌]` | `[NOTES]` |
| **Reason Code:** Failing case 1 shows `MISSING_FIELD` | `[✅/❌]` | `[NOTES]` |
| **Reason Code:** Failing case 2 shows `INVALID_FORMAT` | `[✅/❌]` | `[NOTES]` |
| **Export:** Produces valid JSON with no PII | `[✅/❌]` | `[NOTES]` |
| **Version Endpoint:** Shows correct Git SHA | `[✅/❌]` | `[NOTES]` |

---

## 5. Optional Playwright Smoke Test

| Field | Value |
|-------|-------|
| **Run Status** | `[RUN/SKIPPED]` |
| **Result** | `[PASS/FAIL]` |
| **Log Output** | `[PASTE_LOG_EXCERPT_HERE]` |

---

## 6. Screenshot Index

> **Instructions:** List all screenshot files captured during manual verification. Filenames should be descriptive.

| Filename | Description |
|----------|-------------|
| `[FILENAME_1.png]` | `[DESCRIPTION_1]` |
| `[FILENAME_2.png]` | `[DESCRIPTION_2]` |
| `[FILENAME_3.png]` | `[DESCRIPTION_3]` |

---

## 7. Findings and Follow-up Actions

> **Instructions:** Document any unexpected behavior, bugs, or required follow-up actions. If none, mark as `N/A`.

| Finding ID | Description | Severity | Follow-up Action | Ticket |
|------------|-------------|----------|------------------|--------|
| `[FINDING-01]` | `[DESCRIPTION]` | `[S0-S3]` | `[ACTION]` | `[TICKET_ID]` |
| `N/A` | `N/A` | `N/A` | `N/A` | `N/A` |

---

## 8. Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Acceptance Engineer | `[YOUR_NAME]` | `[YYYY-MM-DD]` | ✅ Approved |

---

**Template Validation:**

This document should be validated using:
```bash
./scripts/validate-sandbox-ux-pack.sh <path-to-this-file>
```
