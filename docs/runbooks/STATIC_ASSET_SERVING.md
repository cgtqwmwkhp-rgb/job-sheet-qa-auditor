# Static Asset Serving Runbook

**Last Updated:** 2026-01-12  
**Incident Reference:** INC-2026-01-12-ASSETS

## Overview

This runbook documents the static asset serving configuration for the Job Sheet QA Auditor application deployed on Azure Container Apps with Azure Easy Auth.

## Cache Control Strategy

| Resource | Cache-Control Header | Reason |
|----------|---------------------|--------|
| `/index.html` | `no-store, no-cache, must-revalidate` | Must fetch fresh on every request to pick up new deployments |
| `/assets/*.js, *.css` | `public, max-age=31536000, immutable` | Vite hashes filenames; can cache forever |
| `/*.webmanifest` | `no-cache, must-revalidate` | PWA manifest should revalidate |
| `/sw.js`, `/registerSW.js` | `no-cache, must-revalidate` | Service workers must revalidate |
| `/images/*`, `*.png`, `*.ico` | `public, max-age=86400` | 1 day cache for images |

## Azure Easy Auth Configuration

### Required `excludedPaths`

These paths **MUST** be excluded from Azure Easy Auth to allow unauthenticated access:

```json
{
  "globalValidation": {
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
}
```

### How to Update excludedPaths

```bash
SUBSCRIPTION_ID=$(az account show --query id -o tsv)
RESOURCE_GROUP="plantex-assist"
APP_NAME="jobsheet-qa-production"

az rest --method PUT \
  --uri "https://management.azure.com/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RESOURCE_GROUP}/providers/Microsoft.App/containerApps/${APP_NAME}/authConfigs/current?api-version=2024-03-01" \
  --headers "Content-Type=application/json" \
  --body '{
    "properties": {
      "platform": { "enabled": true },
      "globalValidation": {
        "unauthenticatedClientAction": "RedirectToLoginPage",
        "excludedPaths": [
          "/healthz", "/readyz", "/metrics",
          "/assets/*", "/manifest.webmanifest", "/favicon.ico",
          "/sw.js", "/registerSW.js", "/workbox-*.js",
          "/firebase-messaging-sw.js", "/images/*", "/pwa-*.png"
        ]
      },
      "identityProviders": {
        "azureActiveDirectory": {
          "enabled": true,
          "registration": {
            "clientId": "YOUR_CLIENT_ID",
            "clientSecretSettingName": "microsoft-provider-authentication-secret",
            "openIdIssuer": "https://sts.windows.net/YOUR_TENANT_ID/v2.0"
          }
        }
      }
    }
  }'
```

## Troubleshooting

### Symptom: "Failed to fetch dynamically imported module"

**Cause:** Browser cached an old `index.html` that references chunk hashes that no longer exist.

**Solution:**
1. User should hard refresh (Cmd+Shift+R / Ctrl+Shift+R)
2. Or clear browser cache for the site
3. Verify `index.html` has `Cache-Control: no-store`

**Verification:**
```bash
curl -I https://YOUR_APP_URL/ | grep -i cache-control
# Should show: cache-control: no-store, no-cache, must-revalidate
```

### Symptom: Static assets return 401

**Cause:** Azure Easy Auth `excludedPaths` doesn't include the asset path.

**Solution:**
1. Update `excludedPaths` using the Azure REST API (see above)
2. Wait 30-60 seconds for propagation
3. Verify with curl

**Verification:**
```bash
curl -I https://YOUR_APP_URL/manifest.webmanifest
# Should return HTTP 200, not 401
```

### Symptom: PWA icon download error

**Cause:** PWA icons referenced in manifest don't exist, OR are blocked by auth.

**Solution:**
1. Verify icons exist: `ls dist/public/pwa-*.svg`
2. Verify icons are in `excludedPaths`
3. Verify manifest references correct files

### Symptom: Service worker not updating

**Cause:** SW cached with long max-age.

**Solution:**
1. Verify `sw.js` has `Cache-Control: no-cache`
2. Force SW update: `navigator.serviceWorker.getRegistrations().then(r => r.forEach(reg => reg.update()))`

## Post-Deploy Checklist

After every deployment:

1. ✅ `/healthz` returns 200
2. ✅ `/readyz` returns 200 with database connected
3. ✅ `/manifest.webmanifest` returns 200 (no auth)
4. ✅ `/assets/*.js` returns 200 with `immutable` (no auth)
5. ✅ `/sw.js` returns 200 (no auth)
6. ✅ Version SHA matches expected

## CI Verification

The GitHub Actions workflow includes automatic verification:

- **Staging:** Soft verification (warns on failure)
- **Production:** Strict verification (fails deployment on error)

See `.github/workflows/azure-deploy.yml`:
- `Verify static asset serving` step

## Related Files

- `server/_core/vite.ts` - Cache header implementation
- `vite.config.ts` - PWA configuration
- `client/index.html` - Favicon and meta tags
- `server/tests/contracts/cacheHeaders.contract.test.ts` - Unit tests
