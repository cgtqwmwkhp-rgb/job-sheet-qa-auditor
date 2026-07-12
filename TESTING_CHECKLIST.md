# Testing Checklist - PR #275
**Feature**: Security Hardening & Operational Infrastructure  
**Environment**: Staging → Production  
**Prepared**: 2026-07-12

---

## 🎯 Testing Scope

This release includes **major security and infrastructure changes**. All tests must pass before production deployment.

### Changes Under Test
- ✅ Object-level authorization (30+ access control points)
- ✅ Database foreign keys (30+ relationships)
- ✅ Performance indexes (30+ indexes)
- ✅ Timeout protection (5 operation types)
- ✅ File upload validation (magic bytes, sanitization)
- ✅ CSRF protection framework
- ✅ Request logging middleware
- ✅ React error boundaries
- ✅ Batch operations for QA leads
- ✅ Transaction utilities

---

## 🧪 Test Categories

### Priority Levels
- **P0 (Blocker)**: Must pass for production deployment
- **P1 (Critical)**: Should pass; document any failures
- **P2 (Important)**: Nice to have; can be addressed post-deployment

---

## P0: Critical Path Tests

### 1. Authentication & Authorization ⚠️ SECURITY CRITICAL

#### 1.1 User Access Control
**Test**: Regular user can only see their own data

```bash
# Setup: Login as regular user (role: user)
# Navigate to: Dashboard

Expected Results:
✓ Only sees job sheets they uploaded
✓ Cannot see other users' documents
✓ Cannot access admin functions
✓ Cannot access QA lead batch operations
```

**Test Cases**:
- [ ] User A uploads document → User A can see it
- [ ] User A uploads document → User B CANNOT see it
- [ ] User tries to access `/api/trpc/jobSheets.get?id=<other_user_id>` → 403 Forbidden
- [ ] User tries to view audit for other user's document → 403 Forbidden

**Verification SQL**:
```sql
-- Check job sheets belong to correct users
SELECT id, uploadedBy, fileName 
FROM job_sheets 
WHERE uploadedBy != <current_user_id>;
-- User should not see any results for other users
```

#### 1.2 QA Lead Permissions
**Test**: QA leads have elevated access

```bash
# Setup: Login as QA lead (role: qa_lead)
# Navigate to: Dashboard

Expected Results:
✓ Can see ALL job sheets (all users)
✓ Has access to "Batch Operations" menu
✓ Can update job sheet status
✓ Can approve/reject findings in batch
```

**Test Cases**:
- [ ] QA lead sees job sheets from multiple users
- [ ] QA lead can access batch approve function
- [ ] QA lead can update dispute status
- [ ] QA lead can export audit data

#### 1.3 Admin Access
**Test**: Admins have full access

```bash
# Setup: Login as admin (role: admin)
# Navigate to: Admin panel

Expected Results:
✓ Can see all data
✓ Can access user management
✓ Can view system audit log
✓ Can access platform config
```

---

### 2. Data Integrity (Foreign Keys) ⚠️ DATABASE CRITICAL

#### 2.1 Orphaned Data Prevention
**Test**: Foreign keys prevent orphaned records

**Test Case 1**: Cannot delete user with job sheets
```sql
-- Try to delete user who has uploaded documents
DELETE FROM users WHERE id = <user_with_documents>;
-- Expected: ERROR - foreign key constraint fails
```

**Test Case 2**: Cascade delete works correctly
```sql
-- Delete a job sheet
DELETE FROM job_sheets WHERE id = <test_id>;

-- Verify cascading
SELECT COUNT(*) FROM audit_results WHERE jobSheetId = <test_id>;
-- Expected: 0 (cascaded delete)

SELECT COUNT(*) FROM audit_findings WHERE auditResultId IN 
  (SELECT id FROM audit_results WHERE jobSheetId = <test_id>);
-- Expected: 0 (cascaded delete)
```

**Test Cases**:
- [ ] Delete job sheet → associated audits deleted ✓
- [ ] Delete job sheet → associated findings deleted ✓
- [ ] Cannot delete user with uploads → error ✓
- [ ] Cannot delete gold spec in use → error ✓
- [ ] Cannot orphan a dispute → error ✓

#### 2.2 Referential Integrity
**Test**: All foreign key relationships valid

```sql
-- Check for orphaned audit results
SELECT COUNT(*) FROM audit_results ar
LEFT JOIN job_sheets js ON ar.jobSheetId = js.id
WHERE js.id IS NULL;
-- Expected: 0

-- Check for orphaned findings
SELECT COUNT(*) FROM audit_findings af
LEFT JOIN audit_results ar ON af.auditResultId = ar.id
WHERE ar.id IS NULL;
-- Expected: 0

-- Check for orphaned disputes
SELECT COUNT(*) FROM disputes d
LEFT JOIN audit_findings af ON d.auditFindingId = af.id
WHERE af.id IS NULL;
-- Expected: 0
```

