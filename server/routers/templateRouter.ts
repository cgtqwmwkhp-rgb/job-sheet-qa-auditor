/**
 * Template Router
 * 
 * PR-C: API endpoints for template management.
 * Provides CRUD operations for templates and versions.
 * Admin-only for mutations, protected for reads.
 */

import { z } from 'zod';
import { protectedProcedure, adminProcedure, router } from '../_core/trpc';
import {
  createTemplate,
  uploadTemplateVersion,
  listTemplates,
  listVersions,
  getTemplate,
  getTemplateVersion,
  activateVersion,
  getActiveVersion,
  updateTemplateStatus,
  validateBulkImportPack,
  importBulkPack,
  createImportPackTemplate,
  hasFixturePack,
  getFixturePack,
  runFixtureMatrix,
  type CreateTemplateInput,
  type CreateVersionInput,
  type SelectionConfig,
  type SpecJson,
  type BulkImportPack,
} from '../services/templateRegistry';

// Zod schemas for validation
const selectionConfigSchema = z.object({
  requiredTokensAll: z.array(z.string()),
  requiredTokensAny: z.array(z.string()),
  formCodeRegex: z.string().optional(),
  optionalTokens: z.array(z.string()),
  tokenWeights: z.record(z.string(), z.number()).optional(),
});

const fieldSpecSchema = z.object({
  field: z.string(),
  label: z.string(),
  type: z.enum(['string', 'number', 'date', 'boolean', 'currency', 'list']),
  required: z.boolean(),
  extractionHints: z.array(z.string()).optional(),
  aliases: z.array(z.string()).optional(),
});

const ruleSpecSchema = z.object({
  ruleId: z.string(),
  field: z.string(),
  description: z.string(),
  severity: z.enum(['critical', 'major', 'minor', 'info']),
  type: z.enum(['required', 'format', 'range', 'pattern', 'custom']),
  pattern: z.string().optional(),
  range: z.object({
    min: z.union([z.number(), z.string()]).optional(),
    max: z.union([z.number(), z.string()]).optional(),
  }).optional(),
  enabled: z.boolean(),
  tags: z.array(z.string()).optional(),
});

const specJsonSchema = z.object({
  name: z.string(),
  version: z.string(),
  fields: z.array(fieldSpecSchema),
  rules: z.array(ruleSpecSchema),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const roiRegionSchema = z.object({
  name: z.string(),
  page: z.number(),
  bounds: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
  }),
  fields: z.array(z.string()).optional(),
});

const roiConfigSchema = z.object({
  regions: z.array(roiRegionSchema),
});

/**
 * Template Router
 */
export const templateRouter = router({
  /**
   * List all templates with active version info
   */
  list: protectedProcedure.query(() => {
    return listTemplates();
  }),

  /**
   * Get a single template by ID
   */
  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => {
      return getTemplate(input.id);
    }),

  /**
   * List versions for a template
   */
  listVersions: protectedProcedure
    .input(z.object({ templateId: z.number() }))
    .query(({ input }) => {
      return listVersions(input.templateId);
    }),

  /**
   * Get a specific template version
   */
  getVersion: protectedProcedure
    .input(z.object({ versionId: z.number() }))
    .query(({ input }) => {
      return getTemplateVersion(input.versionId);
    }),

  /**
   * Get active version for a template
   */
  getActiveVersion: protectedProcedure
    .input(z.object({ templateId: z.number() }))
    .query(({ input }) => {
      return getActiveVersion(input.templateId);
    }),

  /**
   * Create a new template (admin only)
   */
  create: adminProcedure
    .input(z.object({
      templateId: z.string().min(1).max(128),
      name: z.string().min(1).max(255),
      client: z.string().max(128).optional(),
      assetType: z.string().max(128).optional(),
      workType: z.string().max(128).optional(),
      description: z.string().optional(),
    }))
    .mutation(({ ctx, input }) => {
      return createTemplate({
        templateId: input.templateId,
        name: input.name,
        client: input.client,
        assetType: input.assetType,
        workType: input.workType,
        description: input.description,
        createdBy: ctx.user.id,
      });
    }),

  /**
   * Upload a new template version (admin only)
   */
  uploadVersion: adminProcedure
    .input(z.object({
      templateId: z.number(),
      version: z.string().min(1).max(32),
      specJson: specJsonSchema,
      selectionConfigJson: selectionConfigSchema,
      roiJson: roiConfigSchema.optional(),
      changeNotes: z.string().optional(),
    }))
    .mutation(({ ctx, input }) => {
      return uploadTemplateVersion({
        templateId: input.templateId,
        version: input.version,
        specJson: input.specJson as SpecJson,
        selectionConfigJson: input.selectionConfigJson as SelectionConfig,
        roiJson: input.roiJson,
        changeNotes: input.changeNotes,
        createdBy: ctx.user.id,
      });
    }),

  /**
   * Activate a template version (admin only)
   * Deactivates any other active version for the same template
   */
  activateVersion: adminProcedure
    .input(z.object({
      versionId: z.number(),
    }))
    .mutation(({ input }) => {
      return activateVersion(input.versionId);
    }),

  /**
   * Update template status (admin only)
   */
  updateStatus: adminProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(['draft', 'active', 'deprecated', 'archived']),
    }))
    .mutation(({ input }) => {
      return updateTemplateStatus(input.id, input.status);
    }),

  // ============================================================
  // PR-F: Bulk Import Pack Endpoints
  // ============================================================

  /**
   * Validate an import pack without importing (admin only)
   */
  validateImportPack: adminProcedure
    .input(z.object({
      pack: z.any(), // Validated internally
    }))
    .mutation(({ input }) => {
      return validateBulkImportPack(input.pack as BulkImportPack);
    }),

  /**
   * Import templates from a bulk import pack (admin only)
   */
  importPack: adminProcedure
    .input(z.object({
      pack: z.any(), // Validated internally
    }))
    .mutation(({ ctx, input }) => {
      // Validate first
      const validation = validateBulkImportPack(input.pack as BulkImportPack);
      if (!validation.valid) {
        return {
          success: false,
          validationErrors: validation.errors,
          results: [],
        };
      }
      
      // Import
      return importBulkPack(input.pack as BulkImportPack, ctx.user.id);
    }),

  /**
   * Get a template for an import pack (admin only)
   * Returns a scaffolded import pack structure
   */
  getImportPackTemplate: adminProcedure
    .query(() => {
      return createImportPackTemplate();
    }),

  // ============================================================
  // PR-E: Fixture Runner Endpoints
  // ============================================================

  /**
   * Check if a version has a fixture pack
   */
  hasFixtures: protectedProcedure
    .input(z.object({ versionId: z.number() }))
    .query(({ input }) => {
      return { hasFixtures: hasFixturePack(input.versionId) };
    }),

  /**
   * Get fixture pack for a version
   */
  getFixturePack: protectedProcedure
    .input(z.object({ versionId: z.number() }))
    .query(({ input }) => {
      return getFixturePack(input.versionId);
    }),

  /**
   * Run fixtures for a version (admin only)
   */
  runFixtures: adminProcedure
    .input(z.object({ versionId: z.number() }))
    .mutation(({ input }) => {
      const version = getTemplateVersion(input.versionId);
      if (!version) {
        throw new Error(`Version not found: ${input.versionId}`);
      }
      
      if (!hasFixturePack(input.versionId)) {
        throw new Error(`No fixture pack for version ${input.versionId}`);
      }
      
      return runFixtureMatrix(
        input.versionId,
        version.specJson,
        version.selectionConfigJson
      );
    }),
});

export type TemplateRouter = typeof templateRouter;
