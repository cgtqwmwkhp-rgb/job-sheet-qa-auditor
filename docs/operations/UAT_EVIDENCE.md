# Production UAT Evidence

## Date: 2026-01-13
## Environment: Production
## URL: `https://jobsheet-qa-production.happydesert-4448b4c0.uksouth.azurecontainerapps.io`
## Deployed SHA: `62a557c4c24c2f8e047c8e004a76f829f4a53dce`

---

## UAT Execution Summary

| Step | Test | Expected | Actual | Status |
|------|------|----------|--------|--------|
| 1 | Health Check (`/readyz`) | 200 OK, DB healthy, Storage healthy | ✅ 200 OK, DB latency 9ms | ✅ PASS |
| 2 | Homepage (unauthenticated) | 401 Unauthorized | 401 in 49ms | ✅ PASS |
| 3 | Upload Endpoint | 401 Unauthorized | 401 | ✅ PASS |
| 4 | Job Sheets List | 401 Unauthorized | 401 | ✅ PASS |
| 5 | Audit Results | 401 Unauthorized | 401 | ✅ PASS |
| 6 | PDF Proxy | 401 Unauthorized | 401 | ✅ PASS |
| 7 | Hold Queue | 401 Unauthorized | 401 | ✅ PASS |
| 8 | Static Assets | 200 OK | manifest: 200, svg: 200 | ✅ PASS |
| 9 | PDF Proxy HEAD | 401 with WWW-Authenticate | 401 + Bearer realm | ✅ PASS |

---

## Detailed API Evidence

### 1. Health Check (`/readyz`)

```json
{
  "status": "ok",
  "timestamp": "2026-01-13T17:35:10.770Z",
  "checks": {
    "database": {
      "status": "ok",
      "latencyMs": 9
    },
    "storage": {
      "status": "ok"
    }
  },
  "version": {
    "sha": "62a557c4c24c2f8e047c8e004a76f829f4a53dce",
    "platform": "main",
    "buildTime": "unknown"
  }
}
```

**Verification:** ✅ SHA matches expected deployment (`62a557c4c24c2f8e047c8e004a76f829f4a53dce`)

### 2. Auth Enforcement (All Protected Routes)

| Endpoint | HTTP Status | Behavior |
|----------|-------------|----------|
| `/` (Homepage) | 401 | Correctly blocked |
| `/api/trpc/jobSheets.upload` | 401 | Correctly blocked |
| `/api/trpc/jobSheets.list` | 401 | Correctly blocked |
| `/api/trpc/audits.list` | 401 | Correctly blocked |
| `/api/documents/31/pdf` | 401 | Correctly blocked |
| `/api/trpc/jobSheets.list?status=review_queue` | 401 | Correctly blocked |

**Key Finding:** All protected routes return **401 Unauthorized** (not 302 redirect), which is the correct behavior for API/XHR calls.

### 3. PDF Proxy Headers

```
HTTP/2 401 
date: Tue, 13 Jan 2026 17:35:10 GMT
www-authenticate: Bearer realm="jobsheet-qa-production.happydesert-4448b4c0.uksouth.azurecontainerapps.io" authorization_uri="https://login.windows.net/ff0fd0d8-5318-4403-99fe-5ce2cb54cf38/oauth2/v2.0/authorize" resource_id="7cddc909-5f20-4330-99d3-f686f8eab7d4"
x-ms-middleware-request-id: 405bf0ba-1bc2-4f56-8e2d-adbe0d42125a
strict-transport-security: max-age=31536000; includeSubDomains
```

**Verification:** ✅ PDF proxy correctly returns 401 with proper WWW-Authenticate header for Azure AD OAuth2.

### 4. Static Assets (Public)

| Asset | HTTP Status |
|-------|-------------|
| `/manifest.webmanifest` | 200 |
| `/pwa-192x192.svg` | 200 |

**Verification:** ✅ Public static assets are accessible without authentication.

---

## Authenticated UAT Workflow (Browser-Based)

For full authenticated UAT, the following workflow must be verified via browser with Azure AD login:

### Workflow: Upload → Process → Audit Detail → Embedded PDF → Hold Queue

| Step | Action | Expected Result | Verification Method |
|------|--------|-----------------|---------------------|
| 1 | Navigate to `/` | Redirect to Azure AD login | Browser |
| 2 | Complete Azure AD login | Redirect back to app, dashboard loads | Browser |
| 3 | Navigate to `/upload` | Upload page loads with file input | Browser |
| 4 | Upload test PDF | Upload succeeds, processing starts | Browser + Network tab |
| 5 | Wait for processing | Job sheet status changes to `completed` | Browser poll |
| 6 | Navigate to `/audits` | Audit list shows uploaded job | Browser |
| 7 | Click audit row | Audit detail page loads with findings | Browser |
| 8 | Click "View PDF" | PDF opens via `/api/documents/:id/pdf` proxy | Browser + Network tab |
| 9 | Verify PDF URL | URL does NOT contain `blob.core.windows.net` | Browser URL bar |
| 10 | Navigate to `/hold-queue` | Hold queue page loads | Browser |
| 11 | Verify hold queue data | Shows real data (or empty state if none) | Browser |

**Note:** Browser-based UAT requires manual execution with Azure AD credentials. API-level verification confirms all endpoints are correctly protected.

---

## UAT Conclusion

| Category | Status | Notes |
|----------|--------|-------|
| **Health** | ✅ PASS | All health checks passing |
| **Auth Enforcement** | ✅ PASS | All protected routes return 401 (not 302) |
| **PDF Proxy Auth** | ✅ PASS | Returns 401 with WWW-Authenticate |
| **Static Assets** | ✅ PASS | Public assets accessible |
| **SHA Verification** | ✅ PASS | Deployed SHA matches expected |

**Overall UAT Status:** ✅ **PASS** (API-level verification complete)

---

## Evidence Timestamp

- **Captured:** 2026-01-13T17:35:10Z
- **Captured By:** Automated UAT Script
- **Production URL:** `https://jobsheet-qa-production.happydesert-4448b4c0.uksouth.azurecontainerapps.io`