---

### 3. Core User Flows 🎯 FUNCTIONALITY

#### 3.1 Document Upload & Processing
**Test**: Complete document lifecycle

**Steps**:
1. Login as regular user
2. Navigate to Upload page
3. Select a PDF document
4. Click "Upload"
5. Wait for processing

**Expected Results**:
- [ ] File upload succeeds (with validation)
- [ ] Processing starts automatically
- [ ] Status updates to "processing"
- [ ] OCR extraction completes
- [ ] AI audit runs
- [ ] Status updates to "completed"
- [ ] Audit results visible
- [ ] No errors in logs

**Duration**: ~30-60 seconds per document

#### 3.2 File Upload Validation
**Test**: Malicious/invalid files rejected

**Test Cases**:
- [ ] Upload .exe file renamed to .pdf → **REJECTED** (magic byte mismatch)
- [ ] Upload file > 10MB → **REJECTED** (size limit)
- [ ] Upload file with path traversal name `../../etc/passwd.pdf` → **SANITIZED**
- [ ] Upload valid PDF → **ACCEPTED**
- [ ] Upload image (JPG) → **ACCEPTED**

**Verification**:
```bash
# Check file validation logs
az containerapp logs show \
  --name jobsheet-qa-staging \
  --resource-group plantex-assist \
  --tail 100 | grep "File validation"
```

#### 3.3 Audit Results Review
**Test**: QA lead reviews audit results

**Steps**:
1. Login as QA lead
2. Navigate to document with completed audit
3. View findings
4. Approve/reject findings
5. Export results

**Expected Results**:
- [ ] All findings displayed correctly
- [ ] Can approve individual findings
- [ ] Can reject with reason
- [ ] Can export to CSV/PDF
- [ ] Actions logged in audit trail

---

### 4. Concurrent Operations 🔒 RACE CONDITION TESTS

#### 4.1 Reprocess Prevention
**Test**: Cannot reprocess while processing

**Steps**:
1. Start document processing
2. While status = "processing", click "Reprocess"

**Expected Results**:
- [ ] Reprocess button is **DISABLED**
- [ ] If API called directly → 409 CONFLICT error
- [ ] Error message: "Cannot reprocess: document is currently being processed"

**Verification**:
```bash
# Simulate concurrent reprocess
curl -X POST https://.../api/trpc/jobSheets.reprocess \
  -H "Content-Type: application/json" \
  -d '{"id": <processing_doc_id>}'
# Expected: HTTP 409 Conflict
```

#### 4.2 Process Prevention
**Test**: Cannot start processing if already processing

**Steps**:
1. Upload document (starts processing)
2. Try to call process API again immediately

**Expected Results**:
- [ ] Second call → 409 CONFLICT
- [ ] Only one processing job in queue
- [ ] No duplicate audit results created

---

### 5. Performance & Timeouts ⏱️ RELIABILITY

#### 5.1 Long-Running Operations
**Test**: Operations timeout appropriately

**Test Cases**:
- [ ] Document processing > 5 minutes → timeout, status → "failed"
- [ ] OCR > 2 minutes → timeout with error
- [ ] AI analysis > 3 minutes → timeout with error
- [ ] Upload > 30 seconds → timeout

**Verification**:
```bash
# Check for timeout protection in logs
az containerapp logs show ... | grep "TimeoutError"
```

#### 5.2 Database Query Performance
**Test**: Indexes improve query speed

**Before Indexes (baseline from old version)**:
```sql
EXPLAIN SELECT * FROM job_sheets WHERE status = 'processing';
-- Note: rows scanned
```

**After Indexes**:
```sql
EXPLAIN SELECT * FROM job_sheets WHERE status = 'processing';
-- Expected: Uses index, fewer rows scanned
```

**Test Cases**:
- [ ] Query by status uses index
- [ ] Query by uploadedBy uses index
- [ ] Query by createdAt range uses index
- [ ] Composite queries use indexes

---

## P1: Critical Features

### 6. Batch Operations (QA Leads)

#### 6.1 Bulk Approve Findings
**Test**: QA lead approves multiple findings at once

**Steps**:
1. Login as QA lead
2. Navigate to document with multiple findings
3. Select 5+ findings
4. Click "Approve Selected"

**Expected Results**:
- [ ] All selected findings marked as "approved"
- [ ] Resolution status updated in database
- [ ] Audit trail logged for each
- [ ] UI updates immediately
- [ ] Cache invalidated correctly

#### 6.2 Bulk Waive Findings
**Test**: QA lead waives findings with reason

**Steps**:
1. Select multiple findings
2. Click "Waive"
3. Enter reason + expiration date
4. Submit

**Expected Results**:
- [ ] Waivers created for each finding
- [ ] Audit trail includes reason
- [ ] Expiration date stored
- [ ] Findings marked as "waived"

---

