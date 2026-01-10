/**
 * Bulk Template Import Pack
 * 
 * PR-F: Enables fast onboarding of templates via import packs.
 * Validates and loads template metadata, specs, selection configs, and optional ROI/fixtures.
 */

import { z } from 'zod';
import {
  createTemplate,
  uploadTemplateVersion,
  getTemplate,
  getTemplateBySlug,
} from './registryService';
import { createFixturePack, type FixtureCase } from './fixtureRunner';
import type { SpecJson, SelectionConfig, RoiConfig as TypesRoiConfig, RoiRegion as TypesRoiRegion } from './types';

/**
 * Import-specific ROI region (simplified coordinates)
 * This is converted to the full RoiRegion format on import
 */
export interface ImportRoiRegion {
  /** Region name (matches field name) */
  name: string;
  /** X coordinate (0-1 normalized) */
  x: number;
  /** Y coordinate (0-1 normalized) */
  y: number;
  /** Width (0-1 normalized) */
  w: number;
  /** Height (0-1 normalized) */
  h: number;
}

export interface ImportRoiConfig {
  /** Page index (0-based) for multi-page documents */
  pageIndex: number;
  /** Regions to extract */
  regions: ImportRoiRegion[];
}

/**
 * Zod schema for ImportRoiConfig validation
 */
export const RoiRegionSchema = z.object({
  name: z.string().min(1),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0).max(1),
  h: z.number().min(0).max(1),
});

export const RoiConfigSchema = z.object({
  pageIndex: z.number().int().min(0),
  regions: z.array(RoiRegionSchema),
});

/**
 * Convert import ROI config to storage format
 */
function convertImportRoiToStorageFormat(importRoi: ImportRoiConfig): TypesRoiConfig {
  return {
    regions: importRoi.regions.map((region): TypesRoiRegion => ({
      name: region.name,
      page: importRoi.pageIndex + 1, // Convert 0-based to 1-based
      bounds: {
        x: region.x,
        y: region.y,
        width: region.w,
        height: region.h,
      },
    })),
  };
}

/**
 * Import pack structure for a single template
 */
export interface TemplateImportPack {
  /** Template metadata */
  metadata: {
    templateId: string;
    name: string;
    description?: string;
    category?: string;
    tags?: string[];
  };
  /** Version to create */
  version: string;
  /** Specification JSON */
  specJson: SpecJson;
  /** Selection configuration */
  selectionConfigJson: SelectionConfig;
  /** Optional ROI configuration (import format) */
  roiJson?: ImportRoiConfig;
  /** Optional fixture cases */
  fixtures?: FixtureCase[];
}

/**
 * Bulk import pack structure
 */
export interface BulkImportPack {
  /** Pack version for schema evolution */
  packVersion: '1.0.0';
  /** ISO timestamp of export */
  exportedAt: string;
  /** Source system identifier */
  sourceSystem?: string;
  /** Templates to import */
  templates: TemplateImportPack[];
}

/**
 * Import result for a single template
 */
export interface TemplateImportResult {
  templateId: string;
  success: boolean;
  created: {
    templateDbId?: number;
    versionDbId?: number;
    fixturePackCreated: boolean;
  };
  errors: string[];
  warnings: string[];
}

/**
 * Bulk import result
 */
export interface BulkImportResult {
  success: boolean;
  totalTemplates: number;
  successCount: number;
  failureCount: number;
  results: TemplateImportResult[];
  durationMs: number;
}

/**
 * Validate a template import pack
 */
