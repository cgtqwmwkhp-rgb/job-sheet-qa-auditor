# Performance Budgets

**Date:** 2026-01-13  
**Status:** Active  
**Owner:** Release Governor

---

## Overview

This document defines performance budgets for the Job Sheet QA Auditor application. These budgets ensure consistent user experience and prevent performance regressions.

---

## Budget Categories

### 1. API Response Times

| Endpoint | Warn (ms) | Fail (ms) | Current (ms) | Status |
|----------|-----------|-----------|--------------|--------|
| `/readyz` | 200 | 500 | 83 | ✅ |
| `/healthz` | 150 | 300 | 55 | ✅ |
| `/api/trpc/system.version` | 150 | 300 | 54 | ✅ |
| `/api/documents/:id/pdf` (401) | 200 | 500 | 71 | ✅ |
| `/` (index.html) | 150 | 300 | 55 | ✅ |

### 2. Frontend Load Times

| Metric | Warn (ms) | Fail (ms) | Target | Enforcement |
|--------|-----------|-----------|--------|-------------|
| **TTFH** (Time To First Header) | 500 | 1000 | ≤300ms | Perf marks |
| **TTFR** (Time To First Findings) | 1500 | 3000 | ≤1200ms | Perf marks |
| **PDF-TTFB** (PDF First Byte) | 1000 | 2000 | ≤800ms | Perf marks |

### 3. Payload Sizes

| Resource | Warn (KB) | Fail (KB) | Notes |
|----------|-----------|-----------|-------|
| `index.html` | 400 | 600 | Includes inline CSS |
| Main JS bundle | 500 | 800 | Code-split chunks |
| API response (list) | 50 | 100 | Paginated |
| API response (detail) | 100 | 200 | Single audit |

---

## Enforcement Strategy

### Phase 1: Warn Only (Current)

All budgets are **advisory** with console warnings:

```typescript
if (loadTime > WARN_THRESHOLD) {
  console.warn(`[Perf] ${metric} exceeded warn threshold: ${loadTime}ms > ${WARN_THRESHOLD}ms`);
}
```

### Phase 2: CI Warnings (Next 30 Days)

Add performance checks to CI that **warn but don't block**:

```yaml
- name: Performance budget check
  run: |
    READYZ_TIME=$(curl -w "%{time_total}" -o /dev/null -s "$URL/readyz")
    if (( $(echo "$READYZ_TIME > 0.2" | bc -l) )); then
      echo "::warning::readyz exceeded 200ms threshold"
    fi
```

### Phase 3: CI Failures (Future)

Once budgets are validated over 30 days, **convert to fail gates**:

```yaml
- name: Performance budget check
  run: |
    READYZ_TIME=$(curl -w "%{time_total}" -o /dev/null -s "$URL/readyz")
    if (( $(echo "$READYZ_TIME > 0.5" | bc -l) )); then
      echo "::error::readyz exceeded 500ms FAIL threshold"
      exit 1
    fi
```

---

## Measurement Points

### Server-Side

Measured by `curl` during deploy verification:

```bash
# From smoke-check.sh
curl -w "Time: %{time_total}s\n" -o /dev/null -s "$URL/readyz"
```

### Client-Side

Measured by `perf.ts` performance marks:

```typescript
import { perfMark, perfMeasure, PERF_MARKS, PERF_MEASURES } from '@/lib/perf';

// Mark when summary renders
perfMark(PERF_MARKS.AUDIT_SUMMARY_RENDERED);

// Measure TTFH
perfMeasure(PERF_MEASURES.TTFH, PERF_MARKS.AUDIT_DETAIL_CLICK, PERF_MARKS.AUDIT_SUMMARY_RENDERED);
```

---

## Budget Exceptions

| Exception | Reason | Expiry |
|-----------|--------|--------|
| Cold start | First request after scale-to-zero | Permanent |
| Large PDFs | >10MB documents may exceed PDF-TTFB | Permanent |
| Network latency | Users >500ms from Azure UK South | Permanent |

---

## Rollout Timeline

| Phase | Date | Action |
|-------|------|--------|
| Phase 1 | 2026-01-13 | Warn only (current) |
| Phase 2 | 2026-01-27 | CI warnings |
| Phase 3 | 2026-02-15 | CI failures |

---

## Related Documents

- `PERF_BASELINE_BEFORE.md` - Pre-optimization baseline
- `PERF_BASELINE_AFTER.md` - Post-optimization measurements
- `client/src/lib/perf.ts` - Client-side performance instrumentation
