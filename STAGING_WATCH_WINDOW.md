# Staging Watch Window Report

## Stage D — Staging Short Watch Window (15–60 mins)

**Date**: 2026-01-11  
**Head SHA**: `3b0c06b58564652180636a74f86a2c062bfcb446`  
**Environment**: Staging  
**Watch Duration**: ___ minutes

---

## Prerequisites

- [ ] Stage C (Smoke Processing) completed successfully
- [ ] Staging URL accessible

```bash
export STAGING_URL="https://your-staging-app.azurecontainerapps.io"
```

---

## D1: Timepoint Captures (Minimum 3)

### Timepoint 1 (T+0)

**Timestamp**: ____-__-__ __:__:__

#### /readyz

```bash
curl -sf "${STAGING_URL}/readyz" | jq .
```

**Output**:
```json
// PASTE OUTPUT HERE
```

**Status**: [ ] Ready / [ ] Not Ready

---

#### /metrics (Uptime & Error Counters)

```bash
curl -sf "${STAGING_URL}/metrics" | grep -E "(uptime|error|5xx|http_request)"
```

**Output**:
```
# PASTE OUTPUT HERE
# Expected format:
# http_requests_total{method="GET",status="200"} 1234
# http_requests_total{method="POST",status="200"} 567
# http_requests_total{method="GET",status="500"} 0
# process_uptime_seconds 123.456
```

---

### Timepoint 2 (T+15 min)

**Timestamp**: ____-__-__ __:__:__

#### /readyz

**Output**:
```json
// PASTE OUTPUT HERE
```

**Status**: [ ] Ready / [ ] Not Ready

---

#### /metrics

**Output**:
```
// PASTE OUTPUT HERE
```

---

### Timepoint 3 (T+30 min or T+60 min)

**Timestamp**: ____-__-__ __:__:__

#### /readyz

**Output**:
```json
// PASTE OUTPUT HERE
```

**Status**: [ ] Ready / [ ] Not Ready

---

#### /metrics

**Output**:
```
// PASTE OUTPUT HERE
```

---

## D2: Stability Verification

### Readiness Flap Check

| Timepoint | Status | Flap Detected? |
|-----------|--------|----------------|
| T+0 | | |
| T+15 | | |
| T+30/60 | | |

**Readiness Stable**: [ ] Yes / [ ] No (flaps detected)

---

### 5xx Error Check

| Timepoint | 5xx Count (from metrics) | Change from Previous |
|-----------|--------------------------|----------------------|
| T+0 | | — |
| T+15 | | |
| T+30/60 | | |

**5xx Spike Detected**: [ ] No / [ ] Yes (investigate required)

---

### Uptime Verification

| Timepoint | Uptime (seconds) | Expected Growth |
|-----------|------------------|-----------------|
| T+0 | | — |
| T+15 | | +900s |
| T+30/60 | | +1800s/+3600s |

**Uptime Consistent**: [ ] Yes / [ ] No (restart detected)

---

## Watch Window Summary

| Check | Status |
|-------|--------|
| No readiness flaps | ⬜ |
| No 5xx spikes | ⬜ |
| Uptime growing consistently | ⬜ |
| All timepoints captured | ⬜ |

---

## Stage D Conclusion

- [ ] Staging stable for ___ minutes
- [ ] No critical issues detected
- [ ] Ready to proceed to Stage E (Production Deploy)

**Signed Off By**: ____________________  
**Date**: ____-__-__
