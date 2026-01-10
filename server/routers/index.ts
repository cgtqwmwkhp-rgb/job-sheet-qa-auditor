/**
 * Router Index - Stage 5 + PR-C Template Router
 * 
 * Exports all routers for integration with the main app router.
 */

export { auditRouter, type AuditRouter, type AuditResultResponse, type ValidatedFieldResponse, type FindingResponse, REVIEW_QUEUE_REASON_CODES, type ReviewQueueReasonCode, createMockAuditResult, resetAuditStore } from './auditRouter';

export { pipelineRouter, type PipelineRouter, type PipelineRunResponse, type PipelineRunState, createMockPipelineRun, resetPipelineStore } from './pipelineRouter';

export { reviewQueueRouter, type ReviewQueueRouter, type ReviewQueueItemResponse, type ReviewQueueStatus, createMockReviewQueueItem, resetReviewQueueStore } from './reviewQueueRouter';

export { exportsRouter, type ExportsRouter, type ExportFormat, setMockAuditForExport, resetExportStore } from './exportsRouter';

export { templateRouter, type TemplateRouter } from './templateRouter';
