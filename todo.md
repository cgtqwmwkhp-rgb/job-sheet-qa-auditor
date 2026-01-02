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
