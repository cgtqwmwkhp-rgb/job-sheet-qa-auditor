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
  createStudioStarterRoi,
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
  type: z.enum(["required", "format", "range", "pattern", "custom"]),
  pattern: z.string().optional(),
  range: z
    .object({
      min: z.union([z.number(), z.string()]).optional(),
      max: z.union([z.number(), z.string()]).optional(),
    })
    .optional(),
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
          roiJson: createStudioStarterRoi(),
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
        const report = buildActivationReport(input.versionId);
        if (!report.allowed) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Activation gates failed: ${report.preconditions.blockingIssues
              .map(i => i.code)
              .join(", ")}${
              report.fixtures.blocking ? "; FIXTURES_FAILED" : ""
            }${!report.collision.allowed ? "; COLLISION" : ""}`,
          });
        }
        if (!report.fixtures.hasFixtures) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Fixtures required before staging activate — run Propose apply or Scaffold fixtures first",
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
            roiJson: proposal.proposedRoi,
            changeNotes: "Applied AI/OCR proposal (with rejects filtered)",
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
      .query(({ input }) => {
        const report = buildActivationReport(input.versionId);
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
