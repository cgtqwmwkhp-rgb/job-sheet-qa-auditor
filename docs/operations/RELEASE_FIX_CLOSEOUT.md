# Release Fix Closeout

**Incident ID:** INC-2026-01-12-AUTH  
**Resolution Date:** 2026-01-12  
**Status:** ✅ RESOLVED  

## Summary

Fixed multiple production issues affecting authentication, analytics script loading, and browser caching.

## PRs Merged

| PR | Title | Status |
|----|-------|--------|
| #94 | fix: auth flow, analytics env vars, and cache headers | ✅ Merged |

## Deployment Verification

### Production Environment

**URL:** https://jobsheet-qa-production.happydesert-4448b4c0.uksouth.azurecontainerapps.io  
**SHA:** `92f9a6f25f266df7149ddf570badf06ce0eb24dc`  
**Deployed:** 2026-01-12T11:37:00Z  

### Health Checks ✅

```bash
# Health Check
$ curl -s https://jobsheet-qa-production.happydesert-4448b4c0.uksouth.azurecontainerapps.io/healthz
{"status":"ok","timestamp":"2026-01-12T11:38:19.055Z"}

# Readiness Check
$ curl -s https://jobsheet-qa-production.happydesert-4448b4c0.uksouth.azurecontainerapps.io/readyz
{
  "status": "ok",
  "checks": {
    "database": { "status": "ok", "latencyMs": 9 },
    "storage": { "status": "ok" }
  },
  "version": {
    "sha": "92f9a6f25f266df7149ddf570badf06ce0eb24dc",
    "platform": "main"
  }
}

# Metrics (Prometheus format)
$ curl -s https://jobsheet-qa-production.happydesert-4448b4c0.uksouth.azurecontainerapps.io/metrics | head -3
# HELP app_uptime_seconds Time since server start in seconds
# TYPE app_uptime_seconds gauge
app_uptime_seconds 212
```

### Azure Easy Auth Configuration ✅

```json
{
  "platform": { "enabled": true },
  "globalValidation": {
    "unauthenticatedClientAction": "RedirectToLoginPage",
    "excludedPaths": ["/healthz", "/readyz", "/metrics"]
  },
  "identityProviders": {
    "azureActiveDirectory": {
      "clientId": "7cddc909-5f20-4330-99d3-f686f8eab7d4"
    }
  }
}
```

### Auth Enforcement ✅

```bash
# Unauthenticated API call returns 401
$ curl -s -o /dev/null -w "%{http_code}" https://jobsheet-qa-production.happydesert-4448b4c0.uksouth.azurecontainerapps.io/api/trpc/auth.me
401

# With www-authenticate header directing to Azure AD
$ curl -s -I https://jobsheet-qa-production.happydesert-4448b4c0.uksouth.azurecontainerapps.io/
HTTP/2 401
www-authenticate: Bearer realm="jobsheet-qa-production..." authorization_uri="https://login.windows.net/.../oauth2/v2.0/authorize"
```

## Root Causes Fixed

### RC-1: Malformed excludedPaths ✅
- **Before:** `["\"/healthz\"", " \"/readyz\"", " \"/metrics\"]"` (escaped quotes, spaces)
- **After:** `["/healthz", "/readyz", "/metrics"]`
- **Fix:** Used `az rest` API to properly set paths

### RC-2: Analytics Script Env Vars ✅
- **Before:** `<script src="%VITE_ANALYTICS_ENDPOINT%/umami">` in index.html
- **After:** Conditional loading via `analytics.ts` only when env vars exist
- **Fix:** Moved to dynamic injection with guards

### RC-3: Frontend Auth Redirect ✅
- **Before:** Frontend called `/.auth/login/aad` which may not exist
- **After:** Azure Easy Auth handles redirects at ingress level
- **Fix:** Removed frontend redirect logic from AuthContext

### RC-4: Browser Chunk Caching ✅
- **Before:** No cache headers, stale chunks after deployment
- **After:** `index.html`: no-store; `/assets/*`: immutable, 1y
- **Fix:** Added cache control headers in `vite.ts`

## Test Results

```
Test Files  62 passed (62)
     Tests  1285 passed (1285)
```

New tests added:
- `server/tests/contracts/cacheHeaders.contract.test.ts`

## User Instructions

### For End Users

1. **Open the app in an incognito/private window** or clear browser cache
2. You will be automatically redirected to Microsoft login
3. After signing in, you'll return to the app authenticated
4. Upload functionality should now work

### For Operators

Health check commands:
```bash
# Quick health check
curl -s https://jobsheet-qa-production.happydesert-4448b4c0.uksouth.azurecontainerapps.io/healthz

# Full readiness with DB and storage
curl -s https://jobsheet-qa-production.happydesert-4448b4c0.uksouth.azurecontainerapps.io/readyz | jq .

# View current version
curl -s https://jobsheet-qa-production.happydesert-4448b4c0.uksouth.azurecontainerapps.io/readyz | jq .version
```

## Remaining Items

- [ ] User to test full login → upload → audit flow in browser
- [ ] Confirm X-MS-CLIENT-PRINCIPAL header is received after Azure login
- [ ] Monitor for any recurring 401 errors in logs

## Sign-Off

| Role | Name | Date |
|------|------|------|
| Incident Lead | Cursor AI | 2026-01-12 |
| Deployment Verified | Cursor AI | 2026-01-12 |
| User Acceptance | Pending | - |
