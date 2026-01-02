# User Acceptance Testing (UAT) Scenarios

## Job Sheet QA Auditor - Complete UAT Test Plan

---

## Test Environment Setup

Before running UAT tests:
1. Ensure test environment is deployed
2. Create test user accounts for each role
3. Prepare test documents (PDFs)
4. Clear any existing test data

---

## Role-Based Test Scenarios

### Admin / QA Lead Role

#### UAT-001: Login and Dashboard Access
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to application URL | Demo Gateway displays |
| 2 | Click "Enter as Admin" | Dashboard loads |
| 3 | Verify KPIs display | All KPI cards show data |
| 4 | Verify navigation | All menu items accessible |

**Pass Criteria:** Dashboard loads within 3 seconds, all KPIs visible

#### UAT-002: Document Upload (Single)
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to Upload page | Upload interface displays |
| 2 | Drag PDF file to upload zone | File appears in queue |
| 3 | Click "Upload" | Progress indicator shows |
| 4 | Wait for processing | Status changes to "Complete" |
| 5 | View audit results | Extracted fields visible |

**Pass Criteria:** Document processed within 60 seconds, fields extracted

#### UAT-003: Document Upload (Batch)
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to Upload page | Upload interface displays |
| 2 | Select 5 PDF files | All files appear in queue |
| 3 | Click "Upload All" | Batch processing starts |
| 4 | Monitor progress | Each file shows status |
| 5 | Verify all complete | All 5 documents processed |

**Pass Criteria:** All documents processed, no failures

#### UAT-004: Audit Results Review
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to Audit Results | Results list displays |
| 2 | Filter by status "FAIL" | Only failed audits show |
| 3 | Click on an audit | Detail view opens |
| 4 | Review findings | Findings with severity visible |
| 5 | View evidence | Raw text and confidence shown |

**Pass Criteria:** Findings display correctly with evidence

#### UAT-005: Dispute Creation
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open failed audit | Audit details display |
| 2 | Click "Create Dispute" | Dispute form opens |
| 3 | Enter dispute reason | Form accepts input |
| 4 | Submit dispute | Confirmation message |
| 5 | Verify in Disputes list | New dispute appears |

**Pass Criteria:** Dispute created and visible in list

#### UAT-006: Dispute Resolution
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to Disputes | Disputes list displays |
| 2 | Open pending dispute | Dispute details show |
| 3 | Review evidence | All information visible |
| 4 | Click "Approve" or "Reject" | Resolution form opens |
| 5 | Enter resolution notes | Form accepts input |
| 6 | Submit resolution | Status updates |

**Pass Criteria:** Dispute status changes, audit log updated

#### UAT-007: Gold Standard Spec Management
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to Spec Management | Specs list displays |
| 2 | Click "Create New Spec" | Spec editor opens |
| 3 | Define required fields | Fields added to spec |
| 4 | Set severity levels | Severities configured |
| 5 | Save spec | Spec saved successfully |
| 6 | Activate spec | Spec becomes active |

**Pass Criteria:** New spec active and used for processing

#### UAT-008: User Management
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to Users | User list displays |
| 2 | View user details | User info visible |
| 3 | Change user role | Role selector works |
| 4 | Save changes | Role updated |
| 5 | Verify in audit log | Change logged |

**Pass Criteria:** Role change persists, audit trail exists

#### UAT-009: Processing Settings
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to Settings | Settings page loads |
| 2 | Go to Processing tab | Processing settings show |
| 3 | Toggle LLM Fallback | Toggle responds |
| 4 | Adjust confidence threshold | Slider works |
| 5 | Save settings | Settings persisted |
| 6 | Upload document | New settings applied |

**Pass Criteria:** Settings affect document processing

#### UAT-010: Analytics Review
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to Analytics | Analytics page loads |
| 2 | Select date range | Data filters |
| 3 | View trend charts | Charts render |
| 4 | Export data | CSV downloads |

**Pass Criteria:** Analytics accurate, export works

---

### Technician Role

