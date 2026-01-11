/**
 * Template Registry Service
 * 
 * Manages template lifecycle: creation, versioning, and retrieval.
 * Provides deterministic hashing for version integrity.
 * 
 * PR-1: SSOT Enforcement - The registry is the ONLY source of truth for templates.
 */

import { createHash } from 'crypto';
import type {
  CreateTemplateInput,
  CreateVersionInput,
  SpecJson,
  SelectionConfig,
  RoiConfig,
  TemplateWithVersion,
} from './types';
import { checkActivationPreconditions, formatActivationError } from './activationGates';
import { checkFixturesForActivation, hasFixturePack } from './fixtureRunner';
import {
  DEFAULT_TEMPLATE_ID,
  DEFAULT_TEMPLATE_NAME,
  DEFAULT_SPEC_JSON,
  DEFAULT_SELECTION_CONFIG,
  DEFAULT_ROI_CONFIG,
  getSsotMode,
  type SsotMode,
  type SsotValidationResult,
} from './defaultTemplate';

// In-memory store for no-secrets CI (production would use DB)
interface TemplateRecord {
  id: number;
  templateId: string;
  name: string;
  client: string | null;
  assetType: string | null;
  workType: string | null;
  status: 'draft' | 'active' | 'deprecated' | 'archived';
  description: string | null;
  /** Template category (e.g., 'maintenance', 'inspection') */
  category: string | null;
  /** Tags for search/filtering */
  tags: string[];
  createdBy: number;
  createdAt: Date;
  updatedAt: Date;
}

interface VersionRecord {
  id: number;
  templateId: number;
  version: string;
  hashSha256: string;
  specJson: SpecJson;
  selectionConfigJson: SelectionConfig;
  roiJson: RoiConfig | null;
  isActive: boolean;
  changeNotes: string | null;
  createdBy: number;
  createdAt: Date;
}

// In-memory stores
const templateStore = new Map<number, TemplateRecord>();
const versionStore = new Map<number, VersionRecord>();
let nextTemplateId = 1;
let nextVersionId = 1;

/**
 * Compute deterministic SHA-256 hash of template version content.
 * Hash includes specJson + selectionConfigJson (not ROI as it's optional).
 * 
 * CRITICAL: Uses stable JSON stringification for determinism.
 */
export function computeVersionHash(
  specJson: SpecJson,
  selectionConfigJson: SelectionConfig
): string {
  // Create combined object and deep sort for determinism
  const combined = { selection: selectionConfigJson, spec: specJson };
  const sortedContent = JSON.stringify(sortObjectKeys(combined));
  
  return createHash('sha256').update(sortedContent).digest('hex');
}

/**
 * Recursively sort object keys
 */
function sortObjectKeys(obj: unknown): unknown {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(sortObjectKeys);
  }
  
  const sorted: Record<string, unknown> = {};
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  
  for (const key of keys) {
    sorted[key] = sortObjectKeys((obj as Record<string, unknown>)[key]);
  }
  
  return sorted;
}

/**
 * Create a new template
 */
export function createTemplate(input: CreateTemplateInput): TemplateRecord {
  const id = nextTemplateId++;
  const now = new Date();
  
  const template: TemplateRecord = {
    id,
    templateId: input.templateId,
    name: input.name,
    client: input.client ?? null,
    assetType: input.assetType ?? null,
    workType: input.workType ?? null,
    status: 'draft',
    description: input.description ?? null,
    category: input.category ?? null,
    tags: input.tags ?? [],
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
  };
  
  templateStore.set(id, template);
  return template;
}

/**
 * Upload a new template version
 */
export function uploadTemplateVersion(input: CreateVersionInput): VersionRecord {
  const template = templateStore.get(input.templateId);
  if (!template) {
    throw new Error(`Template not found: ${input.templateId}`);
  }
  
  // Compute deterministic hash
  const hashSha256 = computeVersionHash(input.specJson, input.selectionConfigJson);
  
  // Check for duplicate hash (same content)
  for (const version of Array.from(versionStore.values())) {
    if (version.templateId === input.templateId && version.hashSha256 === hashSha256) {
      throw new Error(`Version with identical content already exists: ${version.version}`);
    }
  }
  
  const id = nextVersionId++;
  const now = new Date();
  
  const version: VersionRecord = {
    id,
    templateId: input.templateId,
    version: input.version,
    hashSha256,
    specJson: input.specJson,
    selectionConfigJson: input.selectionConfigJson,
    roiJson: input.roiJson ?? null,
    isActive: false,
    changeNotes: input.changeNotes ?? null,
    createdBy: input.createdBy,
    createdAt: now,
  };
  
  versionStore.set(id, version);
  return version;
}

