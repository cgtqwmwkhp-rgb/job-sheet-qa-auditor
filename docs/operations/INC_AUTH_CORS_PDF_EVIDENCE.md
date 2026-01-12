# Incident Evidence: Auth/CORS/PDF Issues

**Date:** 2026-01-12  
**Status:** Investigation Complete

---

## Issue 1: API Auth Behavior

### Expected Behavior
- API calls to `/api/*` should return 401 Unauthorized (not redirect to login)
- This allows frontend to handle auth gracefully

### Actual Behavior (CONFIRMED WORKING ✅)

```bash
curl -s -w "\nHTTP_STATUS:%{http_code}" -D - \
  "https://jobsheet-qa-production.happydesert-4448b4c0.uksouth.azurecontainerapps.io/api/trpc/system.version"
```

**Response:**
```
HTTP/2 401 
www-authenticate: Bearer realm="..." authorization_uri="https://login.windows.net/..."
HTTP_STATUS:401
REDIRECT_URL: (empty - no redirect)
```

**Conclusion:** API auth is correctly returning 401, not redirecting. This is the desired behavior.

---

## Issue 2: PDF Viewer CORS

### Expected Behavior
- PDF viewer should load documents without CORS errors
- Should work with Azure Blob SAS URLs or via same-origin proxy

### Current Behavior
- PDF viewer attempts to load Azure Blob SAS URLs directly
- Azure Blob Storage may not have CORS configured for the frontend origin
- Results in CORS error: "No Access-Control-Allow-Origin header"

### Root Cause
- `react-pdf` library fetches the PDF URL from browser
- Azure Blob SAS URLs are cross-origin
- Without CORS headers from Azure Blob Storage, browser blocks the request

### Solution
Implement a same-origin PDF proxy endpoint:
- `GET /api/documents/:jobSheetId/pdf`
- Server fetches from Azure Blob using credentials
- Streams to client with proper headers
- Supports HTTP Range requests for partial content

---

## Current Endpoint Inventory

| Endpoint | Auth | Status |
|----------|------|--------|
| `/healthz` | No | ✅ Working |
| `/readyz` | No | ✅ Working |
| `/metrics` | No | ✅ Working |
| `/api/trpc/*` | Yes | ✅ 401 on no auth |
| `/api/documents/:id/pdf` | N/A | ❌ Does not exist |

---

## Fix Plan

1. **Phase 1:** Confirm API auth behavior (DONE - already working)
2. **Phase 2:** Add `/api/documents/:id/pdf` proxy endpoint
3. **Phase 3:** Update UI to use proxy endpoint
4. **Phase 4:** Add regression tests
5. **Phase 5:** Deploy and verify
