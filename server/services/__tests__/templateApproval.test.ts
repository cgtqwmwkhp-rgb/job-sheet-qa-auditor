/**
 * Template Approval Service Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  requestApproval,
  approveTemplate,
  rejectTemplate,
  activateTemplate,
  rollbackTemplate,
  getApproval,
  getApprovalsForTemplate,
  getPendingApprovals,
  getActivationHistory,
  getActiveVersion,
  getAllActiveVersions,
  getAuditLog,
  canActivate,
  resetApprovalService,
} from '../templateApproval';

describe('Template Approval Service', () => {
  beforeEach(() => {
    resetApprovalService();
  });

  describe('Approval Workflow', () => {
    it('creates pending approval request', () => {
      const approval = requestApproval({
        templateId: 'PE_LOLER_EXAM_V1',
        version: '1.0.0',
        versionHash: 'abc123def456',
        requestedBy: 'admin@example.com',
        note: 'Initial version',
      });

      expect(approval.id).toMatch(/^apr_/);
      expect(approval.templateId).toBe('PE_LOLER_EXAM_V1');
      expect(approval.version).toBe('1.0.0');
      expect(approval.status).toBe('pending');
      expect(approval.templateVersionId).toBe('PE_LOLER_EXAM_V1@1.0.0#abc123def456');
    });

    it('prevents duplicate approval requests', () => {
      requestApproval({
        templateId: 'PE_LOLER_EXAM_V1',
        version: '1.0.0',
        versionHash: 'abc123def456',
        requestedBy: 'admin@example.com',
        note: 'Initial version',
      });

      expect(() => requestApproval({
        templateId: 'PE_LOLER_EXAM_V1',
        version: '1.0.0',
        versionHash: 'abc123def456',
        requestedBy: 'admin@example.com',
        note: 'Duplicate',
      })).toThrow('Approval already exists');
    });

    it('approves pending template', () => {
      const pending = requestApproval({
        templateId: 'PE_LOLER_EXAM_V1',
        version: '1.0.0',
        versionHash: 'abc123def456',
        requestedBy: 'admin@example.com',
        note: 'Initial version',
      });

      const approved = approveTemplate(pending.id, 'approver@example.com', 'Looks good');

      expect(approved.status).toBe('approved');
      expect(approved.approvedBy).toBe('approver@example.com');
      expect(approved.approvedAt).toBeTruthy();
    });

    it('rejects pending template', () => {
      const pending = requestApproval({
        templateId: 'PE_LOLER_EXAM_V1',
        version: '1.0.0',
        versionHash: 'abc123def456',
        requestedBy: 'admin@example.com',
        note: 'Initial version',
      });

      const rejected = rejectTemplate(pending.id, 'approver@example.com', 'Missing critical fields');

      expect(rejected.status).toBe('rejected');
      expect(rejected.note).toBe('Missing critical fields');
    });

    it('cannot approve already approved template', () => {
      const pending = requestApproval({
        templateId: 'PE_LOLER_EXAM_V1',
        version: '1.0.0',
        versionHash: 'abc123def456',
        requestedBy: 'admin@example.com',
        note: 'Initial version',
      });

      approveTemplate(pending.id, 'approver@example.com', 'Approved');

      expect(() => approveTemplate(pending.id, 'another@example.com', 'Again'))
        .toThrow('Cannot approve: status is approved');
    });

    it('cannot reject already rejected template', () => {
      const pending = requestApproval({
        templateId: 'PE_LOLER_EXAM_V1',
        version: '1.0.0',
        versionHash: 'abc123def456',
        requestedBy: 'admin@example.com',
        note: 'Initial version',
      });

      rejectTemplate(pending.id, 'approver@example.com', 'Rejected');

      expect(() => rejectTemplate(pending.id, 'another@example.com', 'Again'))
        .toThrow('Cannot reject: status is rejected');
    });
  });

  describe('Activation Workflow', () => {
    it('activates approved template with fixture run', () => {
      const pending = requestApproval({
        templateId: 'PE_LOLER_EXAM_V1',
        version: '1.0.0',
        versionHash: 'abc123def456',
        requestedBy: 'admin@example.com',
        note: 'Initial version',
      });

      const approved = approveTemplate(pending.id, 'approver@example.com', 'Approved');

      const activation = activateTemplate({
        templateVersionId: approved.templateVersionId,
        approvalId: approved.id,
        fixtureRunId: 'fixture_run_123',
        activatedBy: 'deployer@example.com',
        note: 'Production deployment',
      });

      expect(activation.id).toMatch(/^act_/);
      expect(activation.templateId).toBe('PE_LOLER_EXAM_V1');
      expect(activation.approvalId).toBe(approved.id);
      expect(activation.fixtureRunId).toBe('fixture_run_123');
      expect(activation.previousVersionId).toBeNull();
    });

    it('cannot activate without approval', () => {
      expect(() => activateTemplate({
        templateVersionId: 'PE_LOLER_EXAM_V1@1.0.0#abc123',
        approvalId: 'nonexistent',
        fixtureRunId: 'fixture_run_123',
        activatedBy: 'deployer@example.com',
        note: 'Attempt',
      })).toThrow('Approval not found');
    });

    it('cannot activate pending approval', () => {
      const pending = requestApproval({
        templateId: 'PE_LOLER_EXAM_V1',
        version: '1.0.0',
        versionHash: 'abc123def456',
        requestedBy: 'admin@example.com',
        note: 'Initial version',
      });

      expect(() => activateTemplate({
        templateVersionId: pending.templateVersionId,
        approvalId: pending.id,
        fixtureRunId: 'fixture_run_123',
        activatedBy: 'deployer@example.com',
        note: 'Attempt',
      })).toThrow('approval status is pending');
    });

    it('cannot activate without fixture run', () => {
      const pending = requestApproval({
        templateId: 'PE_LOLER_EXAM_V1',
        version: '1.0.0',
        versionHash: 'abc123def456',
        requestedBy: 'admin@example.com',
        note: 'Initial version',
      });

      const approved = approveTemplate(pending.id, 'approver@example.com', 'Approved');

      expect(() => activateTemplate({
        templateVersionId: approved.templateVersionId,
        approvalId: approved.id,
        fixtureRunId: '',
        activatedBy: 'deployer@example.com',
        note: 'Attempt',
      })).toThrow('Fixture run ID is required');
    });

    it('tracks previous version on activation', () => {
      // First version
      const v1 = requestApproval({
        templateId: 'PE_LOLER_EXAM_V1',
        version: '1.0.0',
        versionHash: 'abc123',
        requestedBy: 'admin@example.com',
        note: 'v1',
      });
      approveTemplate(v1.id, 'approver@example.com', 'Approved');
      activateTemplate({
        templateVersionId: v1.templateVersionId,
        approvalId: v1.id,
        fixtureRunId: 'fixture_1',
        activatedBy: 'deployer@example.com',
        note: 'v1 deployment',
      });

      // Second version
      const v2 = requestApproval({
        templateId: 'PE_LOLER_EXAM_V1',
        version: '1.1.0',
        versionHash: 'def456',
        requestedBy: 'admin@example.com',
        note: 'v2',
      });
      approveTemplate(v2.id, 'approver@example.com', 'Approved');
      const activation2 = activateTemplate({
        templateVersionId: v2.templateVersionId,
        approvalId: v2.id,
        fixtureRunId: 'fixture_2',
        activatedBy: 'deployer@example.com',
        note: 'v2 deployment',
      });

      expect(activation2.previousVersionId).toBe(v1.templateVersionId);
    });
  });

  describe('Rollback', () => {
    it('rolls back to previous version', () => {
      // Setup: activate v1, then v2
      const v1 = requestApproval({
        templateId: 'PE_LOLER_EXAM_V1',
        version: '1.0.0',
        versionHash: 'abc123',
        requestedBy: 'admin@example.com',
        note: 'v1',
      });
      approveTemplate(v1.id, 'approver@example.com', 'Approved');
      activateTemplate({
        templateVersionId: v1.templateVersionId,
        approvalId: v1.id,
        fixtureRunId: 'fixture_1',
        activatedBy: 'deployer@example.com',
        note: 'v1',
      });

      const v2 = requestApproval({
        templateId: 'PE_LOLER_EXAM_V1',
        version: '1.1.0',
        versionHash: 'def456',
        requestedBy: 'admin@example.com',
        note: 'v2',
      });
      approveTemplate(v2.id, 'approver@example.com', 'Approved');
      activateTemplate({
        templateVersionId: v2.templateVersionId,
        approvalId: v2.id,
        fixtureRunId: 'fixture_2',
        activatedBy: 'deployer@example.com',
        note: 'v2',
      });

      // Rollback to v1
      const rollback = rollbackTemplate(
        'PE_LOLER_EXAM_V1',
        v1.templateVersionId,
        'ops@example.com',
        'v2 caused issues'
      );

      expect(rollback.templateVersionId).toBe(v1.templateVersionId);
      expect(rollback.previousVersionId).toBe(v2.templateVersionId);
      expect(rollback.note).toContain('ROLLBACK');
      expect(getActiveVersion('PE_LOLER_EXAM_V1')).toBe(v1.templateVersionId);
    });

    it('cannot rollback to non-existent version', () => {
      expect(() => rollbackTemplate(
        'PE_LOLER_EXAM_V1',
        'nonexistent@1.0.0#abc',
        'ops@example.com',
        'Attempt'
      )).toThrow('No previous activation found');
    });
  });

  describe('Query Functions', () => {
    it('gets approval by ID', () => {
      const created = requestApproval({
        templateId: 'PE_LOLER_EXAM_V1',
        version: '1.0.0',
        versionHash: 'abc123',
        requestedBy: 'admin@example.com',
        note: 'Test',
      });

      const found = getApproval(created.id);
      expect(found).not.toBeNull();
      expect(found?.templateId).toBe('PE_LOLER_EXAM_V1');
    });

    it('gets approvals for template', () => {
      requestApproval({
        templateId: 'PE_LOLER_EXAM_V1',
        version: '1.0.0',
        versionHash: 'abc123',
        requestedBy: 'admin@example.com',
        note: 'v1',
      });

      requestApproval({
        templateId: 'PE_LOLER_EXAM_V1',
        version: '1.1.0',
        versionHash: 'def456',
        requestedBy: 'admin@example.com',
        note: 'v2',
      });

      requestApproval({
        templateId: 'OTHER_TEMPLATE',
        version: '1.0.0',
        versionHash: 'xyz789',
        requestedBy: 'admin@example.com',
        note: 'Other',
      });

      const approvals = getApprovalsForTemplate('PE_LOLER_EXAM_V1');
      expect(approvals.length).toBe(2);
    });

    it('gets pending approvals', () => {
      const p1 = requestApproval({
        templateId: 'TEMPLATE_A',
        version: '1.0.0',
        versionHash: 'abc',
        requestedBy: 'admin@example.com',
        note: 'A',
      });

      requestApproval({
        templateId: 'TEMPLATE_B',
        version: '1.0.0',
        versionHash: 'def',
        requestedBy: 'admin@example.com',
        note: 'B',
      });

      approveTemplate(p1.id, 'approver@example.com', 'Approved');

      const pending = getPendingApprovals();
      expect(pending.length).toBe(1);
      expect(pending[0].templateId).toBe('TEMPLATE_B');
    });

    it('gets activation history', () => {
      const v1 = requestApproval({
        templateId: 'PE_LOLER_EXAM_V1',
        version: '1.0.0',
        versionHash: 'abc',
        requestedBy: 'admin@example.com',
        note: 'v1',
      });
      approveTemplate(v1.id, 'approver@example.com', 'Approved');
      activateTemplate({
        templateVersionId: v1.templateVersionId,
        approvalId: v1.id,
        fixtureRunId: 'f1',
        activatedBy: 'deployer@example.com',
        note: 'v1',
      });

      const v2 = requestApproval({
        templateId: 'PE_LOLER_EXAM_V1',
        version: '1.1.0',
        versionHash: 'def',
        requestedBy: 'admin@example.com',
        note: 'v2',
      });
      approveTemplate(v2.id, 'approver@example.com', 'Approved');
      activateTemplate({
        templateVersionId: v2.templateVersionId,
        approvalId: v2.id,
        fixtureRunId: 'f2',
        activatedBy: 'deployer@example.com',
        note: 'v2',
      });

      const history = getActivationHistory('PE_LOLER_EXAM_V1');
      expect(history.length).toBe(2);
      // Verify both versions are in history (order may vary based on timing)
      const versions = history.map(h => h.version);
      expect(versions).toContain('1.0.0');
      expect(versions).toContain('1.1.0');
    });

    it('gets active version', () => {
      const v1 = requestApproval({
        templateId: 'PE_LOLER_EXAM_V1',
        version: '1.0.0',
        versionHash: 'abc',
        requestedBy: 'admin@example.com',
        note: 'v1',
      });
      approveTemplate(v1.id, 'approver@example.com', 'Approved');
      activateTemplate({
        templateVersionId: v1.templateVersionId,
        approvalId: v1.id,
        fixtureRunId: 'f1',
        activatedBy: 'deployer@example.com',
        note: 'v1',
      });

      expect(getActiveVersion('PE_LOLER_EXAM_V1')).toBe(v1.templateVersionId);
      expect(getActiveVersion('NONEXISTENT')).toBeNull();
    });
  });

  describe('Audit Log', () => {
    it('logs all approval actions', () => {
      const pending = requestApproval({
        templateId: 'PE_LOLER_EXAM_V1',
        version: '1.0.0',
        versionHash: 'abc',
        requestedBy: 'admin@example.com',
        note: 'Test',
      });

      approveTemplate(pending.id, 'approver@example.com', 'Approved');

      activateTemplate({
        templateVersionId: pending.templateVersionId,
        approvalId: pending.id,
        fixtureRunId: 'f1',
        activatedBy: 'deployer@example.com',
        note: 'Deploy',
      });

      const log = getAuditLog('PE_LOLER_EXAM_V1');
      expect(log.length).toBe(3);
      expect(log.map(e => e.action)).toEqual(['request', 'approve', 'activate']);
    });

    it('filters audit log by template', () => {
      requestApproval({
        templateId: 'TEMPLATE_A',
        version: '1.0.0',
        versionHash: 'abc',
        requestedBy: 'admin@example.com',
        note: 'A',
      });

      requestApproval({
        templateId: 'TEMPLATE_B',
        version: '1.0.0',
        versionHash: 'def',
        requestedBy: 'admin@example.com',
        note: 'B',
      });

      const logA = getAuditLog('TEMPLATE_A');
      const logB = getAuditLog('TEMPLATE_B');
      const logAll = getAuditLog();

      expect(logA.length).toBe(1);
      expect(logB.length).toBe(1);
      expect(logAll.length).toBe(2);
    });
  });

  describe('Validation', () => {
    it('checks if template can be activated', () => {
      const pending = requestApproval({
        templateId: 'PE_LOLER_EXAM_V1',
        version: '1.0.0',
        versionHash: 'abc',
        requestedBy: 'admin@example.com',
        note: 'Test',
      });

      // Pending - cannot activate
      let check = canActivate(pending.templateVersionId);
      expect(check.canActivate).toBe(false);
      expect(check.reason).toContain('pending');

      // Approved - can activate
      approveTemplate(pending.id, 'approver@example.com', 'Approved');
      check = canActivate(pending.templateVersionId);
      expect(check.canActivate).toBe(true);
    });

    it('reports no approval found', () => {
      const check = canActivate('NONEXISTENT@1.0.0#abc');
      expect(check.canActivate).toBe(false);
      expect(check.reason).toContain('No approval found');
    });
  });

  describe('Non-Negotiable: Activation requires approval', () => {
    it('STOP CONDITION: activation without approval is impossible', () => {
      // This test verifies the stop condition from the spec
      expect(() => activateTemplate({
        templateVersionId: 'ANY@1.0.0#abc',
        approvalId: 'fake_approval',
        fixtureRunId: 'fixture_123',
        activatedBy: 'attacker@example.com',
        note: 'Bypass attempt',
      })).toThrow('Approval not found');
    });

    it('STOP CONDITION: activation without fixture run is impossible', () => {
      const pending = requestApproval({
        templateId: 'PE_LOLER_EXAM_V1',
        version: '1.0.0',
        versionHash: 'abc',
        requestedBy: 'admin@example.com',
        note: 'Test',
      });
      approveTemplate(pending.id, 'approver@example.com', 'Approved');

      expect(() => activateTemplate({
        templateVersionId: pending.templateVersionId,
        approvalId: pending.id,
        fixtureRunId: '', // Empty fixture run
        activatedBy: 'deployer@example.com',
        note: 'Bypass attempt',
      })).toThrow('Fixture run ID is required');
    });
  });
});
