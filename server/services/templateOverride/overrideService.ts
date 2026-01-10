/**
 * Template Override Service
 * 
 * PR-G: Allows admins to explicitly set templateId/version for job sheets
 * when selection confidence is LOW or ambiguous.
 */

import type { ConfidenceBand } from '../templateRegistry/types';

/**
 * Template override record
 */
export interface TemplateOverride {
  /** Job sheet ID */
  jobSheetId: number;
  /** Overridden template ID */
  templateId: number;
  /** Overridden version ID */
  versionId: number;
  /** Original selection confidence */
  originalConfidence: ConfidenceBand;
  /** Original top score */
  originalTopScore: number;
  /** Reason for override */
  reason: string;
  /** User who created override */
  createdBy: number;
  /** When override was created */
  createdAt: Date;
}

/**
 * Override result
 */
export interface OverrideResult {
  success: boolean;
  override?: TemplateOverride;
  error?: string;
}

// In-memory override store
const overrideStore = new Map<number, TemplateOverride>();

/**
 * Create or update a template override for a job sheet
 */
export function setTemplateOverride(
  jobSheetId: number,
  templateId: number,
  versionId: number,
  originalConfidence: ConfidenceBand,
  originalTopScore: number,
  reason: string,
  createdBy: number
): OverrideResult {
  // Validate reason is provided
  if (!reason || reason.trim().length < 5) {
    return {
      success: false,
      error: 'Override reason must be at least 5 characters',
    };
  }

  const override: TemplateOverride = {
    jobSheetId,
    templateId,
    versionId,
    originalConfidence,
    originalTopScore,
    reason: reason.trim(),
    createdBy,
    createdAt: new Date(),
  };

  overrideStore.set(jobSheetId, override);

  return {
    success: true,
    override,
  };
}

/**
 * Get template override for a job sheet
 */
export function getTemplateOverride(jobSheetId: number): TemplateOverride | null {
  return overrideStore.get(jobSheetId) ?? null;
}

/**
 * Check if job sheet has an override
 */
export function hasTemplateOverride(jobSheetId: number): boolean {
  return overrideStore.has(jobSheetId);
}

/**
 * Remove template override for a job sheet
 */
export function clearTemplateOverride(jobSheetId: number): boolean {
  return overrideStore.delete(jobSheetId);
}

/**
 * List all overrides (for analytics)
 */
export function listOverrides(): TemplateOverride[] {
  return Array.from(overrideStore.values()).sort((a, b) => 
    b.createdAt.getTime() - a.createdAt.getTime()
  );
}

/**
 * Get override count
 */
export function getOverrideCount(): number {
  return overrideStore.size;
}

/**
 * Get overrides by confidence band (for analytics)
 */
export function getOverridesByConfidence(): Record<ConfidenceBand, number> {
  const result: Record<ConfidenceBand, number> = {
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
  };

  for (const override of Array.from(overrideStore.values())) {
    const band = override.originalConfidence as ConfidenceBand;
    result[band]++;
  }

  return result;
}

/**
 * Reset override store (for testing)
 */
export function resetOverrideStore(): void {
  overrideStore.clear();
}
