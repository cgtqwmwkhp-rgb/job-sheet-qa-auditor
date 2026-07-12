/**
 * Template Override Service
 *
 * Allows admins/QA leads to explicitly set templateId/version for job sheets
 * when selection confidence is LOW or ambiguous.
 */

import type { ConfidenceBand } from "../templateRegistry/types";
import {
  getTemplate,
  getTemplateVersion,
} from "../templateRegistry/registryService";
import {
  loadStudioJson,
  overrideKey,
  persistStudioJson,
} from "../templateStudio/durableStore";

export interface TemplateOverride {
  jobSheetId: number;
  templateId: number;
  versionId: number;
  originalConfidence: ConfidenceBand;
  originalTopScore: number;
  reason: string;
  createdBy: number;
  createdAt: Date;
}

export interface OverrideResult {
  success: boolean;
  override?: TemplateOverride;
  error?: string;
}

const overrideStore = new Map<number, TemplateOverride>();

function serialize(override: TemplateOverride) {
  return {
    ...override,
    createdAt: override.createdAt.toISOString(),
  };
}

function deserialize(raw: {
  jobSheetId: number;
  templateId: number;
  versionId: number;
  originalConfidence: ConfidenceBand;
  originalTopScore: number;
  reason: string;
  createdBy: number;
  createdAt: string;
}): TemplateOverride {
  return {
    ...raw,
    createdAt: new Date(raw.createdAt),
  };
}

export function setTemplateOverride(
  jobSheetId: number,
  templateId: number,
  versionId: number,
  originalConfidence: ConfidenceBand,
  originalTopScore: number,
  reason: string,
  createdBy: number
): OverrideResult {
  if (!reason || reason.trim().length < 5) {
    return {
      success: false,
      error: "Override reason must be at least 5 characters",
    };
  }

  const template = getTemplate(templateId);
  if (!template) {
    return { success: false, error: `Template not found: ${templateId}` };
  }
  const version = getTemplateVersion(versionId);
  if (!version) {
    return { success: false, error: `Version not found: ${versionId}` };
  }
  if (version.templateId !== templateId) {
    return {
      success: false,
      error: "versionId does not belong to templateId",
    };
  }
  if (!version.isActive) {
    return {
      success: false,
      error: "Override requires an active template version",
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
  void persistStudioJson(overrideKey(jobSheetId), serialize(override));

  return {
    success: true,
    override,
  };
}

export function getTemplateOverride(
  jobSheetId: number
): TemplateOverride | null {
  return overrideStore.get(jobSheetId) ?? null;
}

export async function resolveTemplateOverride(
  jobSheetId: number
): Promise<TemplateOverride | null> {
  const cached = overrideStore.get(jobSheetId);
  if (cached) return cached;
  const loaded = await loadStudioJson<ReturnType<typeof serialize>>(
    overrideKey(jobSheetId)
  );
  if (loaded) {
    const override = deserialize(loaded);
    overrideStore.set(jobSheetId, override);
    return override;
  }
  return null;
}

export function hasTemplateOverride(jobSheetId: number): boolean {
  return overrideStore.has(jobSheetId);
}

export function clearTemplateOverride(jobSheetId: number): boolean {
  const deleted = overrideStore.delete(jobSheetId);
  if (deleted) {
    void persistStudioJson(overrideKey(jobSheetId), {
      cleared: true,
      clearedAt: new Date().toISOString(),
    });
  }
  return deleted;
}

export function listOverrides(): TemplateOverride[] {
  return Array.from(overrideStore.values()).sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );
}

export function getOverrideCount(): number {
  return overrideStore.size;
}

export function getOverridesByConfidence(): Record<ConfidenceBand, number> {
  const result: Record<ConfidenceBand, number> = {
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
  };

  for (const override of Array.from(overrideStore.values())) {
    result[override.originalConfidence]++;
  }

  return result;
}

export function resetOverrideStore(): void {
  overrideStore.clear();
}
