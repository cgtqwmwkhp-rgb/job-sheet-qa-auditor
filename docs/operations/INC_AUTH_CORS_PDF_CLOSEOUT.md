# INCIDENT CLOSEOUT: Auth/CORS/PDF Fix

**Date:** 2026-01-12  
**Status:** ✅ RESOLVED  
**Incident ID:** INC-2026-01-12-CORS-PDF  
**Severity:** High  

---

## Executive Summary

Fixed two production blockers:
1. **API Auth Behavior** - Verified already working (returns 401, not redirect)
2. **PDF Viewer CORS** - Implemented same-origin PDF proxy endpoint

---

## Root Cause Statement

**PDF Viewer CORS Issue:**
The `react-pdf` library fetches PDFs directly from browser using the URL provided. When using Azure Blob SAS URLs, these are cross-origin requests. Without proper CORS headers from Azure Blob Storage, the browser blocks the request with "No Access-Control-Allow-Origin header".

**Solution:** Implement a same-origin PDF proxy endpoint (`/api/documents/:id/pdf`) that fetches from Azure Blob server-side and streams to client with proper headers.

---

## Evidence

### Before Fix

**PDF Loading Behavior:**
- UI used direct Azure Blob SAS URLs for DocumentViewer
- Cross-origin fetch blocked by browser CORS policy
- PDF viewer showed "Failed to load document"

### After Fix

**Production SHA:** `0be8b1a0b1ab61f443a908ff8acd3820c1cb539e`

**Health Check:**
```json
{"status":"ok","timestamp":"2026-01-12T23:00:57.417Z"}
```

**PDF Endpoint (unauthenticated - expect 401):**
```bash
curl https://jobsheet-qa-production.../api/documents/1/pdf
HTTP_STATUS: 401
```

**API Auth Behavior (expect 401, not redirect):**
```bash
curl https://jobsheet-qa-production.../api/trpc/system.version
HTTP_STATUS: 401
REDIRECT_URL: (empty - no redirect)
```

---

## Fixes Implemented

### 1. PDF Proxy Endpoint (`server/_core/pdfProxy.ts`)

New endpoint: `GET /api/documents/:jobSheetId/pdf`

Features:
- **Authentication Required** - Checks `X-MS-CLIENT-PRINCIPAL` header
- **Range Request Support** - Returns 206 Partial Content for PDF.js
- **Proper Headers** - `Content-Type: application/pdf`, `Content-Disposition`
- **Download Mode** - `?download=1` query param for attachment
- **Streaming** - Server fetches from Azure Blob and streams to client

```typescript
router.get('/:jobSheetId/pdf', requireAuth, async (req, res) => {
  // ... fetch from storage
  // ... stream with proper headers
});
```

### 2. UI Updates (`client/src/pages/AuditResults.tsx`)

- DocumentViewer now uses `/api/documents/:id/pdf` (same-origin)
- ViewPdfButton opens proxy URL in new tab
- DownloadPdfButton uses proxy with `?download=1`

---

## Tests Added

| File | Tests | Purpose |
|------|-------|---------|
| `pdfProxy.endpoint.test.ts` | 14 | PDF endpoint contract |
| `apiAuth.contract.test.ts` | 12 | API auth behavior |

**Test Results:**
```
Test Files  67 passed (67)
     Tests  1353 passed (1353)
```

---

## Deployment

### Workflow Runs

| Environment | Run ID | Status | URL |
|-------------|--------|--------|-----|
| Staging (auto) | 20937785367 | ✅ Success | [Link](https://github.com/cgtqwmwkhp-rgb/job-sheet-qa-auditor/actions/runs/20937785367) |
| Production | 20937787940 | ✅ Success | [Link](https://github.com/cgtqwmwkhp-rgb/job-sheet-qa-auditor/actions/runs/20937787940) |

### PR

- **PR #100**: [fix: PDF proxy endpoint for CORS-safe document viewing](https://github.com/cgtqwmwkhp-rgb/job-sheet-qa-auditor/pull/100)

---

## Verification Checklist

- [x] Production version matches expected SHA
- [x] Health check returns `{"status":"ok"}`
- [x] PDF endpoint returns 401 without auth (not redirect)
- [x] API endpoints return 401 without auth (not redirect)
- [x] Tests pass (1353/1353)
- [x] Build passes
- [x] CI workflows green

---

## Rollback Steps

If issues occur after deployment:

```bash
# 1. Revert the commit
git revert 0be8b1a0b1ab61f443a908ff8acd3820c1cb539e
git push

# 2. Trigger production deployment
gh workflow run azure-deploy.yml -f environment=production

# 3. Verify rollback
curl -s https://jobsheet-qa-production.happydesert-4448b4c0.uksouth.azurecontainerapps.io/readyz | jq '.version'
```

---

## Files Changed

| File | Change |
|------|--------|
| `server/_core/pdfProxy.ts` | New: PDF streaming endpoint |
| `server/_core/index.ts` | Register pdfProxyRouter |
| `client/src/pages/AuditResults.tsx` | Use proxy URL for PDF |
| `server/tests/contracts/pdfProxy.endpoint.test.ts` | New: 14 tests |
| `server/tests/contracts/apiAuth.contract.test.ts` | New: 12 tests |
| `docs/operations/INC_AUTH_CORS_PDF_EVIDENCE.md` | Evidence document |

---

## Prevention

1. **Same-origin for sensitive resources** - Always proxy authenticated resources through backend
2. **Contract tests** - Added tests to verify PDF endpoint headers and auth behavior
3. **Documentation** - Evidence document explains CORS issue and solution

---

## Sign-off

- **Incident Commander:** Cursor AI
- **Resolution Time:** 30 minutes
- **Status:** CLOSED
