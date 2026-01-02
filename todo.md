# Job Sheet QA Auditor - TODO

## Phase 1: Frontend Prototype (Completed)
- [x] Global Design System & Layout Upgrade
- [x] Dashboard & Core Navigation Polish
- [x] Analytics Module Refinement
- [x] Operational Pages Polish
- [x] Settings & Admin Polish
- [x] Enable Dark Mode Toggle
- [x] Code Splitting & Performance Optimization
- [x] Interactive Onboarding Tour
- [x] Knowledge Base & Help Center
- [x] Demo Gateway & Role Selection
- [x] Contextual Smart Tips & Guided Actions
- [x] Role-Specific Greetings
- [x] Sample Data Reset
- [x] Interactive Task Highlighting (driver.js)

## Phase 2: Backend Implementation (In Progress)
- [x] Upgrade to Full-Stack (web-db-user)
- [x] Database Schema Design
  - [x] Users table with roles
  - [x] Gold Specs table (versioned rule packs)
  - [x] Job Sheets table
  - [x] Audit Results table
  - [x] Audit Findings table
  - [x] Disputes table
  - [x] Waivers table
  - [x] System Audit Log table
- [x] Database Query Helpers
- [x] API Endpoints (tRPC routers)
  - [x] Auth routes (me, logout)
  - [x] Stats/Dashboard routes
  - [x] Job Sheets CRUD
  - [x] Audit Results routes
  - [x] Gold Specs management
  - [x] Disputes workflow
  - [x] Waivers management
  - [x] Users management
  - [x] Audit Log routes
- [x] Vitest Unit Tests (24 tests passing)

## Phase 3: AI & OCR Integration (Pending)
- [ ] OCR Pipeline Integration
  - [ ] PDF text extraction (embedded text)
  - [ ] Image OCR (Google Vision / Tesseract)
  - [ ] Mixed document handling (HYBRID strategy)
- [ ] LLM Integration for Analysis
  - [ ] Field extraction with AI
  - [ ] Confidence scoring
  - [ ] "Why It Matters" generation
- [ ] Gold Standard Validation Engine
  - [ ] Rule evaluation
  - [ ] Evidence pack generation
  - [ ] Deterministic report generation

## Phase 4: Frontend-Backend Integration (Pending)
- [ ] Connect Dashboard to real API
- [ ] Connect Upload page to real file upload
- [ ] Connect Audit Results to real data
- [ ] Connect Disputes to real workflow
- [ ] Connect Settings to real configuration

## Phase 5: Production Readiness (Pending)
- [ ] End-to-End Testing
- [ ] Performance Optimization
- [ ] Security Audit
- [ ] Documentation

## Phase 4: Frontend-Backend Integration (Complete)
- [x] Connect Dashboard to real stats API
- [x] Connect Upload page to real file upload API
- [x] Connect Audit Results page to real data
- [x] Connect Job Sheets list to real data
- [x] Connect Disputes page to real workflow
- [x] Connect Specs Management to real API
- [x] Connect User Management to real API
- [x] Connect Audit Log to real API
- [x] Connect Settings to real configuration

## Phase 5: OCR & AI Analysis Pipeline
- [x] Implement Mistral OCR service for document text extraction
- [x] Implement Gemini 2.5 analysis service for job sheet validation
- [x] Connect OCR to upload workflow (process endpoint)
- [x] Connect analysis to audit result generation
- [x] Add processing status indicators in UI
- [ ] Test end-to-end pipeline with sample documents

## Phase 6: Enterprise Hardening (Best-in-Class++)

### Error Handling & Resilience
- [x] Implement exponential backoff retry logic for OCR service
- [x] Implement exponential backoff retry logic for AI analyzer
- [x] Add circuit breaker pattern for external API calls
- [x] Create dead letter queue for failed processing jobs
- [x] Add failed job recovery mechanism

### Input Validation & Data Integrity
- [x] Validate file types using magic bytes (not just extension)
- [x] Enforce server-side file size limits
- [x] Implement SHA-256 hash verification post-upload
- [x] Add input sanitization for all user inputs

### Audit Trail Completeness
- [x] Make audit logs append-only (immutable)
- [x] Add correlation IDs to all requests
- [x] Implement PII redaction in logs and reports
- [x] Add request/response logging middleware

### Gold Standard Spec Robustness
- [x] Add JSON Schema validation for spec definitions
- [x] Implement spec version history tracking
- [x] Add spec rollback capability
- [x] Add spec diff comparison

### Testing Infrastructure
- [x] Create integration tests for full OCR → Analysis → DB flow
- [x] Add determinism tests (same input = identical output)
- [ ] Add load testing for batch uploads
- [x] Add boundary tests for all validation rules

### API Contracts & Security
- [x] Add rate limiting to processing endpoints
- [x] Implement webhook notifications for audit completion
- [ ] Generate OpenAPI/Swagger documentation
- [ ] Add API versioning support