### 7. Error Handling & Boundaries 🛡️ RESILIENCE

#### 7.1 React Error Boundaries
**Test**: UI errors don't crash the app

**Simulate Errors**:
- [ ] Corrupt API response → Error boundary shows fallback UI
- [ ] Network timeout → Error boundary catches, user can retry
- [ ] Invalid data in state → Error boundary prevents white screen

**Verification**:
```javascript
// Check error boundary is rendered
// Look for "Something went wrong" fallback UI
```

#### 7.2 Request Logging
**Test**: All requests logged with context

**Expected in Logs**:
- [ ] Request ID present
- [ ] User ID logged (if authenticated)
- [ ] Duration logged
- [ ] Status code logged
- [ ] Errors logged with stack trace
- [ ] No sensitive data (passwords, tokens) in logs

**Verification**:
```bash
az containerapp logs show ... | grep "reqId"
# Should see structured logs with correlation IDs
```

---

### 8. CSRF Protection 🔐 SECURITY

#### 8.1 CSRF Token Validation
**Test**: State-changing operations require valid token

**Test Cases**:
- [ ] POST without CSRF token → 403 Forbidden
- [ ] POST with invalid token → 403 Forbidden
- [ ] POST with valid token → Success
- [ ] GET requests don't require token (read-only)

**Verification**:
```bash
# Try mutation without token
curl -X POST https://.../api/trpc/jobSheets.upload \
  -H "Content-Type: application/json" \
  -d '{"data": "..."}'
# Expected: 403 (if CSRF enabled)
```

---

### 9. Cache Invalidation 🔄 DATA CONSISTENCY

#### 9.1 TanStack Query Cache
**Test**: Cache updates after mutations

**Steps**:
1. View dashboard (caches job sheets list)
2. Upload new document
3. Dashboard should auto-refresh

**Expected Results**:
- [ ] New document appears immediately
- [ ] No manual refresh needed
- [ ] Cache invalidated correctly

**Test Cases**:
- [ ] Upload → invalidates `jobSheets.list`
- [ ] Process → invalidates `audits.getByJobSheet`
- [ ] Approve finding → invalidates `audits.getFindings`
- [ ] Update status → invalidates relevant queries

---

## P2: Important Features

### 10. Transaction Utilities 💾 DATA INTEGRITY

#### 10.1 Atomic Operations
**Test**: Multi-step operations are atomic

**Test Case**: Create audit with findings
```javascript
// If audit creation succeeds but findings fail
// Entire operation should rollback
```

**Expected**:
- [ ] Either both succeed or both fail
- [ ] No partial data in database
- [ ] Error logged with transaction context

---

### 11. UI/UX Improvements 🎨 USER EXPERIENCE

#### 11.1 Loading States
**Test**: User feedback during operations

- [ ] Upload shows progress bar
- [ ] Processing shows spinner
- [ ] Button shows "Loading..." state
- [ ] Skeleton loaders for data fetching

#### 11.2 Error Messages
**Test**: User-friendly error messages

- [ ] Authorization error → "You don't have permission"
- [ ] Validation error → Specific field mentioned
- [ ] Network error → "Connection lost, retrying..."
- [ ] Server error → "Something went wrong, try again"

---

## 📊 Test Execution

### Test Environment
- **URL**: https://jobsheet-qa-staging.happydesert-4448b4c0.uksouth.azurecontainerapps.io
- **Database**: jobsheet_qa_staging
- **Version**: 0b4fe31a9033cdf46083971f6d0124005a87f71f

### Test Data
- **Test Users**:
  - Regular user: `test-user@example.com`
  - QA Lead: `test-qalead@example.com`
  - Admin: `test-admin@example.com`
- **Test Documents**: 5-10 sample PDFs
- **Test Scenarios**: Real-world workflows

### Success Criteria
- **P0 Tests**: 100% pass rate (blocking)
- **P1 Tests**: ≥ 95% pass rate
- **P2 Tests**: ≥ 80% pass rate

---

## 📝 Test Report Template

```markdown
## Test Execution Report
**Date**: YYYY-MM-DD
**Tester**: [Name]
**Environment**: Staging
**Build**: 0b4fe31

### P0 Results: X/Y Passed (Z%)
- Authentication: ✅ PASS
- Foreign Keys: ✅ PASS
- Core Flows: ✅ PASS
- Race Conditions: ✅ PASS
- Performance: ✅ PASS

### P1 Results: X/Y Passed (Z%)
[Details]

### P2 Results: X/Y Passed (Z%)
[Details]

### Issues Found:
1. [Issue description]
2. [Issue description]

### Recommendation:
☐ READY FOR PRODUCTION
☐ NEEDS FIXES BEFORE PRODUCTION
☐ BLOCKED
```

---

**Prepared by**: Cursor Cloud Agent  
**Last Updated**: 2026-07-12  
**Status**: Ready for Execution
