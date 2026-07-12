# System Audit Report - Best-in-Class Review
**Date**: 2026-07-12  
**Audit Scope**: Complete system architecture, integration, code quality, and UX/UI  
**Rounds Completed**: 3 comprehensive reviews

---

## Executive Summary

This job-sheet-qa-auditor system has a **strong foundation** with mature backend processing, sophisticated analytics, and comprehensive parity testing. However, several **architectural gaps** and **incomplete features** prevent it from being truly world-class before adding more templates.

**Overall Assessment by Area:**

| Area | Grade | Status |
|------|-------|--------|
| Backend Pipeline | A- | Production-ready core with some unmounted features |
| Frontend Architecture | C+ | Solid foundation with significant dead code and incomplete flows |
| Testing Infrastructure | B- | Strong contract/parity testing; weak coverage & E2E |
| API Integration | B+ | Well-designed but has authorization gaps |
| UX/UI Quality | C+ | Excellent review workstation; many mock/stub features |
| Code Quality | B | Good patterns with some duplication and drift |

---

## Critical Issues Found (Must Fix Before Adding Templates)

### 🔴 P0 - Architecture & Integration Issues

1. **Duplicate QueryClient in Frontend** ⚠️ CRITICAL
   - `App.tsx` creates a second, unconfigured QueryClient that shadows the main one
   - Risk: Cache inconsistencies, broken React Query behavior
   - Location: `client/src/App.tsx` line 224

2. **Four Stage-5 Routers Not Mounted** 
   - `auditRouter`, `pipelineRouter`, `reviewQueueRouter`, `exportsRouter` exist but unreachable
   - Creates confusion about which API to use (DB-backed vs in-memory)
   - Decision needed: mount them or mark as test-only

3. **Dual Authentication Systems**
   - `AuthContext` uses raw fetch, bypassing tRPC type safety
   - `_core/hooks/useAuth` creates duplicate auth.me requests
   - Risk: Role shape mismatches, unnecessary API calls

4. **Legacy Gold Specs vs Templates Duality**
   - Pipeline uses only `templateRegistry`
   - UI still manages `goldSpecs` table via `specs.*` API
   - `goldSpecId` parameter accepted but ignored (misleading contract)

5. **No Test Coverage Instrumentation**
   - Vitest has no coverage provider configured
   - Line/branch coverage is unknown
   - Risk: Untested code ships silently

### 🟠 P1 - User Experience & Feature Completeness

6. **Mock/Stub Features Presented as Production**
   - Search & Archive page: 100% mock data
   - Technician Portal: Mock stats and job lists
   - Notification settings: Local state only, resets on refresh
   - AI Persona settings: No backend persistence
   - Activity timeline: Hardcoded empty array

7. **Critical Workflows Untested End-to-End**
   - Real OAuth/Entra sign-in not covered by E2E tests
   - Upload → process → review flow not tested end-to-end
   - 32 frontend pages with 0 dedicated tests

8. **Authorization Gaps**
   - Job sheets: Any authenticated user can access/process any job
   - Disputes: API doesn't enforce role checks (client-only restriction)
   - Users: Any user can fetch any user by ID
   - No resource-level ownership checks

9. **Incomplete Webhook System**
   - Full implementation exists but never emits `audit.completed`, `audit.failed`
   - No API to register/manage webhooks
   - In-memory registry lost on restart

