# Production Spot Check

**Timestamp:** 2026-01-13T14:38:53Z  
**Operator:** AI Agent (Release Governor)  
**Environment:** Production

---

## Environment URLs

| Environment | URL |
|-------------|-----|
| Production | https://jobsheet-qa-production.happydesert-4448b4c0.uksouth.azurecontainerapps.io |
| Staging | https://plantex-assist-staging.happydesert-4448b4c0.uksouth.azurecontainerapps.io |

---

## Production Evidence

### 1. /readyz

```bash
curl -sS https://jobsheet-qa-production.happydesert-4448b4c0.uksouth.azurecontainerapps.io/readyz
```

**Response:**

```json
{
  "status": "ok",
  "timestamp": "2026-01-13T14:38:53.610Z",
  "checks": {
    "database": {
      "status": "ok",
      "latencyMs": 8
    },
    "storage": {
      "status": "ok"
    }
  },
  "version": {
    "sha": "c3bb5439897c5818c5d23d18f7dc72acee8eaa6f",
    "platform": "main",
    "buildTime": "unknown"
  }
}
```

**Status:** ✅ PASS (database ok, storage ok)

---

### 2. /api/trpc/system.version

```bash
curl -sS "https://jobsheet-qa-production.happydesert-4448b4c0.uksouth.azurecontainerapps.io/api/trpc/system.version?input=%7B%7D"
```

**Response:** Empty (401 Unauthorized - requires authentication)

**Note:** Protected by Easy Auth; SHA extracted from `/readyz` instead.

---

### 3. PDF Proxy Auth

```bash
curl -sS -o /dev/null -w "HTTP Status: %{http_code}\n" \
  "https://jobsheet-qa-production.happydesert-4448b4c0.uksouth.azurecontainerapps.io/api/documents/31/pdf"
```

**Response:**

```
HTTP Status: 401
Time: 0.043410s
```

**Status:** ✅ PASS (correctly returns 401, not 302 redirect)

---

### 4. Audit Detail Auth

```bash
curl -sS -o /dev/null -w "HTTP Status: %{http_code}\n" \
  "https://jobsheet-qa-production.happydesert-4448b4c0.uksouth.azurecontainerapps.io/api/trpc/audits.getByJobSheet?input=%7B%22json%22%3A%7B%22jobSheetId%22%3A31%7D%7D"
```

**Response:**

```
HTTP Status: 401
Time: 0.042800s
```

**Status:** ✅ PASS (correctly returns 401, not 302 redirect)

---

### 5. Homepage

```bash
curl -sS -o /dev/null -w "HTTP Status: %{http_code}\n" \
  "https://jobsheet-qa-production.happydesert-4448b4c0.uksouth.azurecontainerapps.io/"
```

**Response:**

```
HTTP Status: 401
Time: 0.044488s
```

**Status:** ⚠️ EXPECTED (Easy Auth enforced on all routes except health endpoints)

---

## SHA Comparison

| Environment | SHA | Status |
|-------------|-----|--------|
| Production | `c3bb5439897c5818c5d23d18f7dc72acee8eaa6f` | Behind |
| Staging | `62a557c4c24c2f8e047c8e004a76f829f4a53dce` | Current |

**Note:** Production is behind staging by 2 commits:
- `62a557c` - fix: smoke-check.sh get_time_ms undefined (#105)
- `88b45b9` - docs: add performance budgets and 30-day plan (#104)

Production deployment requires manual approval or workflow_dispatch trigger.

---

## Auth Notes

1. **Easy Auth Enabled:** All routes except `/healthz`, `/readyz`, `/metrics`, and static assets require authentication.
2. **API Returns 401:** API endpoints correctly return 401 (not 302) for unauthenticated requests.
3. **PDF Proxy Protected:** The PDF proxy endpoint is auth-protected and returns 401.
4. **Homepage Auth:** Homepage returns 401 for unauthenticated curl; browser users are redirected to Azure AD login.

---

## Spot Check Summary

| Check | Expected | Actual | Status |
|-------|----------|--------|--------|
| `/readyz` | 200 + ok | 200 + ok | ✅ |
| Database latency | <50ms | 8ms | ✅ |
| Storage status | ok | ok | ✅ |
| PDF Proxy | 401 | 401 | ✅ |
| Audit Detail | 401 | 401 | ✅ |
| Homepage | 401 | 401 | ✅ |
| SHA current | `62a557c` | `c3bb543` | ⚠️ Behind |

---

## Recommendations

1. **Deploy to Production:** Trigger production deployment to update from `c3bb543` to `62a557c`.
2. **Verify Post-Deploy:** Re-run this spot check after production deployment.
3. **Document SHA:** Update DEPLOYMENT_FLYWHEEL_EVIDENCE_PACK.md with production SHA.
