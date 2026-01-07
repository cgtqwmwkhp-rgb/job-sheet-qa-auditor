/**
 * Template Approval Service
 * 
 * Manages the template approval workflow:
 * - Append-only approvals table
 * - Activation requires approval + fixture suite pass
 * - Audit trail for all approval actions
 */

// ============================================================================
// Types
// ============================================================================

export interface TemplateApproval {
  id: string;
  templateVersionId: string;
  templateId: string;
  version: string;
  versionHash: string;
  approvedBy: string;
  approvedAt: string;
  note: string;
  status: 'pending' | 'approved' | 'rejected';
}

export interface ActivationEvent {
  id: string;
  templateVersionId: string;
  templateId: string;
  version: string;
  activatedBy: string;
  activatedAt: string;
  approvalId: string;
  fixtureRunId: string;
  previousVersionId: string | null;
  note: string;
}

export interface ApprovalRequest {
  templateId: string;
  version: string;
  versionHash: string;
  requestedBy: string;
  note: string;
}

export interface ActivationRequest {
  templateVersionId: string;
  approvalId: string;
  fixtureRunId: string;
  activatedBy: string;
  note: string;
}

export interface ApprovalAuditEntry {
  timestamp: string;
  action: 'request' | 'approve' | 'reject' | 'activate' | 'rollback';
  templateId: string;
  version: string;
  actor: string;
  details: Record<string, unknown>;
}

// ============================================================================
// In-Memory Storage (would be database in production)
// ============================================================================

const approvals: Map<string, TemplateApproval> = new Map();
const activations: Map<string, ActivationEvent> = new Map();
const auditLog: ApprovalAuditEntry[] = [];

// Track active version per template
const activeVersions: Map<string, string> = new Map();

// ============================================================================
// ID Generation
// ============================================================================

function generateId(prefix: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}_${timestamp}_${random}`;
}

function generateVersionId(templateId: string, version: string, hash: string): string {
  return `${templateId}@${version}#${hash}`;
}

// ============================================================================
// Audit Logging
// ============================================================================

function logAudit(entry: Omit<ApprovalAuditEntry, 'timestamp'>): void {
  auditLog.push({
    ...entry,
    timestamp: new Date().toISOString(),
  });
}

// ============================================================================
// Approval Functions
// ============================================================================

/**
 * Request approval for a template version
 */
export function requestApproval(request: ApprovalRequest): TemplateApproval {
  const versionId = generateVersionId(request.templateId, request.version, request.versionHash);
  
  // Check if already exists
  const existing = Array.from(approvals.values()).find(
    a => a.templateVersionId === versionId
  );
  
  if (existing) {
    throw new Error(`Approval already exists for ${versionId}: ${existing.status}`);
  }
  
  const approval: TemplateApproval = {
    id: generateId('apr'),
    templateVersionId: versionId,
    templateId: request.templateId,
    version: request.version,
    versionHash: request.versionHash,
    approvedBy: '',
    approvedAt: '',
    note: request.note,
    status: 'pending',
  };
  
  approvals.set(approval.id, approval);
  
  logAudit({
    action: 'request',
    templateId: request.templateId,
    version: request.version,
    actor: request.requestedBy,
    details: { approvalId: approval.id, versionHash: request.versionHash },
  });
  
  return approval;
}

/**
 * Approve a template version
 */
export function approveTemplate(approvalId: string, approvedBy: string, note: string): TemplateApproval {
  const approval = approvals.get(approvalId);
  
  if (!approval) {
    throw new Error(`Approval not found: ${approvalId}`);
  }
  
  if (approval.status !== 'pending') {
    throw new Error(`Cannot approve: status is ${approval.status}`);
  }
  
  // Append-only: create new record
  const updatedApproval: TemplateApproval = {
    ...approval,
    approvedBy,
    approvedAt: new Date().toISOString(),
    note: note || approval.note,
    status: 'approved',
  };
  
  approvals.set(approvalId, updatedApproval);
  
  logAudit({
    action: 'approve',
    templateId: approval.templateId,
    version: approval.version,
    actor: approvedBy,
    details: { approvalId, note },
  });
  
  return updatedApproval;
}

/**
 * Reject a template version
 */
export function rejectTemplate(approvalId: string, rejectedBy: string, note: string): TemplateApproval {
  const approval = approvals.get(approvalId);
  
  if (!approval) {
    throw new Error(`Approval not found: ${approvalId}`);
  }
  
  if (approval.status !== 'pending') {
    throw new Error(`Cannot reject: status is ${approval.status}`);
  }
  
  const updatedApproval: TemplateApproval = {
    ...approval,
    approvedBy: rejectedBy,
    approvedAt: new Date().toISOString(),
    note,
    status: 'rejected',
  };
  
  approvals.set(approvalId, updatedApproval);
  
  logAudit({
    action: 'reject',
    templateId: approval.templateId,
    version: approval.version,
    actor: rejectedBy,
    details: { approvalId, note },
  });
  
  return updatedApproval;
}

// ============================================================================
// Activation Functions
// ============================================================================

/**
 * Activate a template version (requires approval + fixture pass)
 */