10. **Dark Mode Partially Broken**
    - App shell hardcodes light colors (#F9F9F9, #706D6D, #EBE8E8)
    - Sidebar, header won't adapt to theme changes
    - CSS variables defined but not applied consistently

### 🟡 P2 - Code Quality & Maintainability

11. **Significant Dead Code (10+ Unused Components)**
    - `RoiEditor.tsx` + `RoiEditorV2.tsx`
    - `CommandCenter.tsx` (⌘K search)
    - `ManusDialog.tsx`, `FeedbackCockpit.tsx`, `CostCalculator.tsx`
    - `Home.tsx`, `Analytics.tsx`, `ComponentShowcase.tsx`
    - `lib/api.ts` (abandoned abstraction layer)

12. **Sidebar Navigation Permissions Mismatch**
    - Viewers see "User Management" and "Settings" links
    - Clicking leads to 403 error instead of hiding
    - Authorization checks incomplete

13. **Inconsistent Layout Wrapping**
    - Settings and DisputeManagement pages lack `DashboardLayout`
    - Lose navigation chrome when accessed directly

14. **Documentation Drift**
    - CONTRIBUTING.md references non-existent `pnpm lint`
    - REPO_INDEX.md says `pnpm check` runs lint (only runs typecheck)
    - README troubleshooting incomplete

15. **Test Pattern Inconsistencies**
    - ~35% of contract tests are structural (string-matching source files)
    - Give false confidence without executing code
    - High maintenance, low execution value

---

## Detailed Findings by Round

### Round 1: Architecture & Integration Review

#### ✅ **Properly Integrated (Strengths)**

- Express + tRPC server with health, metrics, OAuth endpoints
- MySQL via Drizzle for all production entities
- Full document pipeline: OCR → template selection → Gemini analysis → DB persistence
- Storage adapter factory (Azure Blob / local)
- Async processing with in-memory queue
- Audit actions, audit policy, rate limiting, DLQ
- Comprehensive analytics stack (engineer, cohort, exception, drift, shadow)
- Template registry with boot-seeding

#### ❌ **Missing/Broken Connections**

1. **Stage 5 API Routers**: `auditRouter`, `pipelineRouter`, `reviewQueueRouter`, `exportsRouter` exported but not mounted on `appRouter`
2. **Templates Frontend**: Backend API ready; no client consumption found
3. **Webhooks**: No management API, audit events never fired, in-memory only
4. **Scheduled Jobs**: `ENABLE_SCHEDULER` flag exists but no cron/worker boot
5. **Job Queue**: Not durable (in-memory only, lost on restart)
6. **Gemini Health Check**: Only checks env presence, no live validation like Mistral

#### ⚠️ **Pattern Inconsistencies**

- Mixed error types: `TRPCError` vs raw `Error` in same file
- Dual waiver paths: `waivers.create` vs `auditActions.waive`
- Dual audit APIs: DB `audits.*` vs unmounted in-memory `auditRouter`
- Rate limit helper duplicated across routers
- Comments say "not wired" while code actually imports them

---

### Round 2: Frontend Architecture & UX Review

#### ✅ **Strengths**

- Solid Radix UI component library (consistent primitives)
- Strong composition in `ReviewWorkstationPane` (~1,900 lines, well-structured)
- Type-safe tRPC integration with superjson
- `useAnalyticsFilters` - clean external store pattern
- Keyboard shortcuts for power users (`useReviewQueueKeyboard`)
- Theme system with dark mode toggle

#### ❌ **Component Architecture Issues**

**Duplicate/Dead Components (10+ files):**
- `RoiEditor.tsx` + `RoiEditorV2.tsx` - 0 imports
- `CommandCenter.tsx` - ⌘K search never wired
- `FeedbackCockpit`, `CostCalculator`, `AssetTimeline` - unused
- `Home.tsx`, `Analytics.tsx` - orphaned pages
- `lib/api.ts` - abandoned wrapper with manual types (drift risk)

**Dual Systems:**
- Two tour systems: `OnboardingTour` + `GuidedTour`
- Two query clients: configured in main.tsx + unconfigured in App.tsx
- Two auth systems: `AuthContext` raw fetch + tRPC `useAuth`

#### ❌ **UX Quality Issues**

**Accessibility Gaps:**
- Portal bell button missing aria-label
- Dashboard Enter handler without Space key support
- 403 page has no navigation recovery
- NotFound redirects technicians to staff route

**Responsive Issues:**
- DisputeManagement header may overflow on mobile
- `useIsMobile` hook underutilized (mostly rely on Tailwind breakpoints)

**Loading/Error States:**
- Dashboard shows "..." with no error UI
- Many pages lack query error handling
- No per-route error boundaries

**Form Validation:**
- `react-hook-form` and `zod` installed but **never used**
- Validation is ad-hoc toasts
- No consistent field-level error display

#### ❌ **Incomplete Features (User-Facing)**

- **Search & Archive**: 100% mock data, filters don't query backend
- **Technician Portal**: Mock stats and job lists, no tRPC integration
- **User Invite**: "Coming soon" toast
- **First Fix / AI Analyst / Report Studio**: Placeholder routes
- **Notification Settings**: Local state, resets on refresh
- **AI Persona Settings**: No API persistence
- **Dashboard Activity Timeline**: Empty array hardcoded
- **Dashboard Charts**: Commented out
- **Dispute "View Evidence"**: Button present, no action

---

### Round 3: Testing & Code Quality Review

#### ✅ **Strengths**

- **146 contract tests** covering pipeline, governance, security
- **Mature parity system**: golden datasets, thresholds, provenance, promotion gates
- **14 CI workflows**: comprehensive pipeline (lint, type, unit, E2E, docker, governance)
- **Security-conscious**: safeLogger, PII redaction, contract-verified logging
- **Resilience patterns**: circuit breaker, DLQ, retry all tested
- **Good pre-commit hooks**: lint-staged + typecheck + tests

#### ❌ **Coverage Gaps**

**No Measured Coverage:**
- Vitest has no coverage provider (@vitest/coverage-v8)
- No minimum threshold enforcement
- Line/branch coverage completely unknown

**E2E Weaknesses:**
- Real OAuth/Entra untested (E2E only covers demo gateway)
- Core workflow (upload → process → review) not covered end-to-end
- Analytics pages (10 pages) completely untested
- Review workstation interactions not covered

**Frontend Testing:**
- ~70 application components: 4 test files
- 32 pages: 0 dedicated tests
- React Testing Library available but underutilized

#### ⚠️ **Test Quality Issues**

**Structural vs Behavioral:**
- ~35% of contract tests use `readFileSync` to assert string presence
- Test documentation/intent, not behavior
- High maintenance, can give false confidence

**CI Inconsistencies:**
- `pnpm lint` doesn't exist (CONTRIBUTING.md references it)
- Node 22 in ci.yml, Node 20 in parity.yml
- `validate:pii` and `validate:dataset` exist but not in CI
- Visual regression quarantined indefinitely (non-blocking)
- Load tests always pass (`|| true`)

**Documentation Drift:**
- REPO_INDEX.md understates workflows (3 of 14 listed)
- `pnpm check` misdescribed as "typecheck and lint"
- No frontend testing guide
- No contract test authoring patterns documented

---

## Prioritized Action Plan

### 🔴 Phase 1: Critical Architecture Fixes (Must Do)

**1.1 Fix Duplicate QueryClient**
- [ ] Remove duplicate QueryClientProvider from App.tsx
- [ ] Verify all queries use configured client from main.tsx
- **Risk if not fixed**: Cache corruption, broken refetching

**1.2 Consolidate Authentication**
- [ ] Migrate AuthContext to use trpc.auth.me
- [ ] Remove _core/hooks/useAuth.ts
- [ ] Ensure single source of auth truth
- **Risk if not fixed**: Race conditions, role mismatches

**1.3 Decision: Stage 5 Routers**
- [ ] Either: Wire to DB-backed implementations and mount on appRouter
- [ ] Or: Document as test-only and remove from routers/index.ts exports
- **Recommended**: Option 2 (mark test-only) for speed

**1.4 Add Coverage Instrumentation**
- [ ] Install @vitest/coverage-v8
- [ ] Configure vitest.config.ts with coverage provider
- [ ] Set initial threshold (e.g. 60% on server/services/)
- [ ] Add to CI as blocking gate

**1.5 Fix Authorization Gaps**
- [ ] Add resource-level checks to jobSheets.* operations
- [ ] Enforce role checks in disputes API (not just client)
- [ ] Scope audits.* by uploader/role
- [ ] Align with PDF proxy RBAC pattern

### 🟠 Phase 2: Feature Completion & UX (High Priority)

**2.1 Remove/Fix Mock Features**
- [ ] Search page: Wire to real tRPC endpoint or hide from nav
- [ ] Technician portal: Connect to real APIs or mark as "Demo"
- [ ] Notification settings: Implement backend persistence or remove
- [ ] Remove hardcoded activity timeline empty array

**2.2 Complete Template System Integration**
- [ ] Deprecate or redirect specs.* API to templates
- [ ] Remove goldSpecId parameter from jobSheets.process
- [ ] Update SpecManagement UI to use templates API
- [ ] Document migration path in ADR

**2.3 Fix Dark Mode**
- [ ] Replace hardcoded hex colors in DashboardLayout, AppSidebar
- [ ] Use CSS variables (bg-muted, text-muted-foreground)
- [ ] Test all pages in dark mode
- [ ] Update chart colors to use theme tokens

**2.4 Fix Layout Consistency**
- [ ] Wrap Settings in DashboardLayout
- [ ] Wrap DisputeManagement in DashboardLayout
- [ ] Ensure all staff pages have consistent navigation chrome

**2.5 Fix Sidebar Navigation**
- [ ] Filter User Management from nav for non-admins
- [ ] Filter Settings from nav for viewers
- [ ] Match ProtectedRoute role restrictions

### 🟡 Phase 3: Code Quality & Testing (Important)

**3.1 Remove Dead Code**
- [ ] Delete: RoiEditor.tsx, RoiEditorV2.tsx, PdfPreview.tsx
- [ ] Delete: CommandCenter.tsx, ManusDialog.tsx
- [ ] Delete: FeedbackCockpit, CostCalculator, AssetTimeline
- [ ] Delete: Home.tsx, Analytics.tsx (orphaned)
- [ ] Delete or adopt: lib/api.ts wrapper layer

**3.2 Consolidate Duplicate Systems**
- [ ] Pick one tour system (OnboardingTour or GuidedTour)
- [ ] Remove unused tour implementation
- [ ] Update OnboardingTour to skip "Coming Soon" pages

**3.3 Add Critical E2E Tests**
- [ ] OAuth/Entra sign-in flow
- [ ] Upload → process → review → result full workflow
- [ ] Review workstation interactions (at least smoke test)
- [ ] Analytics pages (at least navigation smoke tests)

**3.4 Add Frontend Unit Tests**
- [ ] ReviewWorkstationPane (most critical component)
- [ ] FileUploader
- [ ] Key analytics chart components
- [ ] DocumentViewer error states

**3.5 Fix CI/Documentation Inconsistencies**
- [ ] Add `pnpm lint` script matching CI ESLint
- [ ] Align Node versions to 22 in all workflows
- [ ] Wire validate:pii into ci.yml governance job
- [ ] Update CONTRIBUTING.md and REPO_INDEX.md
- [ ] Add docs/FRONTEND_TESTING.md guide

### 🔵 Phase 4: Polish & Enhancement (Nice to Have)

**4.1 Complete Webhook System**
- [ ] Emit audit.completed from documentProcessor
- [ ] Emit audit.failed on terminal errors
- [ ] Create webhook management API (admin CRUD)
- [ ] Add DB persistence for webhook configs

**4.2 Improve Error Handling**
- [ ] Replace all `throw new Error` with TRPCError
- [ ] Add query error UI to Dashboard, Disputes, Users, AuditLog
- [ ] Add per-route error boundaries
- [ ] Route ServerError.tsx for 5xx scenarios

**4.3 Form Validation Migration**
- [ ] Adopt react-hook-form + zod for user invite
- [ ] Apply to spec creation forms
- [ ] Apply to dispute resolution
- [ ] Apply to processing settings

**4.4 Accessibility Improvements**
- [ ] Add aria-label to portal bell
- [ ] Add Space key support to clickable lists
- [ ] Improve 403 page with role-aware navigation
- [ ] Add aria-live to status indicators

**4.5 Documentation Improvements**
- [ ] Create docs/api/TRPC_REFERENCE.md
- [ ] Add architecture overview for new contributors
- [ ] Document contract test patterns (behavioral vs structural)
- [ ] Add frontend component testing guide

---

## Risk Assessment

### If Templates Added Before Fixes

**High Risk (P0 issues):**
- Duplicate QueryClient could cause template selection UI bugs
- Auth race conditions could expose wrong templates to wrong roles
- No coverage means template bugs ship undetected
- Authorization gaps mean any user can process any template

**Medium Risk (P1 issues):**
- Template UI might follow mock/stub pattern of existing features
- Dark mode breakage spreads to template management pages
- Template workflows untested end-to-end

**Low Risk (P2 issues):**
- More dead code accumulates
- Documentation becomes more out of date

### Recommended Approach

1. ✅ **Complete Phase 1 (P0)** before any template work
2. ⚠️ **Complete Phase 2.2** (template system cleanup) before adding templates
3. ⚠️ **Implement Phase 2.3** (dark mode) to prevent spreading the problem
4. 📋 **Phase 2.1, 3.1** can run in parallel with template work (cleanup)
5. 📋 **Phase 3.2-3.5** can follow template addition (quality improvements)
6. 📋 **Phase 4** can be ongoing (enhancements)

---

## World-Class Standards Checklist

### ✅ Already World-Class

- [x] Sophisticated document processing pipeline with OCR + AI
- [x] Comprehensive analytics and coaching systems
- [x] Mature parity/governance testing
- [x] Circuit breakers, DLQ, resilience patterns
- [x] PII redaction and secure logging
- [x] Strong tRPC + TypeScript type safety
- [x] Radix UI design system foundation
- [x] Multi-environment deployment (Azure Container Apps)

### ⚠️ Needs Improvement for World-Class

- [ ] **Test coverage**: Currently unknown, need 70%+ with instrumentation
- [ ] **E2E coverage**: Critical paths must be tested
- [ ] **Authorization**: Resource-level checks required
- [ ] **Feature completeness**: Remove mocks or implement fully
- [ ] **Dark mode**: Consistent theme application
- [ ] **API completeness**: Wire or remove orphaned routers
- [ ] **Documentation**: Align with actual codebase state
- [ ] **Dead code**: Clean removal improves maintainability

### 🎯 Gap to World-Class

**Current state**: Strong foundation (B+ overall)  
**World-class target**: A+ across all areas  
**Estimated effort**: ~2-3 weeks of focused work on phases 1-3  
**Risk**: Moderate - architectural issues exist but none are blocking

---

## Recommendations

### Immediate Actions (This Sprint)

1. Fix duplicate QueryClient (30 minutes)
2. Consolidate auth system (4 hours)
3. Add coverage instrumentation (2 hours)
4. Fix sidebar nav permissions (1 hour)
5. Wrap Settings/Disputes in DashboardLayout (1 hour)

### This Week

6. Remove dead code (4 hours)
7. Fix dark mode (6 hours)
8. Add authorization checks (8 hours)
9. Wire validate:pii to CI (1 hour)
10. Update documentation (4 hours)

### Next Week

11. Complete template system migration (8 hours)
12. Add critical E2E tests (12 hours)
13. Add frontend unit tests (8 hours)
14. Fix CI inconsistencies (4 hours)
15. Remove mock features or implement (16 hours)

### Ongoing

- Webhook system completion
- Form validation migration
- Accessibility improvements
- Phase 4 enhancements

---

## Conclusion

This system has **excellent bones** — the core pipeline, analytics, and governance are sophisticated. The main issues are:

1. **Architectural cleanup** needed (auth, QueryClient, dead code)
2. **Feature completion** required (too many mocks/stubs)
3. **Testing gaps** must be filled (coverage, E2E, frontend)
4. **Documentation drift** should be corrected

**Bottom line**: This is a **solid B+ system** that can become **A+ world-class** with 2-3 weeks of focused work on phases 1-3. The system is **safe to use in production** but **should not add more templates** until Phase 1 (P0 fixes) is complete.

---

**Next Step**: Proceed with Phase 1 implementation starting with the duplicate QueryClient fix.
