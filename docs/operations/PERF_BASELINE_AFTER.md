# Performance Baseline (AFTER Optimization)

**Date:** 2026-01-13  
**Environment:** Staging / Production  
**SHA:** (to be filled after deployment)

---

## Changes Implemented

### 1. Lazy PDF Loading

The PDF viewer now loads **on-demand** instead of eagerly:

- **Before:** PDF fetched immediately when audit detail page opens
- **After:** PDF loads only when user clicks "Load Preview" button

```typescript
// Before: immediate load
<DocumentViewer url={pdfUrl} />

// After: lazy load
{showPdfViewer ? (
  <DocumentViewer url={documentUrl} />
) : (
  <Button onClick={handleShowPdfViewer}>Load Preview</Button>
)}
```

### 2. Auth Resilience

Query client configured to prevent React crashes on auth errors:

- `throwOnError: false` - queries return error state instead of throwing
- Auth errors never retry - prevents infinite loops
- Error boundary catches any uncaught errors

### 3. Performance Instrumentation

Client-side marks and measures added:

| Mark | Description |
|------|-------------|
| `audit_detail_click` | Navigation to audit detail |
| `audit_summary_rendered` | Header/summary visible |
| `audit_findings_first_render` | First findings rendered |
| `pdf_view_click` | User clicks "Load Preview" |
| `pdf_first_byte` | PDF document loaded |

Derived metrics:
- **TTFH** = summary_rendered - click
- **TTFR** = findings_first_render - click
- **PDF-TTFB** = pdf_first_byte - pdf_view_click

### 4. Blob URL Guard

DocumentViewer prevents loading Azure Blob SAS URLs:

```typescript
function assertNoDirectBlobUrl(url: string): void {
  if (url && url.includes('blob.core.windows.net')) {
    throw new Error('Direct blob URLs not allowed. Use PDF proxy.');
  }
}
```

---

## Expected Performance Improvements

### Before vs After

| Metric | Before (est.) | After (target) | Improvement |
|--------|---------------|----------------|-------------|
| **TTFH** | 800-1200ms | ≤300ms | ~60-75% |
| **TTFR** | 1500-2500ms | ≤1200ms | ~20-50% |
| **PDF-TTFB** | N/A (eager) | ≤800ms | Lazy (user-triggered) |

### Key Improvements

1. **Summary renders faster**: No waiting for PDF to load
2. **Findings appear sooner**: No blocking on PDF fetch
3. **Reduced bandwidth**: PDF only downloaded when needed
4. **No CORS errors**: Blob URLs blocked, PDF proxy used
5. **No React crashes**: Auth errors handled gracefully

---

## Verification Checklist

### Local Development

- [x] Build passes: `pnpm run build`
- [x] TypeScript check passes: `pnpm run check`
- [x] Tests pass (except unrelated evidence pack test): `pnpm test`
- [x] No blob URLs in built assets (except guard detection pattern)

### Staging Deployment

- [ ] Health check: `/healthz` returns 200
- [ ] Readiness check: `/readyz` returns 200
- [ ] System version: `/api/trpc/system.version` returns current SHA
- [ ] PDF proxy: `/api/documents/:id/pdf` returns `application/pdf`
- [ ] Audit detail loads without React errors
- [ ] PDF loads only on click

### Production Deployment

- [ ] All staging checks pass
- [ ] Performance marks visible in DevTools
- [ ] No blob.core.windows.net fetches in Network tab
- [ ] PDF viewer works end-to-end

---

## Measurement Instructions

To capture real metrics after deployment:

1. Open browser DevTools → Performance tab
2. Navigate to Dashboard
3. Click an audit row (triggers `audit_detail_click`)
4. Wait for summary and findings to render
5. Click "Load Preview" for PDF
6. Stop recording

Check Console for performance logs:
```
[Perf] TTFH: 250ms
[Perf] TTFR: 800ms
[Perf] PDF_TTFB: 450ms
```

---

## Files Changed

| File | Change |
|------|--------|
| `client/src/main.tsx` | Auth-resilient QueryClient config |
| `client/src/components/ErrorBoundary.tsx` | New error boundary component |
| `client/src/pages/AuditResults.tsx` | Lazy PDF loading, perf marks |
| `client/src/pages/Dashboard.tsx` | Perf marks on navigation |
| `client/src/components/DocumentViewer.tsx` | Blob URL guard, PDF TTFB mark |
| `client/src/lib/perf.ts` | Performance instrumentation utility |
| `client/src/components/__tests__/DocumentViewer.test.ts` | URL guard tests |
| `docs/operations/PERF_BASELINE_BEFORE.md` | Baseline documentation |
| `docs/operations/PERF_BASELINE_AFTER.md` | This file |

---

## Rollback

If issues occur:

```bash
# Revert to previous commit
git revert HEAD

# Or redeploy previous image
az containerapp revision copy \
  --name jobsheet-qa-production \
  --resource-group jobsheet-qa-rg \
  --from-revision <previous-revision>
```
