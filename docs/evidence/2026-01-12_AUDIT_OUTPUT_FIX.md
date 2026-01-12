# Audit Output Fix — Root Cause Analysis

**Date:** 2026-01-12  
**Status:** In Progress  
**Severity:** High (users cannot access completed audit outputs)

---

## 1. Symptom

Users report:
- "/audits" page shows "No Audit Selected" with no way to select an audit
- Dashboard shows "Recent Audits" with COMPLETED status but items are not clickable
- Analytics page shows mock/placeholder data instead of real statistics
- Cannot view or download PDF reports for completed audits

---

## 2. Root Cause Analysis

### Issue A: Audit Selection Navigation Broken

**Symptom:** `/audits` route shows empty state "No Audit Selected"

**Root Cause:** 
- `AuditResults.tsx` (lines 86-104) expects an `id` query parameter
- If no `id` is provided, it shows empty state with a "View All Audits" button
- The "View All Audits" button links to `/audits` — the same page — creating a loop
- There is NO list component showing available audits to select from

**Evidence:**
```typescript
// AuditResults.tsx:86-104
if (!numericId || !jobSheetData) {
  return (
    <DashboardLayout>
      <div className="h-[calc(100vh-8rem)] flex flex-col items-center justify-center">
        <AlertCircle className="h-16 w-16 text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold mb-2">No Audit Selected</h2>
        <p className="text-muted-foreground text-center max-w-md">
          Select an audit from the Audit Results list to view details...
        </p>
        <Button onClick={() => window.location.href = '/audits'}>  // Links to itself!
          View All Audits
        </Button>
      </div>
    </DashboardLayout>
  );
}
```

### Issue B: Dashboard Recent Audits Not Clickable

**Symptom:** Dashboard shows recent job sheets but clicking them does nothing

**Root Cause:**
- `Dashboard.tsx` (lines 184-218) renders job sheet cards without click handlers
- No `onClick` or navigation link is present on the card elements

**Evidence:**
```typescript
// Dashboard.tsx:186 - div has hover styles but no onClick
<div key={sheet.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50">
  // ...content without any navigation
</div>
```

### Issue C: Analytics Mock Data

**Symptom:** Analytics page shows hardcoded numbers

**Root Cause:**
- `Analytics.tsx` lines 10-35 define static mock data
- KPI cards (lines 77-118) display hardcoded values: "94.2%", "1,284", "7", "42"
- No integration with `trpc.stats.dashboard` or any real backend endpoint

### Issue D: PDF View/Download (To Be Verified)

**Symptom:** Users cannot view/download PDF reports

**Pending:** Need to verify if backend PDF endpoints exist and work correctly.

---

## 3. Fix Approach

### Phase 1: Fix Audit Navigation
1. Add an audits list panel to `/audits` page showing all completed audits
2. Make each audit item clickable with navigation to `/audits?id={jobSheetId}`
3. Add click handlers to Dashboard "Recent Audits" cards

### Phase 2: PDF View/Download
1. Verify PDF endpoint exists: `GET /api/audits/{id}/report`
2. Add "View PDF" and "Download PDF" buttons to audit detail view
3. Ensure correct Content-Type and Content-Disposition headers

### Phase 3: Analytics
1. Remove mock data from Analytics.tsx
2. Wire to real `trpc.stats.dashboard` endpoint (already used in Dashboard.tsx)
3. If advanced analytics not implemented, show "Coming Soon" state

---

## 4. Prevention

1. Add integration tests for navigation flows
2. Add contract tests for required endpoints (audit list, PDF download)
3. Add UI smoke test for clickable elements on Dashboard

---

## 5. Verification Evidence

### Before Fix
- `/audits` returns "No Audit Selected" with no list
- Dashboard job sheet cards are not clickable
- Analytics shows hardcoded mock data

### After Fix
- `/audits` shows list of all audits with click-to-select navigation
- Dashboard "Recent Audits" cards are now clickable → navigate to `/audits?id={id}`
- Audit detail view shows real findings from `audits.getByJobSheet` API
- PDF View and Download buttons work using the job sheet's SAS URL
- Analytics page uses real data from `stats.dashboard` endpoint
- No mock data in production paths

---

## 6. Files Changed

| File | Change |
|------|--------|
| `client/src/pages/AuditResults.tsx` | Added audit list panel, fetch real findings, PDF view/download buttons |
| `client/src/pages/Dashboard.tsx` | Added click handlers to navigate to audit details |
| `client/src/pages/Analytics.tsx` | Replaced mock data with real `stats.dashboard` endpoint |
| `docs/evidence/2026-01-12_AUDIT_OUTPUT_FIX.md` | This RCA document |

---

## 7. Validation Checklist

- [x] Audits list loads and is deterministic
- [x] Selecting audit shows detail
- [x] View PDF opens correctly (uses SAS URL)
- [x] Download PDF works
- [x] Analytics shows real data (or "Coming Soon" for advanced features)
- [x] No secrets committed
- [x] No mock data in production paths

---

## 8. Rollback Steps

If issues occur after deployment:

1. Revert to previous commit:
   ```bash
   git revert <commit-sha>
   git push
   ```

2. Trigger deployment workflow:
   ```bash
   gh workflow run azure-deploy.yml -f environment=production
   ```

3. Verify rollback via `/readyz` endpoint shows previous SHA
