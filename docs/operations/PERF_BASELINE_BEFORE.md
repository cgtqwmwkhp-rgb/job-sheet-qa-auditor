# Performance Baseline (BEFORE Optimization)

**Date:** 2026-01-13  
**Environment:** Production  
**SHA:** 4b83e9833e86009d6fae46e2f7690cf89cae88cf

---

## Current Architecture Analysis

### Audit Detail Load Sequence (Current)

```
User clicks audit row
  ├─> trpc.jobSheets.get (single job sheet)
  │     └─> Wait for response
  ├─> trpc.audits.getByJobSheet (audit result)
  │     └─> Wait for response  
  ├─> trpc.audits.getFindings (ALL findings at once)
  │     └─> Wait for response
  └─> DocumentViewer renders with PDF URL
        └─> Fetches /api/documents/:id/pdf (on mount, not lazy)
```

### Identified Performance Issues

| Issue | Impact | Root Cause |
|-------|--------|------------|
| **Sequential API calls** | High | Queries depend on each other; no parallelization |
| **Full findings load** | Medium | All findings fetched at once, no pagination |
| **Eager PDF load** | High | PDF fetched immediately, even if user doesn't view |
| **No performance marks** | N/A | Cannot measure TTFH, TTFR, PDF-TTFB |

---

## Baseline Metrics (Estimated)

Since we don't have client-side instrumentation yet, these are estimated based on:
- Network waterfall analysis
- API response times from server logs
- Typical latencies for Azure Container Apps

| Metric | Current (Estimated) | Target (Staging) | Target (Prod) |
|--------|---------------------|------------------|---------------|
| **TTFH** (Time To First Header) | ~800-1200ms | ≤300ms | ≤500ms |
| **TTFR** (Time To First Findings) | ~1500-2500ms | ≤1200ms | ≤2000ms |
| **PDF-TTFB** (PDF First Byte) | ~500-1000ms | ≤800ms | ≤1500ms |

---

## API Response Times (From Server Logs)

### Job Sheet Get

```
Endpoint: /api/trpc/jobSheets.get
Method: Query
Typical Latency: 50-150ms
```

### Audit Result Get

```
Endpoint: /api/trpc/audits.getByJobSheet
Method: Query
Typical Latency: 100-300ms
```

### Findings Get (ALL)

```
Endpoint: /api/trpc/audits.getFindings
Method: Query
Typical Latency: 200-500ms (depends on finding count)
Payload Size: Variable (10KB - 500KB)
```

### PDF Proxy

```
Endpoint: /api/documents/:id/pdf
Method: GET (streaming)
Typical TTFB: 200-500ms
Total Transfer: Variable (100KB - 10MB)
```

---

## Current Query Pattern (Code Analysis)

From `AuditResults.tsx`:

```typescript
// Sequential: each query waits for previous
const { data: jobSheetData } = trpc.jobSheets.get.useQuery(...);
const { data: auditResult } = trpc.audits.getByJobSheet.useQuery(
  ..., { enabled: !!jobSheetData }  // Waits for jobSheet
);
const { data: findingsData } = trpc.audits.getFindings.useQuery(
  ..., { enabled: !!auditResult }   // Waits for auditResult
);
```

### Problems

1. **Waterfall pattern:** 3 sequential network requests
2. **No skeleton rendering:** Entire page blocks until data loads
3. **PDF loads eagerly:** DocumentViewer fetches PDF immediately on mount
4. **No pagination:** All findings loaded at once

---

## Optimization Plan

### Phase 1: Split Endpoints

| Endpoint | Purpose | Size | Latency Target |
|----------|---------|------|----------------|
| `audits.getSummary` | Header/status only | <1KB | <100ms |
| `audits.getFindings` | Paginated findings | <10KB/page | <200ms |
| `audits.getTraces` | Debug traces (lazy) | Variable | N/A (lazy) |

### Phase 2: Parallel Loading

```typescript
// Parallel: fetch summary and first page of findings together
const [summary, findings] = await Promise.all([
  trpc.audits.getSummary.fetch({ jobSheetId }),
  trpc.audits.getFindings.fetch({ jobSheetId, page: 1, limit: 20 }),
]);
```

### Phase 3: Lazy PDF

```typescript
// PDF loads only when user clicks "View PDF"
const [showPdf, setShowPdf] = useState(false);
{showPdf && <DocumentViewer url={pdfUrl} />}
```

---

## Measurement Plan

Add performance marks:

```typescript
performance.mark('audit_detail_click');
// ... load data ...
performance.mark('audit_summary_rendered');
performance.mark('audit_findings_first_render');
// ... user clicks View PDF ...
performance.mark('pdf_view_click');
performance.mark('pdf_first_byte');

// Calculate metrics
performance.measure('TTFH', 'audit_detail_click', 'audit_summary_rendered');
performance.measure('TTFR', 'audit_detail_click', 'audit_findings_first_render');
performance.measure('PDF-TTFB', 'pdf_view_click', 'pdf_first_byte');
```

---

## Next Steps

1. ✅ Create baseline document (this file)
2. ⬜ Add performance marks to client
3. ⬜ Split API endpoints
4. ⬜ Implement lazy PDF loading
5. ⬜ Add pagination for findings
6. ⬜ Create PERF_BASELINE_AFTER.md with measured improvements
