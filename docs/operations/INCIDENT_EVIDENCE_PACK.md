# Incident Evidence Pack

**Incident ID:** INC-2026-01-12-AUTH  
**Date:** 2026-01-12  
**Status:** In Progress  

## 1. Environment Details

| Environment | URL | Container App | Status |
|-------------|-----|---------------|--------|
| Production | https://jobsheet-qa-production.happydesert-4448b4c0.uksouth.azurecontainerapps.io | jobsheet-qa-production | Auth enforced |
| Staging | https://plantex-assist-staging.happydesert-4448b4c0.uksouth.azurecontainerapps.io | plantex-assist-staging | Working |

**Current SHA:** `1644504de4d9bd3b52302067bb41c37d4f4e590f`

## 2. Symptoms Reported

1. **401 Unauthorized on all API calls** - Users cannot upload documents or view audits
2. **Console errors showing malformed URLs:**
   - `/.auth/login/%VITE_ANALYTICS_ENDPOINT%/umami` (MIME type error)
   - `404 for /auth/login/aad?post_login_redirect_uri=...`
3. **Browser chunk cache issues** - Stale JS modules causing "Failed to fetch dynamically imported module"

## 3. Root Causes Identified

### RC-1: Malformed excludedPaths in Azure Easy Auth Config
**Evidence:**
```json
{
  "excludedPaths": [
    "\"/healthz\"",
    " \"/readyz\"",
    " \"/metrics\""
  ]
}
```
**Impact:** Health endpoints were blocked by auth, causing Container App health probes to fail.
**Fix Applied:** Used `az rest` API to set correct paths:
```json
{
  "excludedPaths": ["/healthz", "/readyz", "/metrics"]
}
```

### RC-2: Vite Analytics Script with Unsubstituted Env Vars
**Evidence:** `client/index.html` lines 24-25:
```html
<script defer src="%VITE_ANALYTICS_ENDPOINT%/umami" data-website-id="%VITE_ANALYTICS_WEBSITE_ID%"></script>
```
**Impact:** Browser attempts to load `%VITE_ANALYTICS_ENDPOINT%/umami` as a literal URL, which gets interpreted as a relative path and fails with MIME type errors.
**Status:** PENDING FIX

### RC-3: Frontend Auth Redirect Logic
**Evidence:** `client/src/contexts/AuthContext.tsx` line 76:
```typescript
window.location.href = '/.auth/login/aad?post_login_redirect_uri=' + encodeURIComponent(window.location.href);
```
**Impact:** 
- With `RedirectToLoginPage` mode, Azure handles redirects automatically at the ingress level
- Frontend redirect is redundant and may cause double-redirect issues
**Status:** PENDING FIX

### RC-4: No X-MS-CLIENT-PRINCIPAL Header from Azure
**Evidence:** Backend logs show:
```json
{"level":"info","service":"Auth","message":"Checking authentication","data":{"hasAzurePrincipal":false,"hasCookie":false}}
```
**Root Cause:** When `unauthenticatedClientAction=AllowAnonymous`, Azure passes requests through without the auth header.
**Fix Applied:** Changed to `RedirectToLoginPage` mode.

## 4. Network Trace Summary

| Request | Expected | Actual | Status |
|---------|----------|--------|--------|
| GET /healthz | 200 + JSON | 200 + JSON | ✅ FIXED |
| GET /readyz | 200 + JSON | 200 + JSON | ✅ FIXED |
| GET /metrics | 200 + text/plain | 200 + text/plain | ✅ FIXED |
| GET / (unauthenticated) | 302 → login | 401 (browser gets redirect) | ✅ Working |
| GET /api/trpc/auth.me (authenticated) | 200 + user | PENDING TEST | ⏳ |

## 5. Current Azure Easy Auth Config

```json
{
  "platform": { "enabled": true },
  "globalValidation": {
    "unauthenticatedClientAction": "RedirectToLoginPage",
    "excludedPaths": ["/healthz", "/readyz", "/metrics"]
  },
  "identityProviders": {
    "azureActiveDirectory": {
      "clientId": "7cddc909-5f20-4330-99d3-f686f8eab7d4",
      "openIdIssuer": "https://sts.windows.net/ff0fd0d8-5318-4403-99fe-5ce2cb54cf38/v2.0"
    }
  }
}
```

## 6. Remaining Action Items

- [ ] Fix Vite analytics script to conditionally render only when env vars exist
- [ ] Remove frontend auth redirect (let Azure handle it)
- [ ] Add cache-busting headers for index.html
- [ ] Test full login → upload → audit flow
- [ ] Create integration tests

## 7. Verification Commands

```bash
# Health check
curl -s https://jobsheet-qa-production.happydesert-4448b4c0.uksouth.azurecontainerapps.io/healthz

# Readiness check
curl -s https://jobsheet-qa-production.happydesert-4448b4c0.uksouth.azurecontainerapps.io/readyz | jq .

# Auth status (should return 401 for unauthenticated)
curl -s -o /dev/null -w "%{http_code}" https://jobsheet-qa-production.happydesert-4448b4c0.uksouth.azurecontainerapps.io/api/trpc/auth.me
```
