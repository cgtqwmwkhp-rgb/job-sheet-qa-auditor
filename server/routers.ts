import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, adminProcedure, router } from "./_core/trpc";
import { z } from "zod";
import * as db from "./db";
import { getStorageAdapter } from "./storage";
import { nanoid } from "nanoid";
import { processJobSheet } from "./services/documentProcessor";
import { validateMistralApiKey } from "./services/ocr";
import { templateRouter } from "./routers/templateRouter";
import { analyticsRouter } from "./routers/analyticsRouter";

export const appRouter = router({
  system: systemRouter,
  templates: templateRouter,
  analytics: analyticsRouter,
  
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ============ DASHBOARD & STATS ============
  stats: router({
    dashboard: protectedProcedure.query(async () => {
      const stats = await db.getDashboardStats();
      return stats ?? {
        totalAudits: 0,
        passRate: '0',
        reviewQueue: 0,
        criticalIssues: 0,
      };
    }),
  }),

  // ============ JOB SHEETS ============
  jobSheets: router({
    list: protectedProcedure
      .input(z.object({
        status: z.string().optional(),
        technicianId: z.number().optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }).optional())
      .query(async ({ input }) => {
        return db.getJobSheets(input);
      }),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return db.getJobSheetById(input.id);
      }),

    // Get a fresh SAS URL for viewing/downloading the file
    getFileUrl: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const jobSheet = await db.getJobSheetById(input.id);
        if (!jobSheet) {
          throw new Error('Job sheet not found');
        }
        
        // If we have a fileKey, generate a fresh SAS URL
        if (jobSheet.fileKey) {
          const storage = getStorageAdapter();
          const { url } = await storage.get(jobSheet.fileKey);
          return { url, fileName: jobSheet.fileName, fileType: jobSheet.fileType };
        }
        
        // Fall back to stored URL (may be expired for Azure)
        return { url: jobSheet.fileUrl, fileName: jobSheet.fileName, fileType: jobSheet.fileType };
      }),

    upload: protectedProcedure
      .input(z.object({
        fileName: z.string(),
        fileType: z.string(),
        fileBase64: z.string(),
        referenceNumber: z.string().optional(),
        siteInfo: z.string().optional(),
        technicianId: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Decode base64 and upload to storage
        const buffer = Buffer.from(input.fileBase64, 'base64');
        const fileKey = `job-sheets/${ctx.user.id}/${nanoid()}-${input.fileName}`;
        
        // Use the storage adapter (azure, local, etc.) based on STORAGE_PROVIDER
        const storage = getStorageAdapter();
        const { url } = await storage.put(fileKey, buffer, input.fileType);
        
        // Create job sheet record
        const result = await db.createJobSheet({
          referenceNumber: input.referenceNumber,
          fileUrl: url,
          fileKey: fileKey,
          fileName: input.fileName,
          fileType: input.fileType,
          fileSizeBytes: buffer.length,
          status: 'pending',
          technicianId: input.technicianId,
          siteInfo: input.siteInfo,
          uploadedBy: ctx.user.id,
        });

        // Log the action
        await db.logAction({
          userId: ctx.user.id,
          action: 'UPLOAD_JOB_SHEET',
          entityType: 'job_sheet',
          entityId: result.id,
          details: { fileName: input.fileName },
        });

        return result;
      }),

    updateStatus: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(['pending', 'processing', 'completed', 'failed', 'review_queue']),
      }))
      .mutation(async ({ ctx, input }) => {
        await db.updateJobSheetStatus(input.id, input.status);
        
        await db.logAction({
          userId: ctx.user.id,
          action: 'UPDATE_JOB_SHEET_STATUS',
          entityType: 'job_sheet',
          entityId: input.id,
          details: { newStatus: input.status },
        });

        return { success: true };
      }),

    // Process a job sheet through OCR + AI analysis
    process: protectedProcedure
      .input(z.object({
        id: z.number(),
        goldSpecId: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const jobSheet = await db.getJobSheetById(input.id);
        if (!jobSheet) {
          throw new Error('Job sheet not found');
        }

        const result = await processJobSheet(
          input.id,
          jobSheet.fileUrl,
          input.goldSpecId,
          ctx.user.id
        );

        return result;
      }),
  }),

  // ============ AUDIT RESULTS ============
  audits: router({
    list: protectedProcedure
      .input(z.object({
        result: z.string().optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }).optional())
      .query(async ({ input }) => {
        return db.getAuditResults(input);
      }),

    getByJobSheet: protectedProcedure
      .input(z.object({ jobSheetId: z.number() }))
      .query(async ({ input }) => {
        return db.getAuditResultByJobSheetId(input.jobSheetId);
      }),

    getFindings: protectedProcedure
      .input(z.object({ auditResultId: z.number() }))
      .query(async ({ input }) => {
        return db.getAuditFindingsByResultId(input.auditResultId);
      }),
  }),

  // ============ GOLD SPECS ============
  specs: router({
    list: protectedProcedure.query(async () => {
      return db.getAllGoldSpecs();
    }),

    getActive: protectedProcedure
      .input(z.object({ specType: z.string().optional() }).optional())
      .query(async ({ input }) => {
        return db.getActiveGoldSpec(input?.specType);
      }),

    create: adminProcedure
      .input(z.object({
        name: z.string(),
        version: z.string(),
        description: z.string().optional(),
        schema: z.any(),
        specType: z.enum(['base', 'client', 'contract', 'workType']).default('base'),
        parentSpecId: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const result = await db.createGoldSpec({
          ...input,
          createdBy: ctx.user.id,
        });

        await db.logAction({
          userId: ctx.user.id,
          action: 'CREATE_GOLD_SPEC',
          entityType: 'gold_spec',
          entityId: result.id,
          details: { name: input.name, version: input.version },
        });

        return result;
      }),

    activate: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const result = await db.activateGoldSpec(input.id);

        await db.logAction({
          userId: ctx.user.id,
          action: 'ACTIVATE_GOLD_SPEC',
          entityType: 'gold_spec',
          entityId: input.id,
          details: { activated: true },
        });

        return result;
      }),
  }),

  // ============ DISPUTES ============
  disputes: router({
    list: protectedProcedure
      .input(z.object({
        status: z.string().optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }).optional())
      .query(async ({ input }) => {
        return db.getDisputes(input);
      }),

    create: protectedProcedure
      .input(z.object({
        auditFindingId: z.number(),
        reason: z.string(),
        evidenceUrls: z.array(z.string()).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const result = await db.createDispute({
          auditFindingId: input.auditFindingId,
          raisedBy: ctx.user.id,
          reason: input.reason,
          evidenceUrls: input.evidenceUrls,
        });

        await db.logAction({
          userId: ctx.user.id,
          action: 'CREATE_DISPUTE',
          entityType: 'dispute',
          entityId: result.id,
          details: { auditFindingId: input.auditFindingId },
        });

        return result;
      }),

    updateStatus: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(['open', 'under_review', 'accepted', 'rejected', 'escalated']),
        reviewNotes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await db.updateDisputeStatus(
          input.id, 
          input.status, 
          ctx.user.id, 
          input.reviewNotes
        );

        await db.logAction({
          userId: ctx.user.id,
          action: 'UPDATE_DISPUTE_STATUS',
          entityType: 'dispute',
          entityId: input.id,
          details: { newStatus: input.status },
        });

        return { success: true };
      }),
  }),

  // ============ WAIVERS ============
  waivers: router({
    create: adminProcedure
      .input(z.object({
        auditFindingId: z.number(),
        reason: z.string(),
        expiresAt: z.date().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const result = await db.createWaiver({
          auditFindingId: input.auditFindingId,
          approverId: ctx.user.id,
          reason: input.reason,
          expiresAt: input.expiresAt,
          auditTrail: [{
            action: 'CREATED',
            userId: ctx.user.id,
            timestamp: new Date().toISOString(),
            reason: input.reason,
          }],
        });

        await db.logAction({
          userId: ctx.user.id,
          action: 'CREATE_WAIVER',
          entityType: 'waiver',
          entityId: result.id,
          details: { auditFindingId: input.auditFindingId },
        });

        return result;
      }),

    getByFinding: protectedProcedure
      .input(z.object({ auditFindingId: z.number() }))
      .query(async ({ input }) => {
        return db.getWaiverByFindingId(input.auditFindingId);
      }),
  }),

  // ============ USERS ============
  users: router({
    list: adminProcedure.query(async () => {
      return db.getAllUsers();
    }),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return db.getUserById(input.id);
      }),

    updateRole: adminProcedure
      .input(z.object({
        id: z.number(),
        role: z.enum(['admin', 'qa_lead', 'technician', 'viewer']),
      }))
      .mutation(async ({ ctx, input }) => {
        const result = await db.updateUserRole(input.id, input.role);

        await db.logAction({
          userId: ctx.user.id,
          action: 'UPDATE_USER_ROLE',
          entityType: 'user',
          entityId: input.id,
          details: { newRole: input.role },
        });

        return result;
      }),
  }),

  // ============ AI SERVICES ============
  ai: router({
    // Check if AI services (Mistral OCR, Gemini) are configured and working
    healthCheck: protectedProcedure.query(async () => {
      const mistralResult = await validateMistralApiKey();
      return {
        mistralOcr: {
          configured: !!process.env.MISTRAL_API_KEY,
          valid: mistralResult.valid,
          error: mistralResult.error,
        },
        geminiAnalyzer: {
          configured: !!process.env.BUILT_IN_FORGE_API_KEY,
          valid: true, // Forge API is always available
        },
      };
    }),
  }),

  // ============ AUDIT LOG ============
  auditLog: router({
    list: adminProcedure
      .input(z.object({
        userId: z.number().optional(),
        entityType: z.string().optional(),
        limit: z.number().min(1).max(500).default(100),
        offset: z.number().min(0).default(0),
      }).optional())
      .query(async ({ input }) => {
        return db.getAuditLogs(input);
      }),
  }),

  // ============ PROCESSING SETTINGS ============
  processingSettings: router({
    get: protectedProcedure.query(async () => {
      return db.getProcessingSettings();
    }),

    getAll: adminProcedure.query(async () => {
      return db.getAllProcessingSettings();
    }),

    update: adminProcedure
      .input(z.object({
        settingKey: z.string(),
        settingValue: z.any(),
        description: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await db.updateProcessingSetting(
          input.settingKey,
          input.settingValue,
          ctx.user.id,
          input.description
        );

        await db.logAction({
          userId: ctx.user.id,
          action: 'UPDATE_PROCESSING_SETTING',
          entityType: 'processing_setting',
          entityId: null,
          details: { 
            settingKey: input.settingKey, 
            newValue: input.settingValue 
          },
        });

        return { success: true };
      }),

    updateBatch: adminProcedure
      .input(z.object({
        settings: z.array(z.object({
          settingKey: z.string(),
          settingValue: z.any(),
        })),
      }))
      .mutation(async ({ ctx, input }) => {
        for (const setting of input.settings) {
          await db.updateProcessingSetting(
            setting.settingKey,
            setting.settingValue,
            ctx.user.id
          );
        }

        await db.logAction({
          userId: ctx.user.id,
          action: 'UPDATE_PROCESSING_SETTINGS_BATCH',
          entityType: 'processing_setting',
          entityId: null,
          details: { 
            updatedKeys: input.settings.map(s => s.settingKey) 
          },
        });

        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