#### UAT-011: Technician Portal Access
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to application | Demo Gateway displays |
| 2 | Click "Enter as Technician" | Technician portal loads |
| 3 | Verify limited navigation | Only allowed pages visible |

**Pass Criteria:** Technician sees restricted view

#### UAT-012: View Own Job Sheets
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to Job Sheets | Own job sheets display |
| 2 | Filter by date | Results filter correctly |
| 3 | View job sheet details | Details accessible |

**Pass Criteria:** Only own job sheets visible

#### UAT-013: Submit Dispute (Technician)
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | View failed audit | Audit details show |
| 2 | Click "Dispute Finding" | Dispute form opens |
| 3 | Enter justification | Form accepts input |
| 4 | Submit | Dispute created |

**Pass Criteria:** Technician can dispute own findings

---

## Edge Case Scenarios

#### UAT-020: Empty PDF Upload
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Upload empty PDF | Error message displays |
| 2 | Verify no crash | System remains stable |

**Pass Criteria:** Graceful error handling

#### UAT-021: Corrupt PDF Upload
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Upload corrupt PDF | Error message displays |
| 2 | Verify error logged | Error in audit log |

**Pass Criteria:** System handles gracefully

#### UAT-022: Large File Upload (50MB)
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Upload 50MB PDF | Upload starts |
| 2 | Monitor progress | Progress shows |
| 3 | Verify completion | File processed |

**Pass Criteria:** Large file handled within timeout

#### UAT-023: Concurrent Uploads
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open 3 browser tabs | All tabs functional |
| 2 | Upload file in each | All uploads start |
| 3 | Verify all complete | No conflicts |

**Pass Criteria:** Concurrent uploads work

#### UAT-024: Session Timeout
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Login to system | Dashboard loads |
| 2 | Wait for session timeout | Session expires |
| 3 | Attempt action | Redirect to login |

**Pass Criteria:** Graceful session handling

#### UAT-025: Network Interruption
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Start file upload | Upload in progress |
| 2 | Disconnect network | Error message shows |
| 3 | Reconnect | Can retry upload |

**Pass Criteria:** No data loss, retry works

---

## Performance Scenarios

#### UAT-030: Dashboard Load Time
| Metric | Target | Acceptable |
|--------|--------|------------|
| Initial Load | < 2s | < 3s |
| Data Refresh | < 1s | < 2s |

#### UAT-031: Document Processing Time
| Document Type | Target | Acceptable |
|---------------|--------|------------|
| Single Page PDF | < 10s | < 30s |
| Multi-Page PDF (10 pages) | < 30s | < 60s |
| Scanned Document | < 45s | < 90s |

#### UAT-032: Search Response Time
| Query Type | Target | Acceptable |
|------------|--------|------------|
| Simple filter | < 500ms | < 1s |
| Complex search | < 1s | < 2s |

---

## Security Scenarios

#### UAT-040: Unauthorized Access Attempt
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Login as Technician | Technician portal loads |
| 2 | Manually navigate to /admin | Access denied |
| 3 | Verify no data exposed | Error page shows |

**Pass Criteria:** Authorization enforced

#### UAT-041: SQL Injection Attempt
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Enter SQL in search field | Query sanitized |
| 2 | Verify no database error | Normal error message |

**Pass Criteria:** Input sanitized

#### UAT-042: XSS Attempt
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Enter script tag in form | Input escaped |
| 2 | Verify script not executed | No alert/redirect |

**Pass Criteria:** XSS prevented

---

## Sign-Off

### Test Execution Summary

| Category | Total | Passed | Failed | Blocked |
|----------|-------|--------|--------|---------|
| Admin Scenarios | 10 | | | |
| Technician Scenarios | 3 | | | |
| Edge Cases | 6 | | | |
| Performance | 3 | | | |
| Security | 3 | | | |
| **Total** | **25** | | | |

### Approval

| Role | Name | Date | Signature |
|------|------|------|-----------|
| QA Lead | | | |
| Product Owner | | | |
| Tech Lead | | | |

---

*Document Version: 1.0*
*Last Updated: January 2026*
