# API Documentation

**Job Sheet QA Auditor - tRPC API Reference**

Version: 1.0  
Last Updated: 2026-07-12

---

## Table of Contents

- [Authentication](#authentication)
- [Job Sheets](#job-sheets)
- [Audits](#audits)
- [Users](#users)
- [Specifications](#specifications)
- [Disputes](#disputes)
- [Batch Operations](#batch-operations)
- [Analytics](#analytics)
- [Error Handling](#error-handling)

---

## Authentication

### Get Current User

```typescript
const user = await trpc.auth.me.query();
// Returns: { id, openId, name, email, role, createdAt }
```

### Logout

```typescript
await trpc.auth.logout.mutate();
// Clears session cookie
```

---

## Job Sheets

### List Job Sheets

**Endpoint**: `trpc.jobSheets.list`  
**Auth**: Protected (any authenticated user)  
**Returns**: Array of job sheets (filtered by access level)

```typescript
// Basic list
const jobSheets = await trpc.jobSheets.list.query();

// With filters
const filtered = await trpc.jobSheets.list.query({
  status: "completed",
  limit: 20,
  offset: 0,
});

// Response:
[
  {
    id: 1,
    referenceNumber: "JS-001",
    fileName: "audit-report.pdf",
    status: "completed",
    uploadedBy: 5,
    createdAt: "2026-07-01T10:00:00Z",
  },
];
```

### Get Job Sheet

**Endpoint**: `trpc.jobSheets.get`  
**Auth**: Protected + Object-level authorization

```typescript
const jobSheet = await trpc.jobSheets.get.query({ id: 123 });

// Response:
{
  id: 123,
  referenceNumber: "JS-123",
  fileName: "document.pdf",
  fileType: "application/pdf",
  fileSizeBytes: 1048576,
  status: "completed",
  uploadedBy: 5,
  technicianId: 10,
  siteInfo: "Site A",
  createdAt: "2026-07-01T10:00:00Z"
}
```

### Upload Job Sheet

**Endpoint**: `trpc.jobSheets.upload`  
**Auth**: Protected  
**Rate Limit**: 10 uploads per minute per user

```typescript
// Convert file to base64
const fileBase64 = await fileToBase64(file);

const result = await trpc.jobSheets.upload.mutate({
  fileName: "audit-report.pdf",
  fileType: "application/pdf",
  fileBase64: fileBase64,
  referenceNumber: "JS-001", // optional
  siteInfo: "Site A", // optional
  technicianId: 10, // optional
});

// Response:
{
  id: 123,
  fileUrl: "https://storage.../audit-report.pdf",
  status: "pending"
}
```

### Process Job Sheet

**Endpoint**: `trpc.jobSheets.process`  
**Auth**: Protected  
**Rate Limit**: 5 processes per minute per user

```typescript
const result = await trpc.jobSheets.process.mutate({
  id: 123,
  goldSpecId: 5, // optional
});

// Response:
{
  id: 456, // audit result ID
  jobSheetId: 123,
  result: "pass",
  reportJson: { /* audit data */ }
}
```

### Reprocess Job Sheet

**Endpoint**: `trpc.jobSheets.reprocess`  
**Auth**: Protected  
**Prevents**: Concurrent processing

```typescript
await trpc.jobSheets.reprocess.mutate({ id: 123 });

// Error if already processing:
// TRPCError: "Cannot reprocess: document is currently being processed"
```

### Get Processing Status

**Endpoint**: `trpc.jobSheets.processStatus`  
**Auth**: Protected  
**Use**: Real-time progress tracking

```typescript
const status = await trpc.jobSheets.processStatus.query({ id: 123 });

// Response:
{
  stage: "ai_analysis", // "ocr" | "extraction" | "ai_analysis" | "complete"
  progress: 75,
  message: "Analyzing document...",
  startedAt: "2026-07-01T10:00:00Z"
}
```

---

## Audits

### List Audit Results

**Endpoint**: `trpc.audits.list`  
**Auth**: Protected (filtered by access)

```typescript
const audits = await trpc.audits.list.query({
  result: "fail", // optional: "pass" | "fail" | "review_queue"
  limit: 50,
  offset: 0,
});
```

### Get Audit by Job Sheet

**Endpoint**: `trpc.audits.getByJobSheet`  
**Auth**: Protected + Object-level authorization

```typescript
const audit = await trpc.audits.getByJobSheet.query({
  jobSheetId: 123
});

// Response:
{
  id: 456,
  jobSheetId: 123,
  result: "fail",
  reportJson: { /* detailed audit */ },
  createdAt: "2026-07-01T10:05:00Z"
}
```

### Get Findings

**Endpoint**: `trpc.audits.getFindings`  
**Auth**: Protected + Object-level authorization

```typescript
const findings = await trpc.audits.getFindings.query({
  auditResultId: 456,
});

// Response:
[
  {
    id: 789,
    severity: "S1", // S0 (critical) | S1 (major) | S2 (minor) | S3 (info)
    reasonCode: "MISSING_FIELD",
    fieldName: "customer_signature",
    expectedValue: "signature",
    actualValue: null,
    resolutionStatus: "open",
  },
];
```

---

## Users

### List Users (Admin Only)

**Endpoint**: `trpc.users.list`  
**Auth**: Admin only

```typescript
const users = await trpc.users.list.query();

// Response:
[
  {
    id: 5,
    openId: "user-123",
    name: "John Doe",
    email: "john@example.com",
    role: "qa_lead",
    createdAt: "2026-01-01T00:00:00Z",
  },
];
```

### Create User (Admin Only)

**Endpoint**: `trpc.users.create`  
**Auth**: Admin only

```typescript
const result = await trpc.users.create.mutate({
  openId: "user-456",
  name: "Jane Smith",
  email: "jane@example.com",
  role: "user", // "user" | "admin" | "qa_lead" | "technician"
});

// Response:
{ id: 10, success: true }
```

### Update User (Admin Only)

**Endpoint**: `trpc.users.update`  
**Auth**: Admin only

```typescript
await trpc.users.update.mutate({
  id: 10,
  name: "Jane Doe", // optional
  email: "jane.doe@example.com", // optional
  role: "qa_lead", // optional
});
```

### Update User Role (Admin Only)

**Endpoint**: `trpc.users.updateRole`  
**Auth**: Admin only

```typescript
await trpc.users.updateRole.mutate({
  id: 10,
  role: "qa_lead",
});
```

---

## Specifications

### List Specifications

**Endpoint**: `trpc.specs.list`  
**Auth**: Protected

```typescript
const specs = await trpc.specs.list.query();

// Response:
[
  {
    id: 1,
    name: "Standard Audit Spec",
    version: "1.0.0",
    isActive: true,
    specType: "base", // "base" | "client" | "contract" | "workType"
    createdAt: "2026-01-01T00:00:00Z",
  },
];
```

### Create Specification (Admin Only)

**Endpoint**: `trpc.specs.create`  
**Auth**: Admin only

```typescript
await trpc.specs.create.mutate({
  name: "Custom Audit Spec",
  version: "2.0.0",
  description: "Enhanced audit rules",
  schema: {
    rules: [
      /* validation rules */
    ],
  },
  specType: "client",
  parentSpecId: 1, // optional: inherit from parent
});
```

### Activate Specification (Admin Only)

**Endpoint**: `trpc.specs.activate`  
**Auth**: Admin only

```typescript
await trpc.specs.activate.mutate({ id: 5 });
// Deactivates other specs of the same type
```

---

## Disputes

### Create Dispute

**Endpoint**: `trpc.disputes.create`  
**Auth**: Protected (typically technicians)

```typescript
await trpc.disputes.create.mutate({
  auditFindingId: 789,
  reason: "The signature was present but not detected",
  evidenceUrls: [
    "https://storage.../evidence1.jpg",
    "https://storage.../evidence2.jpg",
  ],
});
```

### Update Dispute Status (QA Lead Only)

**Endpoint**: `trpc.disputes.updateStatus`  
**Auth**: QA Lead or Admin

```typescript
await trpc.disputes.updateStatus.mutate({
  id: 100,
  status: "accepted", // "open" | "under_review" | "accepted" | "rejected"
  reviewNotes: "Reviewed evidence, dispute accepted",
});
```

---

## Batch Operations (QA Lead Only)

### Bulk Approve Findings

**Endpoint**: `trpc.batchOperations.approveFindingsBatch`  
**Auth**: QA Lead or Admin

```typescript
await trpc.batchOperations.approveFindingsBatch.mutate({
  findingIds: [789, 790, 791],
  reason: "All verified correct",
});
```

### Bulk Assign Disputes

**Endpoint**: `trpc.batchOperations.assignDisputesBatch`  
**Auth**: QA Lead or Admin

```typescript
await trpc.batchOperations.assignDisputesBatch.mutate({
  disputeIds: [100, 101, 102],
  reviewerId: 5,
});
```

---

## Analytics

### Dashboard Stats

**Endpoint**: `trpc.stats.dashboard`  
**Auth**: Protected

```typescript
const stats = await trpc.stats.dashboard.query();

// Response:
{
  totalAudits: 1250,
  passRate: "87.5",
  reviewQueue: 15,
  criticalIssues: 3
}
```

### Technician Performance

**Endpoint**: `trpc.analytics.technicians`  
**Auth**: Protected (staff only)

```typescript
const performance = await trpc.analytics.technicians.query({
  startDate: "2026-06-01",
  endDate: "2026-07-01",
  technicianId: 10, // optional: filter by technician
});
```

---

## Error Handling

### Error Types

All mutations can throw `TRPCError` with these codes:

| Code                    | HTTP Status | Meaning                  |
| ----------------------- | ----------- | ------------------------ |
| `UNAUTHORIZED`          | 401         | Not authenticated        |
| `FORBIDDEN`             | 403         | Insufficient permissions |
| `NOT_FOUND`             | 404         | Resource doesn't exist   |
| `CONFLICT`              | 409         | Resource state conflict  |
| `BAD_REQUEST`           | 400         | Invalid input            |
| `TOO_MANY_REQUESTS`     | 429         | Rate limit exceeded      |
| `INTERNAL_SERVER_ERROR` | 500         | Server error             |

### Error Handling Example

```typescript
import { TRPCClientError } from "@trpc/client";

try {
  await trpc.jobSheets.process.mutate({ id: 123 });
} catch (error) {
  if (error instanceof TRPCClientError) {
    switch (error.data?.code) {
      case "UNAUTHORIZED":
        // Redirect to login
        break;
      case "FORBIDDEN":
        showToast("You don't have permission");
        break;
      case "NOT_FOUND":
        showToast("Job sheet not found");
        break;
      case "CONFLICT":
        showToast("Document is already being processed");
        break;
      case "TOO_MANY_REQUESTS":
        showToast("Rate limit exceeded, please wait");
        break;
      default:
        showToast("An error occurred");
    }
  }
}
```

---

## Rate Limits

| Endpoint              | Limit       | Window   |
| --------------------- | ----------- | -------- |
| `jobSheets.upload`    | 10 requests | 1 minute |
| `jobSheets.process`   | 5 requests  | 1 minute |
| `jobSheets.reprocess` | 5 requests  | 1 minute |

Rate limits are per-user and enforced server-side.

---

## Best Practices

### 1. Use React Query / TanStack Query

```typescript
// Good: Automatic caching, refetching, loading states
const { data, isLoading, error } = trpc.jobSheets.list.useQuery();

// Avoid: Manual fetch management
const data = await trpc.jobSheets.list.query();
```

### 2. Invalidate Cache After Mutations

```typescript
const utils = trpc.useUtils();

const uploadMutation = trpc.jobSheets.upload.useMutation({
  onSuccess: () => {
    utils.jobSheets.list.invalidate(); // Refetch list
  },
});
```

### 3. Handle Loading and Error States

```typescript
const { data, isLoading, error } = trpc.jobSheets.get.useQuery({ id: 123 });

if (isLoading) return <Skeleton />;
if (error) return <ErrorMessage error={error} />;
return <JobSheetDisplay data={data} />;
```

### 4. Use Optimistic Updates

```typescript
const utils = trpc.useUtils();

const approveMutation = trpc.audits.approveFinding.useMutation({
  onMutate: async variables => {
    // Cancel outgoing refetches
    await utils.audits.getFindings.cancel();

    // Snapshot previous value
    const previousFindings = utils.audits.getFindings.getData();

    // Optimistically update
    utils.audits.getFindings.setData({ id: variables.auditId }, old =>
      old?.map(f =>
        f.id === variables.findingId
          ? { ...f, resolutionStatus: "approved" }
          : f
      )
    );

    return { previousFindings };
  },
  onError: (err, variables, context) => {
    // Rollback on error
    utils.audits.getFindings.setData(
      { id: variables.auditId },
      context?.previousFindings
    );
  },
});
```

---

## TypeScript Types

All types are available via import:

```typescript
import type { inferRouterOutputs, inferRouterInputs } from "@trpc/server";
import type { AppRouter } from "@/server/routers";

type RouterOutput = inferRouterOutputs<AppRouter>;
type RouterInput = inferRouterInputs<AppRouter>;

// Use specific endpoint types
type JobSheet = RouterOutput["jobSheets"]["get"];
type UploadInput = RouterInput["jobSheets"]["upload"];
```

---

**For more information**: See [tRPC documentation](https://trpc.io/docs)
