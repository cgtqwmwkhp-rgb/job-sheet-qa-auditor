/**
 * Router Index — Stage 5 + Template / Analytics
 *
 * PR-PLAT-STAGE5: audit / pipeline / reviewQueue routers are QUARANTINED
 * (in-memory + simulated). They must NOT be mounted on appRouter.
 * Production processing: jobSheets.process → documentProcessor.
 *
 * exportsRouter / batchOperations: owned by ApiSurface (left alone here).
 */

export {
  auditRouter,
  type AuditRouter,
  type AuditResultResponse,
  type ValidatedFieldResponse,
  type FindingResponse,
  REVIEW_QUEUE_REASON_CODES,
  type ReviewQueueReasonCode,
  createMockAuditResult,
  resetAuditStore,
} from "./_quarantine/auditRouter";

export {
  pipelineRouter,
  type PipelineRouter,
  type PipelineRunResponse,
  type PipelineRunState,
  createMockPipelineRun,
  resetPipelineStore,
} from "./_quarantine/pipelineRouter";

export {
  reviewQueueRouter,
  type ReviewQueueRouter,
  type ReviewQueueItemResponse,
  type ReviewQueueStatus,
  createMockReviewQueueItem,
  resetReviewQueueStore,
} from "./_quarantine/reviewQueueRouter";

export {
  exportsRouter,
  type ExportsRouter,
  type ExportFormat,
  setMockAuditForExport,
  resetExportStore,
} from "./exportsRouter";

export {
  batchOperationsRouter,
  type BatchOperationsRouter,
} from "./batchOperations";

export { templateRouter, type TemplateRouter } from "./templateRouter";

export { analyticsRouter, type AnalyticsRouter } from "./analyticsRouter";

// Phase 1.9: exported only until #145 lands; mount in server/routers.ts as a follow-up.
export {
  fixPacksRouter,
  type FixPacksRouter,
  resetFixPackWorkflowStore,
} from "./fixPacksRouter";

export { commsRouter, type CommsRouter } from "./commsRouter";
