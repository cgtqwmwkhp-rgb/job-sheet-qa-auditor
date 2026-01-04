/**
 * Retention Service Implementation
 * 
 * Manages data retention policies and legal holds.
 * In-memory implementation for testing and development.
 */

import type {
  RetentionPolicyRecord,
  LegalHoldRecord,
  RetentionAuditEntry,
  RetentionAction,
  IRetentionService,
} from './types';

/**
 * In-memory storage for retention data
 */
interface RetentionStore {
  policies: Map<number, RetentionPolicyRecord>;
  legalHolds: Map<number, LegalHoldRecord>;
  auditLog: RetentionAuditEntry[];
  nextIds: {
    policy: number;
    hold: number;
    audit: number;
  };
}

/**
 * Create empty retention store
 */
function createRetentionStore(): RetentionStore {
  return {
    policies: new Map(),
    legalHolds: new Map(),
    auditLog: [],
    nextIds: {
      policy: 1,
      hold: 1,
      audit: 1,
    },
  };
}

let retentionStore = createRetentionStore();

/**
 * Reset retention store for testing
 */
export function resetRetentionStore(): void {
  retentionStore = createRetentionStore();
}

/**
 * In-memory retention service implementation
 */
export class InMemoryRetentionService implements IRetentionService {
  async createPolicy(
    policy: Omit<RetentionPolicyRecord, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<RetentionPolicyRecord> {
    const id = retentionStore.nextIds.policy++;
    const now = new Date();

    const stored: RetentionPolicyRecord = {
      ...policy,
      id,
      createdAt: now,
      updatedAt: now,
    };

    retentionStore.policies.set(id, stored);
    return stored;
  }

  async getPoliciesForEntity(entityType: string): Promise<RetentionPolicyRecord[]> {
    const allPolicies = Array.from(retentionStore.policies.values());
    const policies = allPolicies.filter(
      (policy) => policy.entityType === entityType && policy.isActive
    );

    // Return in deterministic order (by ID)
    return policies.sort((a, b) => a.id - b.id);
  }

  async placeLegalHold(
    hold: Omit<LegalHoldRecord, 'id' | 'placedAt' | 'releasedAt' | 'releasedBy' | 'releaseReason'>
  ): Promise<LegalHoldRecord> {
    const id = retentionStore.nextIds.hold++;

    const stored: LegalHoldRecord = {
      ...hold,
      id,
      placedAt: new Date(),
    };

    retentionStore.legalHolds.set(id, stored);

    // Log the action
    await this.logRetentionAction({
      action: 'HOLD_PLACED',
      entityType: hold.entityType,
      entityId: hold.entityId,
      performedBy: hold.placedBy,
      details: {
        reason: hold.reason,
        caseReference: hold.caseReference,
      },
    });

    return stored;
  }

  async releaseLegalHold(
    holdId: number,
    releasedBy: number,
    releaseReason: string
  ): Promise<void> {
    const hold = retentionStore.legalHolds.get(holdId);
    if (!hold) {
      throw new Error(`Legal hold not found: ${holdId}`);
    }

    if (hold.releasedAt) {
      throw new Error(`Legal hold already released: ${holdId}`);
    }

    hold.releasedAt = new Date();
    hold.releasedBy = releasedBy;
    hold.releaseReason = releaseReason;

    // Log the action
    await this.logRetentionAction({
      action: 'HOLD_RELEASED',
      entityType: hold.entityType,
      entityId: hold.entityId,
      performedBy: releasedBy,
      details: {
        holdId,
        releaseReason,
      },
    });
  }

  async hasActiveLegalHold(entityType: string, entityId: number): Promise<boolean> {
    const allHolds = Array.from(retentionStore.legalHolds.values());
    return allHolds.some(
      (hold) =>
        hold.entityType === entityType &&
        hold.entityId === entityId &&
        !hold.releasedAt
    );
  }

  async getEligibleForRetention(
    entityType: string,
    policyId: number
  ): Promise<number[]> {
    const policy = retentionStore.policies.get(policyId);
    if (!policy || !policy.isActive) {
      return [];
    }

    // In a real implementation, this would query the database
    // for entities older than retentionDays that don't have legal holds
    // For now, return empty array (scaffolding)
    return [];
  }

  async logRetentionAction(
    entry: Omit<RetentionAuditEntry, 'id' | 'createdAt'>
  ): Promise<void> {
    const id = retentionStore.nextIds.audit++;

    const stored: RetentionAuditEntry = {
      ...entry,
      id,
      createdAt: new Date(),
    };

    retentionStore.auditLog.push(stored);
  }

  async getRetentionAuditLog(
    entityType: string,
    entityId: number
  ): Promise<RetentionAuditEntry[]> {
    const entries = retentionStore.auditLog.filter(
      (e) => e.entityType === entityType && e.entityId === entityId
    );

    // Return in chronological order
    return entries.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  /**
   * Get all policies (for testing)
   */
  async getAllPolicies(): Promise<RetentionPolicyRecord[]> {
    return Array.from(retentionStore.policies.values()).sort((a, b) => a.id - b.id);
  }

  /**
   * Get all legal holds (for testing)
   */
  async getAllLegalHolds(): Promise<LegalHoldRecord[]> {
    return Array.from(retentionStore.legalHolds.values()).sort((a, b) => a.id - b.id);
  }

  /**
   * Get full audit log (for testing)
   */
  async getFullAuditLog(): Promise<RetentionAuditEntry[]> {
    return [...retentionStore.auditLog].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }
}

/**
 * Create retention service instance
 */
export function createRetentionService(): IRetentionService {
  return new InMemoryRetentionService();
}

/**
 * Default singleton instance
 */
let defaultRetentionService: IRetentionService | null = null;

export function getRetentionService(): IRetentionService {
  if (!defaultRetentionService) {
    defaultRetentionService = createRetentionService();
  }
  return defaultRetentionService;
}

export function resetRetentionService(): void {
  defaultRetentionService = null;
  resetRetentionStore();
}
