/**
 * Template Router Contract Tests
 * 
 * PR-C: Validates template API endpoints.
 * - RBAC enforcement (admin for mutations)
 * - CRUD operations
 * - Version management
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { templateRouter } from '../../routers/templateRouter';
import { resetRegistry } from '../../services/templateRegistry';
import { router } from '../../_core/trpc';
import type { User } from '../../../drizzle/schema';

// Create a test router
const testRouter = router({
  templates: templateRouter,
});

// Mock user factory
function createMockUser(role: 'user' | 'admin' = 'user'): User {
  return {
    id: 1,
    openId: 'test-user',
    name: 'Test User',
    email: 'test@example.com',
    loginMethod: 'test',
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
}

// Create caller with mock context
function createCaller(role: 'user' | 'admin' = 'user') {
  const ctx = {
    req: {} as any,
    res: {} as any,
    user: createMockUser(role),
  };
  return testRouter.createCaller(ctx);
}

// Test fixtures - must include all critical fields for activation
const testSpecJson = {
  name: 'Test Spec',
  version: '1.0.0',
  fields: [
    { field: 'jobReference', label: 'Job Reference', type: 'string' as const, required: true },
    { field: 'assetId', label: 'Asset ID', type: 'string' as const, required: true },
    { field: 'date', label: 'Date', type: 'date' as const, required: true },
    { field: 'engineerSignOff', label: 'Engineer Sign Off', type: 'boolean' as const, required: true },
    { field: 'customer_name', label: 'Customer', type: 'string' as const, required: false },
  ],
  rules: [
    { ruleId: 'R001', field: 'jobReference', description: 'Required', severity: 'critical' as const, type: 'required' as const, enabled: true },
    { ruleId: 'R002', field: 'assetId', description: 'Required', severity: 'critical' as const, type: 'required' as const, enabled: true },
  ],
};

const testSelectionConfig = {
  requiredTokensAll: ['job', 'sheet'],
  requiredTokensAny: ['repair'],
  optionalTokens: ['customer'],
};

describe('Template Router - PR-C Contract Tests', () => {
  beforeEach(() => {
    resetRegistry();
  });

  describe('Read Operations (Protected)', () => {
    it('should list templates for authenticated users', async () => {
      const caller = createCaller('user');
      const templates = await caller.templates.list();
      
      expect(Array.isArray(templates)).toBe(true);
    });

    it('should return empty list when no templates exist', async () => {
      const caller = createCaller('user');
      const templates = await caller.templates.list();
      
      expect(templates).toHaveLength(0);
    });

    it('should get template by ID', async () => {
      const adminCaller = createCaller('admin');
      const userCaller = createCaller('user');
      
      // Create as admin
      const created = await adminCaller.templates.create({
        templateId: 'test-template',
        name: 'Test Template',
      });
      
      // Read as user
      const template = await userCaller.templates.get({ id: created.id });
      
      expect(template).not.toBeNull();
      expect(template?.name).toBe('Test Template');
    });

    it('should list versions for a template', async () => {
      const adminCaller = createCaller('admin');
      const userCaller = createCaller('user');
      
      const template = await adminCaller.templates.create({
        templateId: 'test-template',
        name: 'Test',
      });
      
      await adminCaller.templates.uploadVersion({
        templateId: template.id,
        version: '1.0.0',
        specJson: testSpecJson,
        selectionConfigJson: testSelectionConfig,
      });
      
      const versions = await userCaller.templates.listVersions({ templateId: template.id });
      
      expect(versions).toHaveLength(1);
      expect(versions[0].version).toBe('1.0.0');
    });
  });

  describe('Write Operations (Admin Only)', () => {
    it('should allow admin to create template', async () => {
      const caller = createCaller('admin');
      
      const template = await caller.templates.create({
        templateId: 'new-template',
        name: 'New Template',
        client: 'ACME',
        assetType: 'vehicle',
        workType: 'repair',
        description: 'A test template',
      });
      
      expect(template.id).toBeDefined();
      expect(template.templateId).toBe('new-template');
      expect(template.status).toBe('draft');
    });

    it('should reject template creation for non-admin', async () => {
      const caller = createCaller('user');
      
      await expect(
        caller.templates.create({
          templateId: 'unauthorized-template',
          name: 'Should Fail',
        })
      ).rejects.toThrow();
    });

    it('should allow admin to upload version', async () => {
      const caller = createCaller('admin');
      
      const template = await caller.templates.create({
        templateId: 'versioned-template',
        name: 'Versioned',
      });
      
      const version = await caller.templates.uploadVersion({
        templateId: template.id,
        version: '1.0.0',
        specJson: testSpecJson,
        selectionConfigJson: testSelectionConfig,
        changeNotes: 'Initial version',
      });
      
      expect(version.id).toBeDefined();
      expect(version.version).toBe('1.0.0');
      expect(version.hashSha256).toHaveLength(64);
    });

    it('should reject version upload for non-admin', async () => {
      const adminCaller = createCaller('admin');
      const userCaller = createCaller('user');
      
      const template = await adminCaller.templates.create({
        templateId: 'test-template',
        name: 'Test',
      });
      
      await expect(
        userCaller.templates.uploadVersion({
          templateId: template.id,
          version: '1.0.0',
          specJson: testSpecJson,
          selectionConfigJson: testSelectionConfig,
        })
      ).rejects.toThrow();
    });

    it('should allow admin to activate version', async () => {
      const caller = createCaller('admin');
      
      const template = await caller.templates.create({
        templateId: 'activation-test',
        name: 'Activation Test',
      });
      
      const version = await caller.templates.uploadVersion({
        templateId: template.id,
        version: '1.0.0',
        specJson: testSpecJson,
        selectionConfigJson: testSelectionConfig,
      });
      
      expect(version.isActive).toBe(false);
      
      const activated = await caller.templates.activateVersion({ versionId: version.id });
      
      expect(activated.isActive).toBe(true);
    });

    it('should reject version activation for non-admin', async () => {
      const adminCaller = createCaller('admin');
      const userCaller = createCaller('user');
      
      const template = await adminCaller.templates.create({
        templateId: 'test-template',
        name: 'Test',
      });
      
      const version = await adminCaller.templates.uploadVersion({
        templateId: template.id,
        version: '1.0.0',
        specJson: testSpecJson,
        selectionConfigJson: testSelectionConfig,
      });
      
      await expect(
        userCaller.templates.activateVersion({ versionId: version.id })
      ).rejects.toThrow();
    });
  });

  describe('Template Status Management', () => {
    it('should allow admin to update template status', async () => {
      const caller = createCaller('admin');
      
      const template = await caller.templates.create({
        templateId: 'status-test',
        name: 'Status Test',
      });
      
      expect(template.status).toBe('draft');
      
      const updated = await caller.templates.updateStatus({
        id: template.id,
        status: 'deprecated',
      });
      
      expect(updated.status).toBe('deprecated');
    });

    it('should reject status update for non-admin', async () => {
      const adminCaller = createCaller('admin');
      const userCaller = createCaller('user');
      
      const template = await adminCaller.templates.create({
        templateId: 'test-template',
        name: 'Test',
      });
      
      await expect(
        userCaller.templates.updateStatus({
          id: template.id,
          status: 'archived',
        })
      ).rejects.toThrow();
    });
  });

  describe('Active Version Retrieval', () => {
    it('should return null for template with no active version', async () => {
      const caller = createCaller('admin');
      
      const template = await caller.templates.create({
        templateId: 'no-active-version',
        name: 'No Active',
      });
      
      const active = await caller.templates.getActiveVersion({ templateId: template.id });
      
      expect(active).toBeNull();
    });

    it('should return active version after activation', async () => {
      const caller = createCaller('admin');
      
      const template = await caller.templates.create({
        templateId: 'has-active-version',
        name: 'Has Active',
      });
      
      const version = await caller.templates.uploadVersion({
        templateId: template.id,
        version: '1.0.0',
        specJson: testSpecJson,
        selectionConfigJson: testSelectionConfig,
      });
      
      await caller.templates.activateVersion({ versionId: version.id });
      
      const active = await caller.templates.getActiveVersion({ templateId: template.id });
      
      expect(active).not.toBeNull();
      expect(active?.version).toBe('1.0.0');
    });
  });

  describe('Input Validation', () => {
    it('should reject empty templateId', async () => {
      const caller = createCaller('admin');
      
      await expect(
        caller.templates.create({
          templateId: '',
          name: 'Test',
        })
      ).rejects.toThrow();
    });

    it('should reject empty name', async () => {
      const caller = createCaller('admin');
      
      await expect(
        caller.templates.create({
          templateId: 'valid-id',
          name: '',
        })
      ).rejects.toThrow();
    });

    it('should reject invalid status', async () => {
      const caller = createCaller('admin');
      
      const template = await caller.templates.create({
        templateId: 'test',
        name: 'Test',
      });
      
      await expect(
        caller.templates.updateStatus({
          id: template.id,
          status: 'invalid-status' as any,
        })
      ).rejects.toThrow();
    });
  });
});