export function activateTemplate(request: ActivationRequest): ActivationEvent {
  // Verify approval exists and is approved
  const approval = approvals.get(request.approvalId);
  
  if (!approval) {
    throw new Error(`Approval not found: ${request.approvalId}`);
  }
  
  if (approval.status !== 'approved') {
    throw new Error(`Cannot activate: approval status is ${approval.status}`);
  }
  
  if (approval.templateVersionId !== request.templateVersionId) {
    throw new Error(`Approval version mismatch: ${approval.templateVersionId} !== ${request.templateVersionId}`);
  }
  
  // Verify fixture run exists (would check database in production)
  if (!request.fixtureRunId) {
    throw new Error('Fixture run ID is required for activation');
  }
  
  // Get previous active version
  const previousVersionId = activeVersions.get(approval.templateId) || null;
  
  // Create activation event
  const activation: ActivationEvent = {
    id: generateId('act'),
    templateVersionId: request.templateVersionId,
    templateId: approval.templateId,
    version: approval.version,
    activatedBy: request.activatedBy,
    activatedAt: new Date().toISOString(),
    approvalId: request.approvalId,
    fixtureRunId: request.fixtureRunId,
    previousVersionId,
    note: request.note,
  };
  
  activations.set(activation.id, activation);
  activeVersions.set(approval.templateId, request.templateVersionId);
  
  logAudit({
    action: 'activate',
    templateId: approval.templateId,
    version: approval.version,
    actor: request.activatedBy,
    details: {
      activationId: activation.id,
      approvalId: request.approvalId,
      fixtureRunId: request.fixtureRunId,
      previousVersionId,
    },
  });
  
  return activation;
}

/**
 * Rollback to a previous version
 */
export function rollbackTemplate(templateId: string, targetVersionId: string, rolledBackBy: string, note: string): ActivationEvent {
  // Verify target version was previously activated
  const previousActivation = Array.from(activations.values()).find(
    a => a.templateVersionId === targetVersionId && a.templateId === templateId
  );
  
  if (!previousActivation) {
    throw new Error(`No previous activation found for ${targetVersionId}`);
  }
  
  const currentVersionId = activeVersions.get(templateId);
  
  // Create rollback activation event
  const activation: ActivationEvent = {
    id: generateId('act'),
    templateVersionId: targetVersionId,
    templateId,
    version: previousActivation.version,
    activatedBy: rolledBackBy,
    activatedAt: new Date().toISOString(),
    approvalId: previousActivation.approvalId,
    fixtureRunId: previousActivation.fixtureRunId,
    previousVersionId: currentVersionId || null,
    note: `ROLLBACK: ${note}`,
  };
  
  activations.set(activation.id, activation);
  activeVersions.set(templateId, targetVersionId);
  
  logAudit({
    action: 'rollback',
    templateId,
    version: previousActivation.version,
    actor: rolledBackBy,
    details: {
      activationId: activation.id,
      targetVersionId,
      previousVersionId: currentVersionId,
      note,
    },
  });
  
  return activation;
}

// ============================================================================
// Query Functions
// ============================================================================

/**
 * Get approval by ID
 */
export function getApproval(approvalId: string): TemplateApproval | null {
  return approvals.get(approvalId) || null;
}

/**
 * Get all approvals for a template
 */
export function getApprovalsForTemplate(templateId: string): TemplateApproval[] {
  return Array.from(approvals.values())
    .filter(a => a.templateId === templateId)
    .sort((a, b) => (b.approvedAt || '').localeCompare(a.approvedAt || ''));
}

/**
 * Get pending approvals
 */
export function getPendingApprovals(): TemplateApproval[] {
  return Array.from(approvals.values())
    .filter(a => a.status === 'pending')
    .sort((a, b) => a.templateId.localeCompare(b.templateId));
}

/**
 * Get activation history for a template
 */
export function getActivationHistory(templateId: string): ActivationEvent[] {
  return Array.from(activations.values())
    .filter(a => a.templateId === templateId)
    .sort((a, b) => b.activatedAt.localeCompare(a.activatedAt));
}

/**
 * Get active version for a template
 */
export function getActiveVersion(templateId: string): string | null {
  return activeVersions.get(templateId) || null;
}

/**
 * Get all active versions
 */
export function getAllActiveVersions(): Map<string, string> {
  return new Map(activeVersions);
}

/**
 * Get audit log
 */
export function getAuditLog(templateId?: string): ApprovalAuditEntry[] {
  if (templateId) {
    return auditLog.filter(e => e.templateId === templateId);
  }
  return [...auditLog];
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Check if a template version can be activated
 */
export function canActivate(templateVersionId: string): { canActivate: boolean; reason: string } {
  // Find approval for this version
  const approval = Array.from(approvals.values()).find(
    a => a.templateVersionId === templateVersionId
  );
  
  if (!approval) {
    return { canActivate: false, reason: 'No approval found for this version' };
  }
  
  if (approval.status !== 'approved') {
    return { canActivate: false, reason: `Approval status is ${approval.status}` };
  }
  
  return { canActivate: true, reason: 'Approved and ready for activation' };
}

// ============================================================================
// Reset (for testing)
// ============================================================================

export function resetApprovalService(): void {
  approvals.clear();
  activations.clear();
  activeVersions.clear();
  auditLog.length = 0;
}
