# Incident Asset Evidence

**Incident ID:** INC-2026-01-12-ASSETS  
**Captured:** 2026-01-12T13:04:03Z  
**Status:** BEFORE FIX  

## Production Environment

**URL:** https://jobsheet-qa-production.happydesert-4448b4c0.uksouth.azurecontainerapps.io

### Evidence: All Static Assets Return 401

Azure Easy Auth blocks all static assets because `excludedPaths` only includes health endpoints.

| Resource | Status | Cache-Control | Content-Type | Issue |
|----------|--------|---------------|--------------|-------|
| `/` | 401 | - | - | Expected (requires auth) |
| `/index.html` | 401 | - | - | Expected (requires auth) |
| `/assets/*.js` | **401** | - | - | ❌ Should be 200 |
| `/pwa-192x192.png` | **401** | - | - | ❌ Should be 200 |
| `/manifest.webmanifest` | **401** | - | - | ❌ Should be 200 |
| `/favicon.ico` | **401** | - | - | ❌ Should be 200 |

### Raw curl Output

```bash
# Root path
$ curl -I https://jobsheet-qa-production.../
HTTP/2 401 
www-authenticate: Bearer realm="jobsheet-qa-production..." authorization_uri="https://login.windows.net/.../oauth2/v2.0/authorize"
x-ms-middleware-request-id: d6e0c933-94a5-4637-8c3f-07e74feadcfe

# Static asset (JS chunk)
$ curl -I https://jobsheet-qa-production.../assets/index-DG9HaYJN.js
HTTP/2 401 
www-authenticate: Bearer realm="jobsheet-qa-production..."
x-ms-middleware-request-id: 18ba308c-62fc-480f-98ac-29975507db81

# PWA icon
$ curl -I https://jobsheet-qa-production.../pwa-192x192.png
HTTP/2 401 
www-authenticate: Bearer realm="jobsheet-qa-production..."
x-ms-middleware-request-id: 02c9a4cf-8945-4086-b724-1018bdd03e38

# Manifest
$ curl -I https://jobsheet-qa-production.../manifest.webmanifest
HTTP/2 401 
www-authenticate: Bearer realm="jobsheet-qa-production..."
x-ms-middleware-request-id: 58d0af52-6317-477c-beb5-83d0ae4427c6
```

## Current Azure Easy Auth Config

```json
{
  "globalValidation": {
    "excludedPaths": [
      "/healthz",
      "/readyz",
      "/metrics"
    ],
    "unauthenticatedClientAction": "RedirectToLoginPage"
  }
}
```

## Root Causes Identified

| RC# | Issue | Impact |
|-----|-------|--------|
| RC-1 | `excludedPaths` doesn't include static assets | JS/CSS/images blocked by 401 |
| RC-2 | PWA icons don't exist in build | Manifest references missing files |
| RC-3 | No cache headers visible | Azure intercepts before our server |
| RC-4 | Stale browser cache | Old chunk hashes in cached index.html |

## Required Fixes

1. **Update `excludedPaths`** to include:
   - `/assets/*` - All Vite-built chunks
   - `/manifest.webmanifest` - PWA manifest
   - `/favicon.ico` - Browser favicon
   - `/sw.js`, `/registerSW.js`, `/workbox-*.js` - Service worker files
   - `/images/*` - Static images
   - `/firebase-messaging-sw.js` - Firebase SW

2. **Create PWA icons** or remove from manifest

3. **Verify cache headers** are applied after auth bypass

---

## AFTER FIX

**Timestamp:** 2026-01-12T13:06:26Z  
**Status:** ✅ RESOLVED

### Updated Azure Easy Auth excludedPaths

```json
{
  "excludedPaths": [
    "/healthz",
    "/readyz",
    "/metrics",
    "/assets/*",
    "/manifest.webmanifest",
    "/favicon.ico",
    "/sw.js",
    "/registerSW.js",
    "/workbox-*.js",
    "/firebase-messaging-sw.js",
    "/images/*",
    "/pwa-*.png"
  ],
  "unauthenticatedClientAction": "RedirectToLoginPage"
}
```

### Verified Static Asset Access

| Resource | Status | Cache-Control | Content-Type |
|----------|--------|---------------|--------------|
| `/` | 401 | - | - (expected, requires auth) |
| `/manifest.webmanifest` | **200** | public, max-age=0 | application/manifest+json ✅ |
| `/assets/*.js` | **200** | public, max-age=31536000, immutable | application/javascript ✅ |
| `/sw.js` | **200** | public, max-age=0 | application/javascript ✅ |
| `/images/audit-icon.png` | **200** | public, max-age=0 | image/png ✅ |
| `/healthz` | 200 | - | application/json ✅ |
| `/readyz` | 200 | - | application/json ✅ |

### Raw curl Output (After Fix)

```bash
# manifest.webmanifest - now accessible without auth
$ curl -I https://jobsheet-qa-production.../manifest.webmanifest
HTTP/2 200 
content-type: application/manifest+json
cache-control: public, max-age=0

# JS chunk - accessible with correct cache headers
$ curl -I https://jobsheet-qa-production.../assets/index-DG9HaYJN.js
HTTP/2 200 
content-type: application/javascript; charset=UTF-8
cache-control: public, max-age=31536000, immutable

# Service worker - accessible
$ curl -I https://jobsheet-qa-production.../sw.js
HTTP/2 200 
content-type: application/javascript; charset=UTF-8
cache-control: public, max-age=0
```

## Summary

| Issue | Before | After |
|-------|--------|-------|
| Static assets | 401 (blocked) | 200 ✅ |
| Cache headers | Not visible | Correct ✅ |
| PWA icons | Missing | Created (SVG) ✅ |
| excludedPaths | Health only | All static assets ✅ |
