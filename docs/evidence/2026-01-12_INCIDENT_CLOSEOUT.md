# INCIDENT CLOSEOUT: Production Workflow Fix

**Date:** 2026-01-12  
**Status:** ✅ RESOLVED  
**Incident ID:** INC-2026-01-12-WORKFLOW  
**Severity:** High  

---

## Executive Summary

Fixed the production workflow "upload → assess → view audit + PDF" which was failing due to:
1. PDF URLs using potentially expired SAS tokens
2. Hold Queue showing hardcoded mock data instead of real review_queue items

---

## Root Cause Statement

**PDF View/Download Failure:**
SAS tokens generated at file upload time have a 60-minute TTL. When users attempted to view PDFs hours or days after upload, the stored URL was expired, causing PDF loading to fail.

**Hold Queue Mock Data:**
The Hold Queue page (`HoldQueue.tsx`) contained hardcoded mock data arrays (lines 26-67) with fake entries like "JS-2024-023", "Sarah Smith", etc. These were never replaced with real API calls, causing users to see fake data instead of actual review_queue items.

---

## Evidence

### Before Fix

**Production SHA:** `1e8f1c935f98e212431f29f7905ca72b7008410a`

**Hold Queue Mock Data (removed):**
```typescript
// Mock Data
const holdItems = [
  { id: "JS-2024-023", technician: "Sarah Smith", ... },
  { id: "JS-2024-021", technician: "Mike Johnson", ... },
  ...
];
```

**PDF URL Issue:** Direct use of `jobSheetData.fileUrl` which may contain expired SAS tokens.

### After Fix

**Production SHA:** `7b690cb632a35a2aa79cf20bb594d922a8e8e293`

**Health Check:**
```json
{"status":"ok","timestamp":"2026-01-12T20:23:49.054Z"}
```

**Version Check:**
```json
{
  "sha": "7b690cb632a35a2aa79cf20bb594d922a8e8e293",
  "platform": "main",
  "buildTime": "unknown"
}
```

---

## Fixes Implemented

### 1. PDF Fresh URL Endpoint (`server/routers.ts`)

Added `jobSheets.getFileUrl` endpoint that:
- Accepts job sheet ID
- Fetches job sheet record from database
- If `fileKey` exists, calls `storage.get(fileKey)` to generate fresh SAS URL
- Returns `{ url, fileName, fileType }`

```typescript
getFileUrl: protectedProcedure
  .input(z.object({ id: z.number() }))
  .query(async ({ input }) => {
    const jobSheet = await db.getJobSheetById(input.id);
    if (!jobSheet) throw new Error('Job sheet not found');
    
    if (jobSheet.fileKey) {
      const storage = getStorageAdapter();
      const { url } = await storage.get(jobSheet.fileKey);
      return { url, fileName: jobSheet.fileName, fileType: jobSheet.fileType };
    }
    
    return { url: jobSheet.fileUrl, fileName: jobSheet.fileName, fileType: jobSheet.fileType };
  }),
```

### 2. PDF Button Components (`client/src/pages/AuditResults.tsx`)

Added `ViewPdfButton` and `DownloadPdfButton` components that:
- Call `getFileUrl` endpoint to get fresh URL
- Open PDF in new tab (View) or trigger download (Download)
- Show loading state while fetching
- Handle errors with toast notifications

### 3. Hold Queue Real Data (`client/src/pages/HoldQueue.tsx`)

- Removed ALL mock data
- Added `trpc.jobSheets.list.useQuery({ status: 'review_queue' })`
- Added proper loading state with spinner
- Added error state with message
- Added empty state when queue is empty
- Real-time count displayed in badge

---

## Tests Added

| File | Tests | Purpose |
|------|-------|---------|
| `fileUrl.contract.test.ts` | 6 | Verifies getFileUrl endpoint structure |
| `holdQueue.contract.test.ts` | 10 | Verifies no mock data, uses real API |

**Test Results:**
```
Test Files  65 passed (65)
     Tests  1321 passed (1321)
```

---

## Deployment

### Workflow Runs

| Environment | Run ID | Status | URL |
|-------------|--------|--------|-----|
| Staging (auto) | 20933537779 | ✅ Success | [Link](https://github.com/cgtqwmwkhp-rgb/job-sheet-qa-auditor/actions/runs/20933537779) |
| Production | 20933542512 | ✅ Success | [Link](https://github.com/cgtqwmwkhp-rgb/job-sheet-qa-auditor/actions/runs/20933542512) |

### PR

- **PR #99**: [fix: production workflow - PDF fresh URLs, Hold Queue real data](https://github.com/cgtqwmwkhp-rgb/job-sheet-qa-auditor/pull/99)

---

## Verification Checklist

- [x] Production version matches expected SHA
- [x] Health check returns `{"status":"ok"}`
- [x] Database connectivity confirmed
- [x] Storage connectivity confirmed
- [x] Tests pass (1321/1321)
- [x] Build passes
- [x] CI workflows green

---

## Rollback Steps

If issues occur after deployment:

```bash
# 1. Revert the commit
git revert 7b690cb632a35a2aa79cf20bb594d922a8e8e293
git push

# 2. Trigger production deployment
gh workflow run azure-deploy.yml -f environment=production

# 3. Verify rollback
curl -s https://jobsheet-qa-production.happydesert-4448b4c0.uksouth.azurecontainerapps.io/readyz | jq '.version'
```

---

## Files Changed

| File | Change |
|------|--------|
| `client/src/pages/AuditResults.tsx` | Added ViewPdfButton, DownloadPdfButton components |
| `client/src/pages/HoldQueue.tsx` | Replaced mock data with real API |
| `server/routers.ts` | Added getFileUrl endpoint |
| `server/tests/contracts/fileUrl.contract.test.ts` | New: 6 tests |
| `server/tests/contracts/holdQueue.contract.test.ts` | New: 10 tests |

---

## Lessons Learned

1. **SAS Token Expiry**: Always generate fresh SAS tokens at access time, not at upload time
2. **Mock Data Removal**: Mock data should be clearly marked and removed before production
3. **Contract Tests**: Add contract tests to verify no mock data in production paths

---

## Sign-off

- **Incident Commander:** Cursor AI
- **Resolution Time:** 45 minutes
- **Status:** CLOSED
