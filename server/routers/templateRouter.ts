/**
 * Template Router
 *
 * API endpoints for template management + Template Studio.
 * Authors: admin | qa_lead. Reads: authenticated staff.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, qaLeadProcedure, router } from "../_core/trpc";
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
  validateRoiConfig,
  normalizeRoiConfig,
  createStandardJobSheetRoi,
  updateVersionRoi,
  updateDraftVersion,
  STANDARD_ROI_TYPES,
  type SelectionConfig,
  type SpecJson,
  type BulkImportPack,
  type RoiConfig,
} from "../services/templateRegistry";
import {
  createStudioStarterSpec,
  createStudioStarterSelection,
  attachStudioSample,
  buildActivationReport,
  proposeFromSample,
  scaffoldFixturesFromSample,
  requestPromote,
  approvePromote,
  rejectPromote,
  markPromoteApplied,
  listPromoteRequests,
  getPromoteRequest,
  resolvePromoteRequest,
  packIntegrityHash,
  assertPackIntegrity,
  diffVersions,
  runStudioDryRun,
  acknowledgeDryRun,
  loadDryRunReport,
  getDryRunGateStatus,
} from "../services/templateStudio";
import { assertStagingActivationAllowed } from "../services/templateStudio/envGuards";
import { resolveStudioSample } from "../services/templateStudio/sampleStore";
import {
  setTemplateOverride,
  getTemplateOverride,
  clearTemplateOverride,
  listOverrides,
} from "../services/templateOverride/overrideService";
import { logAuditEvent } from "../utils/requestLogger";
import * as db from "../db";

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
  type: z.enum(["string", "number", "date", "boolean", "currency", "list"]),
  required: z.boolean(),
  extractionHints: z.array(z.string()).optional(),
  aliases: z.array(z.string()).optional(),
});

const ruleSpecSchema = z.object({
  ruleId: z.string(),
  field: z.string(),
  description: z.string(),
  severity: z.enum(["critical", "major", "minor", "info"]),
  type: z.enum(["required", "format", "range", "pattern", "custom", "implies"]),
  pattern: z.string().optional(),
  range: z
    .object({
      min: z.union([z.number(), z.string()]).optional(),
      max: z.union([z.number(), z.string()]).optional(),
    })
    .optional(),
  boundsMode: z.enum(["between", "under", "at_least", "over"]).optional(),
  unit: z.string().optional(),
  enabled: z.boolean(),
  tags: z.array(z.string()).optional(),
  whenField: z.string().optional(),
  whenValue: z.string().optional(),
  thenField: z.string().optional(),
  thenValue: z.string().optional(),
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

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

async function applyPromotePack(
  pack: ReturnType<typeof getPromoteRequest> extends infer R
    ? R extends { pack: infer P }
      ? P
      : never
    : never,
  userId: number
) {
  if (!pack) throw new Error("Missing promote pack");

  let template = null as ReturnType<typeof getTemplate> | null;
  // Prefer slug lookup via list
  const existing = listTemplates().find(
    t => t.templateId === pack.templateSlug
  );
  if (existing) {
    template = getTemplate(existing.id);
  } else {
    template = createTemplate({
      templateId: pack.templateSlug,
      name: pack.templateName,
      createdBy: userId,
      description: `Promoted from staging (${pack.hashSha256.slice(0, 12)})`,
    });
  }

  // Skip if identical hash already active
  const versions = listVersions(template!.id);
  const sameHash = versions.find(v => v.hashSha256 === pack.hashSha256);
  let versionId: number;
  if (sameHash) {
    versionId = sameHash.id;
  } else {
    const uploaded = uploadTemplateVersion({
      templateId: template!.id,
      version: pack.version,
      specJson: pack.specJson,
      selectionConfigJson: pack.selectionConfigJson,
      roiJson: pack.roiJson ?? undefined,
      changeNotes:
        pack.changeNotes ||
        `Promoted from staging evidence versionId=${pack.stagingEvidence.versionId}`,
      createdBy: userId,
    });
    versionId = uploaded.id;
  }

  const activated = activateVersion(versionId);
  return { template: template!, version: activated };
}

export const templateRouter = router({
  list: protectedProcedure.query(() => listTemplates()),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => getTemplate(input.id)),

  listVersions: protectedProcedure
    .input(z.object({ templateId: z.number() }))
    .query(({ input }) => listVersions(input.templateId)),

  getVersion: protectedProcedure
    .input(z.object({ versionId: z.number() }))
    .query(({ input }) => getTemplateVersion(input.versionId)),

  getActiveVersion: protectedProcedure
    .input(z.object({ templateId: z.number() }))
    .query(({ input }) => getActiveVersion(input.templateId)),

  create: qaLeadProcedure
    .input(
      z.object({
        templateId: z.string().min(1).max(128),
        name: z.string().min(1).max(255),
        client: z.string().max(128).optional(),
        assetType: z.string().max(128).optional(),
        workType: z.string().max(128).optional(),
        description: z.string().optional(),
      })
    )
    .mutation(({ ctx, input }) =>
      createTemplate({
        ...input,
        createdBy: ctx.user.id,
      })
    ),

  uploadVersion: qaLeadProcedure
    .input(
      z.object({
        templateId: z.number(),
        version: z.string().min(1).max(32),
        specJson: specJsonSchema,
        selectionConfigJson: selectionConfigSchema,
        roiJson: roiConfigSchema.optional(),
        changeNotes: z.string().optional(),
      })
    )
    .mutation(({ ctx, input }) =>
      uploadTemplateVersion({
        templateId: input.templateId,
        version: input.version,
        specJson: input.specJson as SpecJson,
        selectionConfigJson: input.selectionConfigJson as SelectionConfig,
        roiJson: input.roiJson,
        changeNotes: input.changeNotes,
        createdBy: ctx.user.id,
      })
    ),

  activateVersion: qaLeadProcedure
    .input(z.object({ versionId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      try {
        assertStagingActivationAllowed("templates.activateVersion");
      } catch (err) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: err instanceof Error ? err.message : "Activation blocked",
        });
      }
      const version = activateVersion(input.versionId);
      logAuditEvent(
        "TEMPLATE_ACTIVATE",
        "template_version",
        input.versionId,
        ctx.user.id,
        { environment: process.env.APP_ENV || "unknown" }
      );
      await db.logAction({
        userId: ctx.user.id,
        action: "TEMPLATE_ACTIVATE",
        entityType: "template_version",
        entityId: input.versionId,
        details: { hashSha256: version.hashSha256 },
      });
      return version;
    }),

  updateStatus: qaLeadProcedure
    .input(
      z.object({
        id: z.number(),
        status: z.enum(["draft", "active", "deprecated", "archived"]),
      })
    )
    .mutation(({ input }) => updateTemplateStatus(input.id, input.status)),

  validateImportPack: qaLeadProcedure
    .input(z.object({ pack: z.any() }))
    .mutation(({ input }) =>
      validateBulkImportPack(input.pack as BulkImportPack)
    ),

  importPack: qaLeadProcedure
    .input(z.object({ pack: z.any() }))
    .mutation(({ ctx, input }) => {
      const validation = validateBulkImportPack(input.pack as BulkImportPack);
      if (!validation.valid) {
        return {
          success: false,
          validationErrors: validation.errors,
          results: [],
        };
      }
      return importBulkPack(input.pack as BulkImportPack, ctx.user.id);
    }),

  getImportPackTemplate: qaLeadProcedure.query(() =>
    createImportPackTemplate()
  ),

  hasFixtures: protectedProcedure
    .input(z.object({ versionId: z.number() }))
    .query(({ input }) => ({ hasFixtures: hasFixturePack(input.versionId) })),

  getFixturePack: protectedProcedure
    .input(z.object({ versionId: z.number() }))
    .query(({ input }) => getFixturePack(input.versionId)),

  runFixtures: qaLeadProcedure
    .input(z.object({ versionId: z.number() }))
    .mutation(({ input }) => {
      const version = getTemplateVersion(input.versionId);
      if (!version) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Version not found: ${input.versionId}`,
        });
      }
      if (!hasFixturePack(input.versionId)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `No fixture pack for version ${input.versionId}`,
        });
      }
      return runFixtureMatrix(
        input.versionId,
        version.specJson,
        version.selectionConfigJson
      );
    }),

  getRoi: protectedProcedure
    .input(z.object({ versionId: z.number() }))
    .query(({ input }) => {
      const version = getTemplateVersion(input.versionId);
      if (!version) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Version not found: ${input.versionId}`,
        });
      }
      return {
        versionId: input.versionId,
        roiJson: version.roiJson,
        hasRoi: version.roiJson !== null,
      };
    }),

  updateRoi: qaLeadProcedure
    .input(
      z.object({
        versionId: z.number(),
        roiJson: z.object({
          regions: z.array(
            z.object({
              name: z.string(),
              page: z.number().int().min(1),
              bounds: z.object({
                x: z.number().min(0).max(1),
                y: z.number().min(0).max(1),
                width: z.number().min(0).max(1),
                height: z.number().min(0).max(1),
              }),
              fields: z.array(z.string()).optional(),
            })
          ),
        }),
      })
    )
    .mutation(({ input }) => {
      const validation = validateRoiConfig(input.roiJson as RoiConfig);
      if (!validation.valid) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `ROI validation failed: ${validation.errors.join(", ")}`,
        });
      }
      const normalized = normalizeRoiConfig(input.roiJson as RoiConfig);
      return updateVersionRoi(input.versionId, normalized);
    }),

  validateRoi: qaLeadProcedure
    .input(z.object({ roiJson: z.any() }))
    .mutation(({ input }) => validateRoiConfig(input.roiJson as RoiConfig)),

  getStandardRoiTemplate: protectedProcedure.query(() => ({
    standardTypes: STANDARD_ROI_TYPES,
    template: createStandardJobSheetRoi(),
  })),

  // ============================================================
  // Template Studio
  // ============================================================
  studio: router({
    createDraft: qaLeadProcedure
      .input(
        z.object({
          name: z.string().min(1).max(255),
          templateId: z.string().min(1).max(128).optional(),
          client: z.string().max(128).optional(),
          assetType: z.string().max(128).optional(),
          workType: z.string().max(128).optional(),
          description: z.string().optional(),
          selectionTokens: z.array(z.string()).optional(),
        })
      )
      .mutation(({ ctx, input }) => {
        const slug =
          input.templateId ||
          `studio-${slugify(input.name)}-${Date.now().toString(36)}`;
        const template = createTemplate({
          templateId: slug,
          name: input.name,
          client: input.client,
          assetType: input.assetType,
          workType: input.workType,
          description: input.description,
          createdBy: ctx.user.id,
        });
        const version = uploadTemplateVersion({
          templateId: template.id,
          version: "0.1.0",
          specJson: createStudioStarterSpec(input.name),
          selectionConfigJson: createStudioStarterSelection(
            input.selectionTokens
          ),
          roiJson: { regions: [] },
          changeNotes: "Studio draft created",
          createdBy: ctx.user.id,
        });
        logAuditEvent(
          "TEMPLATE_STUDIO_CREATE_DRAFT",
          "template",
          template.id,
          ctx.user.id,
          { versionId: version.id, slug }
        );
        return { template, version };
      }),

    attachSample: qaLeadProcedure
      .input(
        z.object({
          versionId: z.number(),
          fileName: z.string().min(1).max(255),
          fileType: z.string().min(1).max(128),
          fileBase64: z.string().min(1),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const version = getTemplateVersion(input.versionId);
        if (!version) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Version not found: ${input.versionId}`,
          });
        }
        const { meta } = await attachStudioSample({
          versionId: input.versionId,
          fileName: input.fileName,
          fileType: input.fileType,
          fileBase64: input.fileBase64,
          uploadedBy: ctx.user.id,
        });
        const sampleUrl = `/api/template-samples/${input.versionId}`;
        logAuditEvent(
          "TEMPLATE_STUDIO_ATTACH_SAMPLE",
          "template_version",
          input.versionId,
          ctx.user.id,
          { fileName: meta.fileName, fileHash: meta.fileHash }
        );
        return { meta, sampleUrl };
      }),

    getSample: qaLeadProcedure
      .input(z.object({ versionId: z.number() }))
      .query(async ({ input }) => {
        const meta = await resolveStudioSample(input.versionId);
        if (!meta) return null;
        return {
          meta,
          sampleUrl: `/api/template-samples/${input.versionId}`,
        };
      }),

    /**
     * One-shot: create draft + attach sample + propose + scaffold fixtures.
     */
    quickStartFromSample: qaLeadProcedure
      .input(
        z.object({
          name: z.string().min(1).max(255).optional(),
          fileName: z.string().min(1).max(255),
          fileType: z.string().min(1).max(128),
          fileBase64: z.string().min(1),
          client: z.string().max(128).optional(),
          selectionTokens: z.array(z.string()).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const derivedName =
          input.name?.trim() ||
          input.fileName
            .replace(/\.[^.]+$/, "")
            .replace(/[_-]+/g, " ")
            .trim() ||
          "New form type";
        const slug = `studio-${slugify(derivedName)}-${Date.now().toString(36)}`;
        const template = createTemplate({
          templateId: slug,
          name: derivedName,
          client: input.client,
          description: "Quick-started from sample upload in Template Studio",
          createdBy: ctx.user.id,
        });
        const version = uploadTemplateVersion({
          templateId: template.id,
          version: "0.1.0",
          specJson: createStudioStarterSpec(derivedName),
          selectionConfigJson: createStudioStarterSelection(
            input.selectionTokens
          ),
          roiJson: { regions: [] },
          changeNotes: "Quick-start draft",
          createdBy: ctx.user.id,
        });
        const { meta } = await attachStudioSample({
          versionId: version.id,
          fileName: input.fileName,
          fileType: input.fileType,
          fileBase64: input.fileBase64,
          uploadedBy: ctx.user.id,
        });
        const proposal = await proposeFromSample({
          versionId: version.id,
          templateName: derivedName,
        });
        const ocrRoi = proposal.roiRegions.some(r => r.source === "ocr-layout");
        const appliedVersion = updateDraftVersion(version.id, {
          specJson: proposal.proposedSpec,
          selectionConfigJson: proposal.proposedSelection,
          ...(ocrRoi
            ? { roiJson: proposal.proposedRoi }
            : { roiJson: { regions: [] } }),
          changeNotes: ocrRoi
            ? "Quick-start proposal applied (OCR-placed ROIs)"
            : "Quick-start proposal applied (no OCR ROI geometry — draw manually)",
        });
        scaffoldFixturesFromSample({
          versionId: version.id,
          sampleText: proposal.layoutTextPreview,
          specJson: proposal.proposedSpec,
          createdBy: ctx.user.id,
        });
        logAuditEvent(
          "TEMPLATE_STUDIO_QUICK_START",
          "template",
          template.id,
          ctx.user.id,
          { versionId: version.id, fileHash: meta.fileHash }
        );
        await db.logAction({
          userId: ctx.user.id,
          action: "TEMPLATE_STUDIO_QUICK_START",
          entityType: "template",
          entityId: template.id,
          details: { versionId: version.id },
        });
        return {
          template,
          version: appliedVersion,
          proposal,
          sampleUrl: `/api/template-samples/${version.id}`,
          meta,
        };
      }),

    /**
     * Bootstrap Studio from an existing job sheet (first-seen divert).
     */
    bootstrapFromJobSheet: qaLeadProcedure
      .input(
        z.object({
          jobSheetId: z.number(),
          name: z.string().min(1).max(255).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const jobSheet = await db.getJobSheetById(input.jobSheetId);
        if (!jobSheet) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Job sheet not found",
          });
        }
        const { enforceJobSheetAccess } = await import(
          "../utils/authorization"
        );
        enforceJobSheetAccess(jobSheet, ctx.user);

        const storage = (await import("../storage")).getStorageAdapter();
        if (!jobSheet.fileKey && !jobSheet.fileUrl) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Job sheet has no attached file to teach from",
          });
        }
        let fileUrl = jobSheet.fileUrl;
        if (jobSheet.fileKey) {
          const got = await storage.get(jobSheet.fileKey);
          fileUrl = got.url;
        }
        let buffer: Buffer;
        if (fileUrl!.startsWith("file://")) {
          const { readFile } = await import("fs/promises");
          buffer = await readFile(fileUrl!.replace("file://", ""));
        } else {
          const res = await fetch(fileUrl!, {
            signal: AbortSignal.timeout(60_000),
          });
          if (!res.ok) {
            throw new TRPCError({
              code: "BAD_GATEWAY",
              message: "Failed to fetch job sheet PDF for bootstrap",
            });
          }
          buffer = Buffer.from(await res.arrayBuffer());
        }
        const fileBase64 = buffer.toString("base64");
        const fileName =
          jobSheet.fileName || `job-sheet-${input.jobSheetId}.pdf`;
        const fileType = fileName.toLowerCase().endsWith(".png")
          ? "image/png"
          : fileName.toLowerCase().endsWith(".jpg") ||
              fileName.toLowerCase().endsWith(".jpeg")
            ? "image/jpeg"
            : "application/pdf";

        const derivedName =
          input.name?.trim() || `Form from job #${input.jobSheetId}`;

        // Inline quick-start with this buffer
        const slug = `studio-${slugify(derivedName)}-${Date.now().toString(36)}`;
        const template = createTemplate({
          templateId: slug,
          name: derivedName,
          description: `Bootstrapped from job sheet ${input.jobSheetId}`,
          createdBy: ctx.user.id,
        });
        const version = uploadTemplateVersion({
          templateId: template.id,
          version: "0.1.0",
          specJson: createStudioStarterSpec(derivedName),
          selectionConfigJson: createStudioStarterSelection(),
          roiJson: { regions: [] },
          changeNotes: `Bootstrap from jobSheet ${input.jobSheetId}`,
          createdBy: ctx.user.id,
        });
        const { meta } = await attachStudioSample({
          versionId: version.id,
          fileName,
          fileType,
          fileBase64,
          uploadedBy: ctx.user.id,
        });
        const proposal = await proposeFromSample({
          versionId: version.id,
          templateName: derivedName,
        });
        const ocrRoi = proposal.roiRegions.some(r => r.source === "ocr-layout");
        const appliedVersion = updateDraftVersion(version.id, {
          specJson: proposal.proposedSpec,
          selectionConfigJson: proposal.proposedSelection,
          ...(ocrRoi
            ? { roiJson: proposal.proposedRoi }
            : { roiJson: { regions: [] } }),
          changeNotes: ocrRoi
            ? "Bootstrap proposal applied (OCR-placed ROIs)"
            : "Bootstrap proposal applied (no OCR ROI geometry — draw manually)",
        });
        scaffoldFixturesFromSample({
          versionId: version.id,
          sampleText: proposal.layoutTextPreview,
          specJson: proposal.proposedSpec,
          createdBy: ctx.user.id,
        });
        logAuditEvent(
          "TEMPLATE_STUDIO_BOOTSTRAP_JOB_SHEET",
          "job_sheet",
          input.jobSheetId,
          ctx.user.id,
          { templateId: template.id, versionId: version.id }
        );
        await db.logAction({
          userId: ctx.user.id,
          action: "TEMPLATE_STUDIO_BOOTSTRAP_JOB_SHEET",
          entityType: "job_sheet",
          entityId: input.jobSheetId,
          details: { templateId: template.id, versionId: version.id },
        });
        return {
          template,
          version: appliedVersion,
          proposal,
          sampleUrl: `/api/template-samples/${version.id}`,
          meta,
          sourceJobSheetId: input.jobSheetId,
        };
      }),

    saveDraft: qaLeadProcedure
      .input(
        z.object({
          versionId: z.number(),
          specJson: specJsonSchema.optional(),
          selectionConfigJson: selectionConfigSchema.optional(),
          roiJson: roiConfigSchema.nullable().optional(),
          changeNotes: z.string().optional(),
          asNewVersion: z.string().min(1).max(32).optional(),
        })
      )
      .mutation(({ ctx, input }) => {
        const existing = getTemplateVersion(input.versionId);
        if (!existing) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Version not found: ${input.versionId}`,
          });
        }

        if (existing.isActive || input.asNewVersion) {
          const uploaded = uploadTemplateVersion({
            templateId: existing.templateId,
            version: input.asNewVersion || bumpPatch(existing.version),
            specJson: (input.specJson as SpecJson) ?? existing.specJson,
            selectionConfigJson:
              (input.selectionConfigJson as SelectionConfig) ??
              existing.selectionConfigJson,
            roiJson:
              input.roiJson === undefined
                ? (existing.roiJson ?? undefined)
                : (input.roiJson ?? undefined),
            changeNotes: input.changeNotes ?? "Studio save as new version",
            createdBy: ctx.user.id,
          });
          return { version: uploaded, createdNew: true };
        }

        const updated = updateDraftVersion(input.versionId, {
          specJson: input.specJson as SpecJson | undefined,
          selectionConfigJson: input.selectionConfigJson as
            | SelectionConfig
            | undefined,
          roiJson: input.roiJson as RoiConfig | null | undefined,
          changeNotes: input.changeNotes,
        });
        return { version: updated, createdNew: false };
      }),

    activationReport: qaLeadProcedure
      .input(z.object({ versionId: z.number() }))
      .query(({ input }) => buildActivationReport(input.versionId)),

    dryRun: qaLeadProcedure
      .input(
        z.object({
          versionId: z.number(),
          jobSheetIds: z.array(z.number()).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        try {
          const report = await runStudioDryRun({
            versionId: input.versionId,
            userId: ctx.user.id,
            jobSheetIds: input.jobSheetIds,
          });
          logAuditEvent(
            "TEMPLATE_STUDIO_DRY_RUN",
            "template_version",
            input.versionId,
            ctx.user.id,
            {
              hashSha256: report.hashSha256,
              pipelineOk: report.pipelineOk,
              assessmentMode: report.assessmentMode,
              durationMs: report.durationMs,
            }
          );
          return report;
        } catch (err) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: err instanceof Error ? err.message : "Dry-run failed",
          });
        }
      }),

    getDryRun: qaLeadProcedure
      .input(z.object({ versionId: z.number() }))
      .query(async ({ input }) => {
        const version = getTemplateVersion(input.versionId);
        if (!version) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Version not found: ${input.versionId}`,
          });
        }
        const report = await loadDryRunReport(
          input.versionId,
          version.hashSha256
        );
        const gate = await getDryRunGateStatus(input.versionId);
        return { report, gate };
      }),

    acknowledgeDryRun: qaLeadProcedure
      .input(
        z.object({
          versionId: z.number(),
          hashSha256: z.string().min(8),
        })
      )
      .mutation(async ({ ctx, input }) => {
        try {
          const report = await acknowledgeDryRun({
            versionId: input.versionId,
            hashSha256: input.hashSha256,
            userId: ctx.user.id,
          });
          logAuditEvent(
            "TEMPLATE_STUDIO_DRY_RUN_ACK",
            "template_version",
            input.versionId,
            ctx.user.id,
            { hashSha256: report.hashSha256 }
          );
          return report;
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Acknowledge failed";
          throw new TRPCError({
            code: message.startsWith("DRY_RUN_")
              ? "BAD_REQUEST"
              : "BAD_REQUEST",
            message,
          });
        }
      }),

    activateStaging: qaLeadProcedure
      .input(z.object({ versionId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        try {
          assertStagingActivationAllowed("templates.studio.activateStaging");
        } catch (err) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: err instanceof Error ? err.message : "Activation blocked",
          });
        }
        const report = await buildActivationReport(input.versionId);
        if (!report.allowed) {
          const dryPart = report.dryRun.blocking
            ? `; ${report.dryRun.code}`
            : "";
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Activation gates failed: ${report.preconditions.blockingIssues
              .map(i => i.code)
              .join(", ")}${
              report.fixtures.blocking ? "; FIXTURES_FAILED" : ""
            }${!report.collision.allowed ? "; COLLISION" : ""}${dryPart}`,
          });
        }
        if (!report.fixtures.hasFixtures) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Fixtures required before staging activate — run Propose apply or Scaffold fixtures first",
          });
        }
        const dryGate = await getDryRunGateStatus(input.versionId);
        if (!dryGate.allowed) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `${dryGate.code}: ${dryGate.message}`,
          });
        }
        const version = activateVersion(input.versionId);
        logAuditEvent(
          "TEMPLATE_ACTIVATE_STAGING",
          "template_version",
          input.versionId,
          ctx.user.id,
          {
            hashSha256: version.hashSha256,
            environment: process.env.APP_ENV || "staging",
          }
        );
        await db.logAction({
          userId: ctx.user.id,
          action: "TEMPLATE_ACTIVATE_STAGING",
          entityType: "template_version",
          entityId: input.versionId,
          details: {
            hashSha256: version.hashSha256,
            environment: process.env.APP_ENV || "staging",
          },
        });
        return { version, report };
      }),

    proposeFromSample: qaLeadProcedure
      .input(
        z.object({
          versionId: z.number(),
          templateName: z.string().optional(),
          applyAccepted: z.boolean().optional(),
          rejectedFieldIds: z.array(z.string()).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const version = getTemplateVersion(input.versionId);
        if (!version) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Version not found: ${input.versionId}`,
          });
        }
        const proposal = await proposeFromSample({
          versionId: input.versionId,
          templateName: input.templateName,
        });

        let appliedVersion = null as ReturnType<typeof getTemplateVersion>;
        if (input.applyAccepted) {
          const rejected = new Set(input.rejectedFieldIds ?? []);
          const fields = proposal.proposedSpec.fields.filter(
            f => !rejected.has(f.field)
          );
          const rules = proposal.proposedSpec.rules.filter(
            r => !rejected.has(r.field)
          );
          const acceptedFields = proposal.fields.map(f => ({
            ...f,
            accepted: !rejected.has(f.field.field),
          }));
          const filteredSpec = {
            ...proposal.proposedSpec,
            fields,
            rules,
            metadata: {
              ...proposal.proposedSpec.metadata,
              rejectedFieldIds: Array.from(rejected),
            },
          };
          // Keep critical fields even if user rejected — activation gates require them
          const critical = [
            "jobReference",
            "assetId",
            "date",
            "engineerSignOff",
          ];
          for (const c of critical) {
            if (!filteredSpec.fields.some(f => f.field === c)) {
              const fromProposal = proposal.fields.find(
                f => f.field.field === c
              );
              if (fromProposal) filteredSpec.fields.push(fromProposal.field);
            }
          }
          appliedVersion = updateDraftVersion(input.versionId, {
            specJson: filteredSpec,
            selectionConfigJson: proposal.proposedSelection,
            // Only write ROI when OCR placed real boxes — never save generic scaffold
            ...(proposal.roiRegions.some(r => r.source === "ocr-layout")
              ? { roiJson: proposal.proposedRoi }
              : {}),
            changeNotes: proposal.roiRegions.some(
              r => r.source === "ocr-layout"
            )
              ? "Applied AI/OCR proposal (OCR-placed ROIs)"
              : "Applied AI/OCR proposal (fields/tokens only — ROI left empty pending OCR geometry)",
          });
          scaffoldFixturesFromSample({
            versionId: input.versionId,
            sampleText: proposal.layoutTextPreview,
            specJson: filteredSpec,
            createdBy: ctx.user.id,
          });
          proposal.fields = acceptedFields;
        }

        logAuditEvent(
          "TEMPLATE_STUDIO_PROPOSE",
          "template_version",
          input.versionId,
          ctx.user.id,
          {
            layoutAvailable: proposal.layoutAvailable,
            geminiUsed: proposal.geminiUsed,
            applied: Boolean(input.applyAccepted),
            rejectedCount: input.rejectedFieldIds?.length ?? 0,
          }
        );

        return { proposal, appliedVersion };
      }),

    scaffoldFixtures: qaLeadProcedure
      .input(
        z.object({
          versionId: z.number(),
          sampleText: z.string().optional(),
        })
      )
      .mutation(({ ctx, input }) => {
        const version = getTemplateVersion(input.versionId);
        if (!version) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Version not found: ${input.versionId}`,
          });
        }
        return scaffoldFixturesFromSample({
          versionId: input.versionId,
          sampleText: input.sampleText || "",
          specJson: version.specJson,
          createdBy: ctx.user.id,
        });
      }),

    collisionPreview: qaLeadProcedure
      .input(z.object({ versionId: z.number() }))
      .query(async ({ input }) => {
        const report = await buildActivationReport(input.versionId);
        return report.collision;
      }),

    diffVersions: qaLeadProcedure
      .input(
        z.object({
          fromVersionId: z.number(),
          toVersionId: z.number(),
        })
      )
      .query(({ input }) => {
        const from = getTemplateVersion(input.fromVersionId);
        const to = getTemplateVersion(input.toVersionId);
        if (!from || !to) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "One or both versions not found",
          });
        }
        return diffVersions(from, to);
      }),

    requestPromote: qaLeadProcedure
      .input(
        z.object({
          versionId: z.number(),
          smokeJobSheetIds: z.array(z.number()).optional(),
          notes: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const req = await requestPromote({
          versionId: input.versionId,
          requestedBy: ctx.user.id,
          smokeJobSheetIds: input.smokeJobSheetIds,
          notes: input.notes,
        });
        logAuditEvent(
          "TEMPLATE_PROMOTE_REQUEST",
          "template_promote",
          req.id,
          ctx.user.id,
          { hashSha256: req.pack.hashSha256, versionId: input.versionId }
        );
        await db.logAction({
          userId: ctx.user.id,
          action: "TEMPLATE_PROMOTE_REQUEST",
          entityType: "template_promote",
          entityId: 0,
          details: {
            promoteId: req.id,
            hashSha256: req.pack.hashSha256,
            versionId: input.versionId,
          },
        });
        return req;
      }),

    approvePromote: qaLeadProcedure
      .input(z.object({ promoteId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const req = await approvePromote({
          promoteId: input.promoteId,
          approvedBy: ctx.user.id,
        });
        logAuditEvent(
          "TEMPLATE_PROMOTE_APPROVE",
          "template_promote",
          req.id,
          ctx.user.id,
          { hashSha256: req.pack.hashSha256 }
        );
        await db.logAction({
          userId: ctx.user.id,
          action: "TEMPLATE_PROMOTE_APPROVE",
          entityType: "template_promote",
          entityId: 0,
          details: {
            promoteId: req.id,
            hashSha256: req.pack.hashSha256,
            integrity: packIntegrityHash(req.pack),
          },
        });
        // Dual control: approve never auto-applies — applier must call applyPromote
        return { request: await resolvePromoteRequest(req.id), applied: null };
      }),

    rejectPromote: qaLeadProcedure
      .input(
        z.object({
          promoteId: z.string().uuid(),
          reason: z.string().min(5),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const req = await rejectPromote({
          promoteId: input.promoteId,
          rejectedBy: ctx.user.id,
          reason: input.reason,
        });
        await db.logAction({
          userId: ctx.user.id,
          action: "TEMPLATE_PROMOTE_REJECT",
          entityType: "template_promote",
          entityId: 0,
          details: { promoteId: req.id, reason: input.reason },
        });
        return req;
      }),

    applyPromote: qaLeadProcedure
      .input(z.object({ promoteId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const req = await resolvePromoteRequest(input.promoteId);
        if (!req) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Promote request not found",
          });
        }
        if (req.status !== "approved") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Promote must be approved before apply",
          });
        }
        try {
          assertPackIntegrity(req.pack);
        } catch (err) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: err instanceof Error ? err.message : "Integrity failure",
          });
        }
        if (req.requestedBy === ctx.user.id) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Requester cannot apply their own promote (dual control)",
          });
        }
        const applied = await applyPromotePack(req.pack, ctx.user.id);
        await markPromoteApplied(req.id, ctx.user.id);
        await db.logAction({
          userId: ctx.user.id,
          action: "TEMPLATE_PROMOTE_APPLY",
          entityType: "template_version",
          entityId: applied.version.id,
          details: {
            promoteId: req.id,
            environment: process.env.APP_ENV || "unknown",
            integrity: req.pack.integrityHash,
          },
        });
        return {
          request: await resolvePromoteRequest(req.id),
          ...applied,
        };
      }),

    listPromotes: qaLeadProcedure
      .input(
        z
          .object({
            status: z
              .enum(["pending", "approved", "applied", "rejected", "cancelled"])
              .optional(),
          })
          .optional()
      )
      .query(({ input }) => listPromoteRequests(input?.status)),

    getPromote: qaLeadProcedure
      .input(z.object({ promoteId: z.string().uuid() }))
      .query(async ({ input }) => resolvePromoteRequest(input.promoteId)),
  }),

  // Wave-7: template memory (closed-loop learning)
  memory: router({
    listForTemplate: qaLeadProcedure
      .input(z.object({ templateId: z.number().int().positive() }))
      .query(async ({ input }) => {
        const { listMemoryForTemplate } = await import(
          "../services/templateMemory"
        );
        return listMemoryForTemplate(input.templateId);
      }),
    listForJobSheet: qaLeadProcedure
      .input(z.object({ jobSheetId: z.number().int().positive() }))
      .query(async ({ input }) => {
        const audit = await db.getAuditResultByJobSheetId(input.jobSheetId);
        if (!audit?.templateId) return [];
        const { listMemoryForTemplate } = await import(
          "../services/templateMemory"
        );
        return listMemoryForTemplate(audit.templateId);
      }),
    proposeFromCorrection: qaLeadProcedure
      .input(
        z.object({
          findingId: z.number().int().positive(),
          correctedValue: z.string().min(1).max(4000),
          trainingReasonCode: z.enum([
            "ocr_misread",
            "roi_misaligned",
            "rule_wrong",
            "template_mismatch",
            "true_defect",
          ]),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const finding = await db.getAuditFindingById(input.findingId);
        if (!finding) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Finding not found",
          });
        }
        const audit = await db.getAuditResultById(finding.auditResultId);
        if (!audit) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Audit not found",
          });
        }
        const jobSheet = await db.getJobSheetById(audit.jobSheetId);
        if (jobSheet) {
          const { enforceJobSheetAccess } = await import(
            "../utils/authorization"
          );
          enforceJobSheetAccess(jobSheet, ctx.user);
        }
        const { recordCorrectionEvent } = await import(
          "../services/templateMemory"
        );
        const result = await recordCorrectionEvent({
          correctionType: "field_correction",
          trainingReasonCode: input.trainingReasonCode,
          findingId: input.findingId,
          auditResultId: finding.auditResultId,
          jobSheetId: audit.jobSheetId,
          templateId: audit.templateId ?? null,
          templateVersionId: audit.templateVersionId ?? null,
          fieldKey: finding.fieldName || "unknown",
          ruleId: finding.ruleId,
          originalValue: finding.normalisedSnippet ?? finding.rawSnippet,
          correctedValue: input.correctedValue,
          reviewerId: ctx.user.id,
          idempotencyKey: `propose:${input.findingId}:${input.trainingReasonCode}:${input.correctedValue.slice(0, 64)}`,
        });
        return {
          kind: result.studioConfirmRequired
            ? ("studio_draft" as const)
            : ("memory_candidate" as const),
          proposalId: result.candidateId,
          correctionId: result.correctionId,
          status: result.promotionStatus,
          agreeCount: result.agreeCount,
          studioConfirmRequired: result.studioConfirmRequired,
        };
      }),
  }),

  // Template override (review workstation)
  overrides: router({
    list: qaLeadProcedure.query(() => listOverrides()),
    get: qaLeadProcedure
      .input(z.object({ jobSheetId: z.number() }))
      .query(({ input }) => getTemplateOverride(input.jobSheetId)),
    set: qaLeadProcedure
      .input(
        z.object({
          jobSheetId: z.number(),
          templateId: z.number(),
          versionId: z.number(),
          originalConfidence: z.enum(["HIGH", "MEDIUM", "LOW"]),
          originalTopScore: z.number(),
          reason: z.string().min(5),
          reprocess: z.boolean().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const result = setTemplateOverride(
          input.jobSheetId,
          input.templateId,
          input.versionId,
          input.originalConfidence,
          input.originalTopScore,
          input.reason,
          ctx.user.id
        );
        if (!result.success) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: result.error || "Override failed",
          });
        }
        await db.logAction({
          userId: ctx.user.id,
          action: "TEMPLATE_OVERRIDE",
          entityType: "job_sheet",
          entityId: input.jobSheetId,
          details: {
            templateId: input.templateId,
            versionId: input.versionId,
            reason: input.reason,
          },
        });

        let reprocessResult = null as unknown;
        if (input.reprocess) {
          const { orchestrateJobSheetProcessing } = await import(
            "../services/documentProcessor"
          );
          reprocessResult = await orchestrateJobSheetProcessing({
            source: "template-reprocess",
            jobSheetId: input.jobSheetId,
            templateVersionId: input.versionId,
            userId: ctx.user.id,
          });
        }

        return { override: result.override, reprocessResult };
      }),
    clear: qaLeadProcedure
      .input(z.object({ jobSheetId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const cleared = clearTemplateOverride(input.jobSheetId);
        await db.logAction({
          userId: ctx.user.id,
          action: "TEMPLATE_OVERRIDE_CLEAR",
          entityType: "job_sheet",
          entityId: input.jobSheetId,
          details: { cleared },
        });
        return { cleared };
      }),
  }),
});

function bumpPatch(version: string): string {
  const parts = version.split(".").map(p => parseInt(p, 10));
  if (parts.length >= 3 && parts.every(n => !Number.isNaN(n))) {
    parts[2] += 1;
    return parts.join(".");
  }
  return `${version}-studio-${Date.now().toString(36)}`;
}

export type TemplateRouter = typeof templateRouter;
