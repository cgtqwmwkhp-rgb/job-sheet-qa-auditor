import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, adminProcedure, router } from "./_core/trpc";
import { z } from "zod";
import * as db from "./db";
import { storagePut } from "./storage";
import { nanoid } from "nanoid";

export const appRouter = router({
  system: systemRouter,
  
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
        // Decode base64 and upload to S3
        const buffer = Buffer.from(input.fileBase64, 'base64');
        const fileKey = `job-sheets/${ctx.user.id}/${nanoid()}-${input.fileName}`;
        
        const { url } = await storagePut(fileKey, buffer, input.fileType);
        
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
});

export type AppRouter = typeof appRouter;
