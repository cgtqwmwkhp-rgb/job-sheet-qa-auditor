# End-to-End Flow Map

## Complete User Journey: Upload → Audit Result

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           USER JOURNEY                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. USER VISITS APP                                                          │
│     │                                                                        │
│     ▼                                                                        │
│  ┌──────────────────────────────────────────────────────────┐               │
│  │ Azure Easy Auth (Ingress Level)                          │               │
│  │ - Checks for auth cookie/token                           │               │
│  │ - If missing: Redirect to /.auth/login/aad               │               │
│  │ - If present: Add X-MS-CLIENT-PRINCIPAL header           │               │
│  └──────────────────────────────────────────────────────────┘               │
│     │                                                                        │
│     ▼                                                                        │
│  2. FRONTEND LOADS                                                           │
│     File: client/src/App.tsx                                                 │
│     │                                                                        │
│     ▼                                                                        │
│  ┌──────────────────────────────────────────────────────────┐               │
│  │ AuthContext.tsx                                           │               │
│  │ - Calls /api/trpc/auth.me to get user                    │               │
│  │ - Sets user in React context                              │               │
│  └──────────────────────────────────────────────────────────┘               │
│     │                                                                        │
│     ▼                                                                        │
│  3. USER NAVIGATES TO UPLOAD PAGE                                            │
│     File: client/src/pages/Upload.tsx                                        │
│     │                                                                        │
│     ▼                                                                        │
│  4. USER UPLOADS DOCUMENT                                                    │
│     │                                                                        │
│     ▼                                                                        │
│  ┌──────────────────────────────────────────────────────────┐               │
│  │ tRPC Mutation: jobSheets.upload                          │               │
│  │ File: server/routers.ts:upload                            │               │
│  │                                                           │               │
│  │ Steps:                                                    │               │
│  │ a) Authenticate via ctx.user (from context.ts)           │               │
│  │ b) Save file to Azure Blob Storage                        │               │
│  │ c) Create jobSheet record in DB                           │               │
│  │ d) Trigger processJobSheet()                              │               │
│  └──────────────────────────────────────────────────────────┘               │
│     │                                                                        │
│     ▼                                                                        │
│  5. DOCUMENT PROCESSING PIPELINE                                             │
│     File: server/services/documentProcessor.ts                               │
│     │                                                                        │
│     ├─► 5a. OCR EXTRACTION                                                   │
│     │   File: server/services/ocr.ts                                         │
│     │   - Calls Mistral OCR API                                              │
│     │   - Returns markdown text per page                                     │
│     │                                                                        │
│     ├─► 5b. TEMPLATE SELECTION                                               │
│     │   File: server/services/templateSelector/selectorService.ts            │
│     │   - Tokenizes extracted text                                           │
│     │   - Scores against registered templates                                │
│     │   - Single-template mode bypass (default catch-all)                    │
│     │                                                                        │
│     ├─► 5c. AI ANALYSIS                                                      │
│     │   File: server/services/analyzer.ts                                    │
│     │   - Sends text + GoldSpec to Gemini                                    │
│     │   - Returns findings, score, extracted fields                          │
│     │                                                                        │
│     └─► 5d. PERSIST AUDIT RESULT                                             │
│         File: server/db.ts                                                   │
│         - Creates auditResult record                                         │
│         - Links to jobSheet                                                  │
│     │                                                                        │
│     ▼                                                                        │
│  6. USER VIEWS AUDIT RESULTS                                                 │
│     File: client/src/pages/AuditResults.tsx                                  │
│     │                                                                        │
│     ▼                                                                        │
│  ┌──────────────────────────────────────────────────────────┐               │
│  │ tRPC Query: jobSheets.get                                 │               │
│  │ File: server/routers.ts:get                               │               │
│  │                                                           │               │
│  │ Returns:                                                  │               │
│  │ - jobSheet metadata                                       │               │
│  │ - fileUrl (Azure Blob SAS URL)                            │               │
│  │ - auditResult with findings                               │               │
│  └──────────────────────────────────────────────────────────┘               │
│     │                                                                        │
│     ▼                                                                        │
│  7. DOCUMENT VIEWER RENDERS PDF                                              │
│     File: client/src/components/DocumentViewer.tsx                           │
│     - Loads PDF from SAS URL                                                 │
│     - Overlays bounding boxes for findings                                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Key File Paths

### Authentication
| Component | File | Function |
|-----------|------|----------|
| Context Creation | `server/_core/context.ts` | `createContext()` |
| SDK Auth | `server/_core/sdk.ts` | `authenticateRequest()` |
| Azure Header Parse | `server/_core/sdk.ts` | Lines 283-312 |
| Frontend Auth | `client/src/contexts/AuthContext.tsx` | `checkAuth()` |

### Upload & Processing
| Component | File | Function |
|-----------|------|----------|
| Upload Mutation | `server/routers.ts` | `jobSheets.upload` |
| Storage Adapter | `server/storage/azureAdapter.ts` | `put()`, `get()` |
| Document Processor | `server/services/documentProcessor.ts` | `processJobSheet()` |
| OCR Service | `server/services/ocr.ts` | `extractTextFromDocument()` |
| Template Selector | `server/services/templateSelector/selectorService.ts` | `selectTemplate()` |
| AI Analyzer | `server/services/analyzer.ts` | `analyzeJobSheet()` |

### Data Persistence
| Component | File | Function |
|-----------|------|----------|
| Job Sheet CRUD | `server/db.ts` | `createJobSheet()`, `getJobSheet()` |
| Audit Result | `server/db.ts` | `createAuditResult()` |
| User Management | `server/db.ts` | `upsertUser()`, `getUserByOpenId()` |

### UI Components
| Component | File |
|-----------|------|
| Upload Page | `client/src/pages/Upload.tsx` |
| Audit Results | `client/src/pages/AuditResults.tsx` |
| Document Viewer | `client/src/components/DocumentViewer.tsx` |
| Dashboard | `client/src/pages/Dashboard.tsx` |