/**
 * List all templates with their active version info
 */
export function listTemplates(): TemplateWithVersion[] {
  const result: TemplateWithVersion[] = [];
  
  for (const template of Array.from(templateStore.values())) {
    // Find active version for this template
    let activeVersion: VersionRecord | undefined;
    let versionCount = 0;
    
    for (const version of Array.from(versionStore.values())) {
      if (version.templateId === template.id) {
        versionCount++;
        if (version.isActive) {
          activeVersion = version;
        }
      }
    }
    
    result.push({
      id: template.id,
      templateId: template.templateId,
      name: template.name,
      client: template.client,
      assetType: template.assetType,
      workType: template.workType,
      status: template.status,
      description: template.description,
      activeVersionId: activeVersion?.id ?? null,
      activeVersion: activeVersion?.version ?? null,
      versionCount,
    });
  }
  
  // Sort by templateId for determinism
  return result.sort((a, b) => a.templateId.localeCompare(b.templateId));
}

/**
 * List all versions for a template
 */
export function listVersions(templateId: number): VersionRecord[] {
  const versions: VersionRecord[] = [];
  
  for (const version of Array.from(versionStore.values())) {
    if (version.templateId === templateId) {
      versions.push(version);
    }
  }
  
  // Sort by version (semver-like) for determinism
  return versions.sort((a, b) => {
    // Sort by createdAt desc (newest first)
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
}

/**
 * Get a specific template version by ID
 */
export function getTemplateVersion(versionId: number): VersionRecord | null {
  return versionStore.get(versionId) ?? null;
}

/**
 * Get template by ID
 */
export function getTemplate(id: number): TemplateRecord | null {
  return templateStore.get(id) ?? null;
}

/**
 * Get template by slug (templateId field)
 */
export function getTemplateBySlug(templateId: string): TemplateRecord | null {
  for (const template of Array.from(templateStore.values())) {
    if (template.templateId === templateId) {
      return template;
    }
  }
  return null;
}

/**
 * Activation options
 */
export interface ActivationOptions {
  /** Skip precondition checks (for testing only) */
  skipPreconditions?: boolean;
  /** Skip fixture checks (for testing only) */
  skipFixtures?: boolean;
}

/**
 * Activate a template version
 * Deactivates any other active version for the same template
 * 
 * PR-D: Enforces activation preconditions
 * PR-E: Enforces fixture validation
 * 
 * @param versionId - Version ID to activate
 * @param skipOrOptions - Boolean for backward compat or options object
 */
export function activateVersion(
  versionId: number, 
  skipOrOptions: boolean | ActivationOptions = false
): VersionRecord {
  // Handle backward compatibility
  const options: ActivationOptions = typeof skipOrOptions === 'boolean'
    ? { skipPreconditions: skipOrOptions, skipFixtures: skipOrOptions }
    : skipOrOptions;

  const version = versionStore.get(versionId);
  if (!version) {
    throw new Error(`Version not found: ${versionId}`);
  }
  
  // PR-D: Check activation preconditions
  if (!options.skipPreconditions) {
    const preconditionResult = checkActivationPreconditions(
      version.specJson,
      version.selectionConfigJson
    );
    
    if (!preconditionResult.allowed) {
      throw new Error(formatActivationError(preconditionResult));
    }
  }
  
  // PR-E: Check fixtures (only if not skipped and fixtures exist)
  if (!options.skipFixtures && hasFixturePack(versionId)) {
    const fixtureResult = checkFixturesForActivation(
      versionId,
      version.specJson,
      version.selectionConfigJson
    );
    
    if (!fixtureResult.allowed) {
      throw new Error(fixtureResult.error || 'Fixture validation failed');
    }
  }
  
  // Deactivate other versions for this template
  for (const v of Array.from(versionStore.values())) {
    if (v.templateId === version.templateId && v.id !== versionId) {
      v.isActive = false;
    }
  }
  
  // Activate this version
  version.isActive = true;
  
  // Also activate the template if it's in draft
  const template = templateStore.get(version.templateId);
  if (template && template.status === 'draft') {
    template.status = 'active';
    template.updatedAt = new Date();
  }
  
  return version;
}

/**
 * Get active version for a template
 */
export function getActiveVersion(templateId: number): VersionRecord | null {
  for (const version of Array.from(versionStore.values())) {
    if (version.templateId === templateId && version.isActive) {
      return version;
    }
  }
  return null;
}

/**
 * Get all active templates (status = 'active' and has an active version)
 */
export function getActiveTemplates(): TemplateWithVersion[] {
  return listTemplates().filter(t => 
    t.status === 'active' && t.activeVersionId !== null
  );
}

/**
 * Update template status
 */
export function updateTemplateStatus(
  id: number,
  status: 'draft' | 'active' | 'deprecated' | 'archived'
): TemplateRecord {
  const template = templateStore.get(id);
  if (!template) {
    throw new Error(`Template not found: ${id}`);
  }
  
  template.status = status;
  template.updatedAt = new Date();
  
  return template;
}

/**
 * Update ROI configuration for a template version
 * 
 * PR-H: Allows saving ROI from the visual editor
 */
export function updateVersionRoi(
  versionId: number,
  roiJson: RoiConfig
): VersionRecord {
  const version = versionStore.get(versionId);
  if (!version) {
    throw new Error(`Version not found: ${versionId}`);
  }
  
  version.roiJson = roiJson;
  
  return version;
}

/**
 * Reset the registry (for testing)
 */
export function resetRegistry(): void {
  templateStore.clear();
  versionStore.clear();
  nextTemplateId = 1;
  nextVersionId = 1;
}

/**
 * Get registry stats (for testing/debugging)
 */
export function getRegistryStats(): { templates: number; versions: number } {
  return {
    templates: templateStore.size,
    versions: versionStore.size,
  };
}

// ============================================================================
// PR-1: SSOT ENFORCEMENT
// ============================================================================

/**
 * Check if the default template exists in the registry
 */
export function hasDefaultTemplate(): boolean {
  return getTemplateBySlug(DEFAULT_TEMPLATE_ID) !== null;
}

/**
 * Initialize the default template if it doesn't exist
 * 
 * This is called in permissive mode to ensure there's always a fallback.
 * In strict mode, this should NOT be called - templates must be explicitly created.
 * 
 * @returns The default template version ID, or null if already exists
 */
export function initializeDefaultTemplate(createdBy: number = 0): number | null {
  // Check if default template already exists
  if (hasDefaultTemplate()) {
    return null;
  }
  
  // Create the default template
  const template = createTemplate({
    templateId: DEFAULT_TEMPLATE_ID,
    name: DEFAULT_TEMPLATE_NAME,
    description: 'Default job sheet template (auto-created by SSOT system)',
    category: 'maintenance',
    tags: ['default', 'ssot', 'auto-created'],
    createdBy,
  });
  
  // Create the default version
  const version = uploadTemplateVersion({
    templateId: template.id,
    version: '1.0.0',
    specJson: DEFAULT_SPEC_JSON,
    selectionConfigJson: DEFAULT_SELECTION_CONFIG,
    roiJson: DEFAULT_ROI_CONFIG,
    changeNotes: 'Initial version - migrated from legacy getDefaultGoldSpec()',
    createdBy,
  });
  
  // Activate it (skip preconditions for the default template)
  activateVersion(version.id, { skipPreconditions: true, skipFixtures: true });
  
  return version.id;
}

/**
 * Validate SSOT requirements
 * 
 * In strict mode: At least one active template must exist
 * In permissive mode: Auto-initializes default template if needed
 */
export function validateSsotRequirements(): SsotValidationResult {
  const mode = getSsotMode();
  const activeTemplates = getActiveTemplates();
  const hasActive = activeTemplates.length > 0;
  const hasDefault = hasDefaultTemplate();
  
  if (mode === 'strict') {
    // Strict mode: require at least one active template
    if (!hasActive) {
      return {
        valid: false,
        mode,
        hasActiveTemplates: false,
        hasDefaultTemplate: hasDefault,
        error: 'SSOT_VIOLATION: No active templates in strict mode. ' +
               'Either activate a template or set TEMPLATE_SSOT_MODE=permissive.',
      };
    }
  } else {
    // Permissive mode: auto-initialize if needed
    if (!hasActive) {
      initializeDefaultTemplate();
    }
  }
  
  return {
    valid: true,
    mode,
    hasActiveTemplates: getActiveTemplates().length > 0,
    hasDefaultTemplate: hasDefaultTemplate(),
  };
}

/**
 * Get the default template version (if it exists and is active)
 * 
 * @returns The active version of the default template, or null
 */
export function getDefaultTemplateVersion(): VersionRecord | null {
  const template = getTemplateBySlug(DEFAULT_TEMPLATE_ID);
  if (!template) return null;
  return getActiveVersion(template.id);
}

/**
 * Ensure templates are ready for processing
 * 
 * This is the main entry point for SSOT validation before processing.
 * Throws an error if SSOT requirements are not met.
 */
export function ensureTemplatesReady(): void {
  const validation = validateSsotRequirements();
  if (!validation.valid) {
    throw new Error(validation.error ?? 'SSOT validation failed');
  }
}