export function validateImportPack(pack: TemplateImportPack): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validate metadata
  if (!pack.metadata.templateId || pack.metadata.templateId.trim() === '') {
    errors.push('metadata.templateId is required');
  }
  if (!pack.metadata.name || pack.metadata.name.trim() === '') {
    errors.push('metadata.name is required');
  }

  // Validate version
  if (!pack.version || !/^\d+\.\d+\.\d+$/.test(pack.version)) {
    errors.push('version must be in semver format (e.g., 1.0.0)');
  }

  // Validate specJson
  if (!pack.specJson) {
    errors.push('specJson is required');
  } else {
    if (!pack.specJson.name) errors.push('specJson.name is required');
    if (!pack.specJson.version) errors.push('specJson.version is required');
    if (!Array.isArray(pack.specJson.fields)) errors.push('specJson.fields must be an array');
    if (!Array.isArray(pack.specJson.rules)) errors.push('specJson.rules must be an array');
  }

  // Validate selectionConfigJson
  if (!pack.selectionConfigJson) {
    errors.push('selectionConfigJson is required');
  }

  // Validate roiJson if provided
  if (pack.roiJson) {
    try {
      RoiConfigSchema.parse(pack.roiJson);
    } catch (e) {
      errors.push(`roiJson validation failed: ${e instanceof Error ? e.message : 'Invalid format'}`);
    }
  }

  // Validate fixtures if provided
  if (pack.fixtures) {
    if (!Array.isArray(pack.fixtures)) {
      errors.push('fixtures must be an array');
    } else {
      for (let i = 0; i < pack.fixtures.length; i++) {
        const fixture = pack.fixtures[i];
        if (!fixture.caseId) errors.push(`fixtures[${i}].caseId is required`);
        if (!fixture.description) errors.push(`fixtures[${i}].description is required`);
        if (!fixture.inputText) errors.push(`fixtures[${i}].inputText is required`);
        if (!['pass', 'fail', 'review_queue'].includes(fixture.expectedOutcome)) {
          errors.push(`fixtures[${i}].expectedOutcome must be pass/fail/review_queue`);
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Import a single template from an import pack
 */
export function importTemplate(
  pack: TemplateImportPack,
  createdBy: number
): TemplateImportResult {
  const result: TemplateImportResult = {
    templateId: pack.metadata.templateId,
    success: false,
    created: {
      fixturePackCreated: false,
    },
    errors: [],
    warnings: [],
  };

  try {
    // Validate pack first
    const validation = validateImportPack(pack);
    if (!validation.valid) {
      result.errors = validation.errors;
      return result;
    }

    // Check if template already exists
    const existingBySlug = getTemplateBySlug(pack.metadata.templateId);
    let templateDbId: number;

    if (existingBySlug) {
      // Template exists - use existing
      result.warnings.push(`Template '${pack.metadata.templateId}' already exists, adding new version`);
      templateDbId = existingBySlug.id;
    } else {
      // Create new template
      const newTemplate = createTemplate({
        templateId: pack.metadata.templateId,
        name: pack.metadata.name,
        description: pack.metadata.description,
        category: pack.metadata.category,
        tags: pack.metadata.tags,
        createdBy,
      });
      templateDbId = newTemplate.id;
      result.created.templateDbId = templateDbId;
    }

    // Create version with ROI if provided (convert from import format)
    const version = uploadTemplateVersion({
      templateId: templateDbId,
      version: pack.version,
      specJson: pack.specJson,
      selectionConfigJson: pack.selectionConfigJson,
      roiJson: pack.roiJson ? convertImportRoiToStorageFormat(pack.roiJson) : undefined,
      createdBy,
    });
    result.created.versionDbId = version.id;

    // Create fixtures if provided
    if (pack.fixtures && pack.fixtures.length > 0) {
      createFixturePack(version.id, pack.fixtures, createdBy);
      result.created.fixturePackCreated = true;
    }

    result.success = true;
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : 'Unknown error');
  }

  return result;
}

/**
 * Import templates in bulk from an import pack
 */
export function importBulkPack(
  pack: BulkImportPack,
  createdBy: number
): BulkImportResult {
  const startTime = Date.now();
  const results: TemplateImportResult[] = [];
  let successCount = 0;
  let failureCount = 0;

  for (const templatePack of pack.templates) {
    const result = importTemplate(templatePack, createdBy);
    results.push(result);
    
    if (result.success) {
      successCount++;
    } else {
      failureCount++;
    }
  }

  return {
    success: failureCount === 0,
    totalTemplates: pack.templates.length,
    successCount,
    failureCount,
    results,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Validate a bulk import pack
 */
export function validateBulkImportPack(pack: BulkImportPack): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (pack.packVersion !== '1.0.0') {
    errors.push(`Unsupported pack version: ${pack.packVersion}. Expected: 1.0.0`);
  }

  if (!pack.templates || !Array.isArray(pack.templates)) {
    errors.push('templates must be an array');
    return { valid: false, errors };
  }

  if (pack.templates.length === 0) {
    errors.push('templates array is empty');
  }

  // Validate each template
  for (let i = 0; i < pack.templates.length; i++) {
    const templateValidation = validateImportPack(pack.templates[i]);
    if (!templateValidation.valid) {
      for (const err of templateValidation.errors) {
        errors.push(`templates[${i}]: ${err}`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Create an empty import pack template (for documentation/scaffolding)
 */
export function createImportPackTemplate(): BulkImportPack {
  return {
    packVersion: '1.0.0',
    exportedAt: new Date().toISOString(),
    templates: [
      {
        metadata: {
          templateId: 'example-template',
          name: 'Example Template',
          description: 'Description of the template',
          category: 'maintenance',
          tags: ['repair', 'service'],
        },
        version: '1.0.0',
        specJson: {
          name: 'Example Spec',
          version: '1.0.0',
          fields: [
            { field: 'jobReference', label: 'Job Reference', type: 'string', required: true },
            { field: 'assetId', label: 'Asset ID', type: 'string', required: true },
            { field: 'date', label: 'Date', type: 'date', required: true },
            { field: 'engineerSignOff', label: 'Engineer Sign Off', type: 'boolean', required: true },
          ],
          rules: [
            { ruleId: 'R001', field: 'jobReference', description: 'Job reference required', severity: 'critical', type: 'required', enabled: true },
          ],
        },
        selectionConfigJson: {
          requiredTokensAll: ['job', 'sheet'],
          requiredTokensAny: ['repair', 'maintenance'],
          optionalTokens: ['customer'],
        },
        roiJson: {
          pageIndex: 0,
          regions: [
            { name: 'jobReference', x: 0.1, y: 0.1, w: 0.3, h: 0.05 },
          ],
        },
        fixtures: [
          {
            caseId: 'PASS-001',
            description: 'Standard job sheet',
            inputText: 'Job Reference: JOB-123 Asset ID: ASSET-456 Date: 2024-01-01 Engineer Sign Off: Yes',
            expectedOutcome: 'pass',
            required: true,
          },
        ],
      },
    ],
  };
}
