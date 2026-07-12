import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import {
  publicProcedure,
  protectedProcedure,
  adminProcedure,
  qaLeadProcedure,
  router,
} from "./_core/trpc";
import { z } from "zod";
import * as db from "./db";
import { getStorageAdapter } from "./storage";
import { nanoid } from "nanoid";
import { calculateHash } from "./utils/fileValidation";
import { orchestrateJobSheetProcessing } from "./services/documentProcessor";
import {
  enqueueJobSheetProcessing,
  isAsyncProcessingEnabled,
} from "./services/jobQueue";
import { validateMistralApiKey } from "./services/ocr";
import { resolveProcessStatus } from "./services/processStatus";
import { templateRouter } from "./routers/templateRouter";
import { analyticsRouter } from "./routers/analyticsRouter";
import { auditActionsRouter } from "./routers/auditActionsRouter";
import { fixPacksRouter } from "./routers/fixPacksRouter";
import { TRPCError } from "@trpc/server";
import {
  enforceRateLimit,
  RateLimitError,
  RATE_LIMITS,
} from "./utils/rateLimiter";
import {
  DEFAULT_AUDIT_POLICY,
  mergeAuditPolicy,
  SAFETY_CRITICAL_RULE_IDS,
  type FailClass,
} from "./services/auditPolicy";
import {
  isImageQaIntakeEnabled,
  runIntakeGate,
  type IntakeGateResult,
} from "./services/imageQa";
import { getModelRegistry } from "./services/modelRegistry";

function throwIfRateLimited(fn: () => void): void {
  try {
    fn();
  } catch (error) {
    if (error instanceof RateLimitError) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: error.message,
        cause: error,
      });
    }
    throw error;
  }
}

function bumpPatchVersion(version: string): string {
  const parts = version.split(".");
  if (parts.length !== 3) return version;
  const patch = parseInt(parts[2], 10);
  if (Number.isNaN(patch)) return version;
  return `${parts[0]}.${parts[1]}.${patch + 1}`;
}

export const appRouter = router({
  system: systemRouter,
  templates: templateRouter,
  analytics: analyticsRouter,
  /** Phase 1.9: fix pack export / assign / acknowledge */
  fixPacks: fixPacksRouter,
  /** PR-10: waive / override / flag / approve / undo */
  auditActions: auditActionsRouter,

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
      return (
        stats ?? {
          totalAudits: 0,
          passRate: "0",
          reviewQueue: 0,
          criticalIssues: 0,
        }
      );
    }),
  }),

  // ============ JOB SHEETS ============
  jobSheets: router({
    list: protectedProcedure
      .input(
        z
          .object({
            status: z.string().optional(),
            technicianId: z.number().optional(),
            limit: z.number().min(1).max(100).default(50),
            offset: z.number().min(0).default(0),
          })
          .optional()
      )
      .query(async ({ ctx, input }) => {
        const allJobSheets = await db.getJobSheets(input);
        
        // Object-level filtering: regular users only see their own uploads
        const { filterJobSheetsByAccess } = await import("./utils/authorization");
        return filterJobSheetsByAccess(allJobSheets, ctx.user);
      }),

    /** Users eligible for technician attribution on upload / assign. */
    listTechnicians: protectedProcedure.query(async () => {
      const all = await db.getAllUsers();
      return all
        .filter(u => Boolean(u.name?.trim() || u.email))
        .map(u => ({
          id: u.id,
          name: u.name?.trim() || u.email || `User ${u.id}`,
          role: u.role,
        }))
        .sort((a, b) => {
          const rank = (role: string) =>
            role === "technician" ? 0 : role === "qa_lead" ? 1 : 2;
          const d = rank(a.role) - rank(b.role);
          return d !== 0 ? d : a.name.localeCompare(b.name);
        });
    }),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const jobSheet = await db.getJobSheetById(input.id);
        
        // Object-level authorization: ensure user can access this job sheet
        const { enforceJobSheetAccess } = await import("./utils/authorization");
        enforceJobSheetAccess(jobSheet, ctx.user);
        
        return jobSheet;
      }),

    /** PR-11: pollable per-stage processing progress (live → report → status). */
    processStatus: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const status = await resolveProcessStatus(input.id);
        if (!status) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Job sheet not found",
          });
        }
        return status;
      }),

    // Get a fresh SAS URL for viewing/downloading the file
    getFileUrl: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const jobSheet = await db.getJobSheetById(input.id);
        if (!jobSheet) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Job sheet not found",
          });
        }

        // Object-level authorization: ensure user can access this file
        const { enforceJobSheetAccess } = await import("./utils/authorization");
        enforceJobSheetAccess(jobSheet, ctx.user);

        // If we have a fileKey, generate a fresh SAS URL
        if (jobSheet.fileKey) {
          const storage = getStorageAdapter();
          const { url } = await storage.get(jobSheet.fileKey);
          return {
            url,
            fileName: jobSheet.fileName,
            fileType: jobSheet.fileType,
          };
        }

        // Fall back to stored URL (may be expired for Azure)
        return {
          url: jobSheet.fileUrl,
          fileName: jobSheet.fileName,
          fileType: jobSheet.fileType,
        };
      }),

    upload: protectedProcedure
      .input(
        z.object({
          fileName: z.string(),
          fileType: z.string(),
          fileBase64: z.string(),
          referenceNumber: z.string().optional(),
          siteInfo: z.string().optional(),
          technicianId: z.number().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        throwIfRateLimited(() =>
          enforceRateLimit(`user:${ctx.user.id}:upload`, RATE_LIMITS.upload)
        );

        // Decode base64 before storage (and optional intake gate)
        const buffer = Buffer.from(input.fileBase64, "base64");

        // Validate file type and size
        const { validateFile, sanitizeFilename } = await import("./utils/fileValidation");
        const validation = validateFile(buffer, input.fileType, {
          maxSizeBytes: 10 * 1024 * 1024, // 10MB
          allowedTypes: ['application/pdf', 'image/jpeg', 'image/png'],
        });

        if (!validation.valid) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `File validation failed: ${validation.errors.join(", ")}`,
          });
        }

        // Feature-flagged Image QA intake gate (default off). Fail-open on errors.
        // Runs AFTER rate limit, BEFORE storage — OCRs the real upload buffer when enabled.
        let intake: IntakeGateResult | undefined;
        if (isImageQaIntakeEnabled()) {
          intake = await runIntakeGate({
            buffer,
            fileName: input.fileName,
            mimeType: input.fileType,
          });

          if (!intake.passed && !intake.skipped) {
            await db.logAction({
              userId: ctx.user.id,
              action: "UPLOAD_JOB_SHEET_REJECTED",
              entityType: "job_sheet",
              details: {
                fileName: input.fileName,
                rejected: true,
                intake: {
                  passed: intake.passed,
                  skipped: intake.skipped,
                  qualityScore: intake.qualityScore,
                  grade: intake.grade,
                  retakeFeedback: intake.retakeFeedback,
                },
              },
            });

            return {
              rejected: true as const,
              intake,
              retakeFeedback: intake.retakeFeedback,
            };
          }
        }

        // Sanitize filename to prevent path traversal and special characters
        const sanitizedFileName = sanitizeFilename(input.fileName);
        const fileKey = `job-sheets/${ctx.user.id}/${nanoid()}-${sanitizedFileName}`;

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
          fileHash: calculateHash(buffer),
          status: "pending",
          technicianId: input.technicianId,
          siteInfo: input.siteInfo,
          uploadedBy: ctx.user.id,
        });

        // Log the action
        await db.logAction({
          userId: ctx.user.id,
          action: "UPLOAD_JOB_SHEET",
          entityType: "job_sheet",
          entityId: result.id,
          details: {
            fileName: input.fileName,
            ...(intake
              ? {
                  intake: {
                    passed: intake.passed,
                    skipped: intake.skipped,
                    qualityScore: intake.qualityScore,
                    grade: intake.grade,
                  },
                }
              : {}),
          },
        });

        return intake ? { ...result, intake } : result;
      }),

    updateStatus: qaLeadProcedure
      .input(
        z.object({
          id: z.number(),
          status: z.enum([
            "pending",
            "processing",
            "completed",
            "failed",
            "review_queue",
          ]),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await db.updateJobSheetStatus(input.id, input.status);

        await db.logAction({
          userId: ctx.user.id,
          action: "UPDATE_JOB_SHEET_STATUS",
          entityType: "job_sheet",
          entityId: input.id,
          details: { newStatus: input.status },
        });

        return { success: true };
      }),

    // Process a job sheet through OCR + AI analysis
    process: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          goldSpecId: z.number().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        throwIfRateLimited(() =>
          enforceRateLimit(
            `user:${ctx.user.id}:processing`,
            RATE_LIMITS.processing
          )
        );

        const jobSheet = await db.getJobSheetById(input.id);
        if (!jobSheet) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Job sheet not found",
          });
        }

        if (jobSheet.status === "processing") {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Cannot process: document is currently being processed. Please wait for the current processing to complete.",
          });
        }

        if (isAsyncProcessingEnabled()) {
          return enqueueJobSheetProcessing({
            source: "primary",
            jobSheetId: input.id,
            documentUrl: jobSheet.fileUrl,
            goldSpecId: input.goldSpecId,
            userId: ctx.user.id,
          });
        }

        const result = await orchestrateJobSheetProcessing({
          source: "primary",
          jobSheetId: input.id,
          documentUrl: jobSheet.fileUrl,
          goldSpecId: input.goldSpecId,
          userId: ctx.user.id,
        });

        return result;
      }),

    /**
     * Assign / clear technician attribution for engineer analytics.
     * Available to all staff (analytics page is already RequireStaff).
     */
    assignTechnician: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          technicianId: z.number().nullable(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const jobSheet = await db.getJobSheetById(input.id);
        if (!jobSheet) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Job sheet not found",
          });
        }
        if (input.technicianId != null) {
          const user = await db.getUserById(input.technicianId);
          if (!user) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Technician user not found",
            });
          }
        }
        await db.updateJobSheetTechnicianId(input.id, input.technicianId);
        await db.logAction({
          userId: ctx.user.id,
          action: "ASSIGN_JOB_SHEET_TECHNICIAN",
          entityType: "job_sheet",
          entityId: input.id,
          details: { technicianId: input.technicianId },
        });
        return { success: true, technicianId: input.technicianId };
      }),

    /**
     * Preview OCR names on unattributed sheets + auto-match status.
     */
    getAttributionGap: protectedProcedure
      .input(
        z
          .object({
            startDate: z.string().optional(),
            endDate: z.string().optional(),
            limit: z.number().min(1).max(500).default(200),
          })
          .optional()
      )
      .query(async ({ input }) => {
        const { extractTechnicianNameFromReport, buildAttributionClusters } =
          await import("./services/technicianAttribution");

        const users = await db.getAllUsers();
        const candidates = users.map(u => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
        }));
        const sheets = await db.getUnattributedJobSheets({
          limit: input?.limit ?? 200,
          startDate: input?.startDate ? new Date(input.startDate) : undefined,
          endDate: input?.endDate ? new Date(input.endDate) : undefined,
        });

        const withNames: Array<{ id: number; extractedName: string | null }> =
          [];
        let noNameCount = 0;
        for (const sheet of sheets) {
          const report = await db.getLatestAuditReportJson(sheet.id);
          const name = extractTechnicianNameFromReport(report);
          withNames.push({ id: sheet.id, extractedName: name });
          if (!name) noNameCount++;
        }

        const clusters = buildAttributionClusters({
          sheets: withNames,
          candidates,
        });

        return {
          unattributedCount: sheets.length,
          noNameCount,
          matchableCount: clusters
            .filter(c => c.match.technicianId != null)
            .reduce((sum, c) => sum + c.sheetCount, 0),
          unmatchedNameCount: clusters.filter(c => c.match.technicianId == null)
            .length,
          clusters: clusters.map(c => ({
            extractedName: c.extractedName,
            displayName: c.displayName,
            sheetCount: c.sheetCount,
            jobSheetIds: c.jobSheetIds.slice(0, 20),
            matchedTechnicianId: c.match.technicianId,
            matchConfidence: c.match.confidence,
            suggestedUserName: c.suggestedUserName,
          })),
          users: candidates.map(c => ({
            id: c.id,
            name: c.name?.trim() || c.email || `User ${c.id}`,
            role: c.role,
          })),
        };
      }),

    /**
     * Backfill technicianId from OCR names on unattributed sheets.
     * Open to all authenticated staff (was QA-lead-only — blocked viewers).
     */
    backfillTechnicianAttribution: protectedProcedure
      .input(
        z
          .object({
            limit: z.number().min(1).max(500).default(200),
            startDate: z.string().optional(),
            endDate: z.string().optional(),
            createMissingUsers: z.boolean().optional(),
          })
          .optional()
      )
      .mutation(async ({ ctx, input }) => {
        const {
          extractTechnicianNameFromReport,
          resolveTechnicianMatch,
          buildAttributionClusters,
          prettifyExtractedName,
          attributionOpenIdForName,
        } = await import("./services/technicianAttribution");

        let users = await db.getAllUsers();
        let candidates = users.map(u => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
        }));
        const sheets = await db.getUnattributedJobSheets({
          limit: input?.limit ?? 200,
          startDate: input?.startDate ? new Date(input.startDate) : undefined,
          endDate: input?.endDate ? new Date(input.endDate) : undefined,
        });

        const withNames: Array<{ id: number; extractedName: string | null }> =
          [];
        for (const sheet of sheets) {
          const report = await db.getLatestAuditReportJson(sheet.id);
          withNames.push({
            id: sheet.id,
            extractedName: extractTechnicianNameFromReport(report),
          });
        }

        let createdUsers = 0;
        if (input?.createMissingUsers) {
          const clusters = buildAttributionClusters({
            sheets: withNames,
            candidates,
          });
          for (const cluster of clusters) {
            if (cluster.match.technicianId != null) continue;
            const pretty = prettifyExtractedName(cluster.displayName);
            const openId = attributionOpenIdForName(cluster.displayName);
            const ensured = await db.ensureAttributionTechnicianUser({
              openId,
              name: pretty,
            });
            if (ensured.created) createdUsers++;
          }
          users = await db.getAllUsers();
          candidates = users.map(u => ({
            id: u.id,
            name: u.name,
            email: u.email,
            role: u.role,
          }));
        }

        let attributed = 0;
        let unresolved = 0;
        let noName = 0;
        const samples: Array<{
          jobSheetId: number;
          extractedName: string | null;
          technicianId: number | null;
          confidence: string | null;
        }> = [];
        const unresolvedNames = new Map<string, number>();

        for (const row of withNames) {
          const name = row.extractedName;
          const match = resolveTechnicianMatch(name, candidates);
          if (match.technicianId != null) {
            await db.updateJobSheetTechnicianId(row.id, match.technicianId);
            attributed++;
            if (samples.length < 15) {
              samples.push({
                jobSheetId: row.id,
                extractedName: name,
                technicianId: match.technicianId,
                confidence: match.confidence,
              });
            }
          } else if (name) {
            unresolved++;
            const key = name.trim();
            unresolvedNames.set(key, (unresolvedNames.get(key) ?? 0) + 1);
            if (samples.length < 15) {
              samples.push({
                jobSheetId: row.id,
                extractedName: name,
                technicianId: null,
                confidence: null,
              });
            }
          } else {
            noName++;
          }
        }

        await db.logAction({
          userId: ctx.user.id,
          action: "BACKFILL_TECHNICIAN_ATTRIBUTION",
          entityType: "job_sheet",
          details: {
            scanned: sheets.length,
            attributed,
            unresolved,
            noName,
            createdUsers,
          },
        });

        return {
          scanned: sheets.length,
          attributed,
          unresolved,
          noName,
          createdUsers,
          samples,
          unresolvedNames: Array.from(unresolvedNames.entries())
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count),
        };
      }),

    /**
     * Assign all unattributed sheets with a given OCR name to one user.
     */
    assignByExtractedName: protectedProcedure
      .input(
        z.object({
          extractedName: z.string().min(1),
          technicianId: z.number(),
          limit: z.number().min(1).max(500).default(200),
          startDate: z.string().optional(),
          endDate: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const { extractTechnicianNameFromReport, canonicalizePersonName } =
          await import("./services/technicianAttribution");

        const user = await db.getUserById(input.technicianId);
        if (!user) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Technician user not found",
          });
        }

        const target = canonicalizePersonName(input.extractedName);
        const sheets = await db.getUnattributedJobSheets({
          limit: input.limit,
          startDate: input.startDate ? new Date(input.startDate) : undefined,
          endDate: input.endDate ? new Date(input.endDate) : undefined,
        });

        let assigned = 0;
        for (const sheet of sheets) {
          const report = await db.getLatestAuditReportJson(sheet.id);
          const name = extractTechnicianNameFromReport(report);
          if (!name) continue;
          if (canonicalizePersonName(name) !== target) continue;
          await db.updateJobSheetTechnicianId(sheet.id, input.technicianId);
          assigned++;
        }

        await db.logAction({
          userId: ctx.user.id,
          action: "ASSIGN_BY_EXTRACTED_NAME",
          entityType: "job_sheet",
          details: {
            extractedName: input.extractedName,
            technicianId: input.technicianId,
            assigned,
          },
        });

        return { assigned, technicianId: input.technicianId };
      }),

    /**
     * Create technician user from OCR name and attribute matching sheets.
     */
    ensureTechnicianFromName: protectedProcedure
      .input(
        z.object({
          extractedName: z.string().min(1),
          attributeMatchingSheets: z.boolean().default(true),
          limit: z.number().min(1).max(500).default(200),
          startDate: z.string().optional(),
          endDate: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const {
          prettifyExtractedName,
          attributionOpenIdForName,
          canonicalizePersonName,
          extractTechnicianNameFromReport,
        } = await import("./services/technicianAttribution");

        const pretty = prettifyExtractedName(input.extractedName);
        const openId = attributionOpenIdForName(input.extractedName);
        const ensured = await db.ensureAttributionTechnicianUser({
          openId,
          name: pretty,
        });

        let assigned = 0;
        if (input.attributeMatchingSheets) {
          const target = canonicalizePersonName(input.extractedName);
          const sheets = await db.getUnattributedJobSheets({
            limit: input.limit,
            startDate: input.startDate ? new Date(input.startDate) : undefined,
            endDate: input.endDate ? new Date(input.endDate) : undefined,
          });
          for (const sheet of sheets) {
            const report = await db.getLatestAuditReportJson(sheet.id);
            const name = extractTechnicianNameFromReport(report);
            if (!name) continue;
            if (canonicalizePersonName(name) !== target) continue;
            await db.updateJobSheetTechnicianId(sheet.id, ensured.id);
            assigned++;
          }
        }

        await db.logAction({
          userId: ctx.user.id,
          action: "ENSURE_TECHNICIAN_FROM_NAME",
          entityType: "user",
          entityId: ensured.id,
          details: {
            extractedName: input.extractedName,
            prettyName: pretty,
            created: ensured.created,
            assigned,
          },
        });

        return {
          technicianId: ensured.id,
          name: pretty,
          created: ensured.created,
          assigned,
        };
      }),

    reprocess: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        throwIfRateLimited(() =>
          enforceRateLimit(
            `user:${ctx.user.id}:processing`,
            RATE_LIMITS.processing
          )
        );

        const jobSheet = await db.getJobSheetById(input.id);
        if (!jobSheet) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Job sheet not found",
          });
        }

        if (jobSheet.status === "processing") {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Cannot reprocess: document is currently being processed. Please wait for the current processing to complete.",
          });
        }

        await db.logAction({
          userId: ctx.user.id,
          action: "REPROCESS_JOB_SHEET",
          entityType: "job_sheet",
          entityId: input.id,
          details: { previousStatus: jobSheet.status },
        });

        if (isAsyncProcessingEnabled()) {
          return enqueueJobSheetProcessing({
            source: "reprocess",
            jobSheetId: input.id,
            documentUrl: jobSheet.fileUrl,
            userId: ctx.user.id,
          });
        }

        const result = await orchestrateJobSheetProcessing({
          source: "reprocess",
          jobSheetId: input.id,
          documentUrl: jobSheet.fileUrl,
          userId: ctx.user.id,
        });

        return result;
      }),
  }),

  // ============ AUDIT RESULTS ============
  audits: router({
    list: protectedProcedure
      .input(
        z
          .object({
            result: z.string().optional(),
            limit: z.number().min(1).max(100).default(50),
            offset: z.number().min(0).default(0),
          })
          .optional()
      )
      .query(async ({ ctx, input }) => {
        const allAudits = await db.getAuditResults(input);
        
        // Object-level filtering: regular users only see audits for their own uploads
        // First, get all job sheets they have access to
        const allJobSheets = await db.getJobSheets();
        const { filterJobSheetsByAccess } = await import("./utils/authorization");
        const accessibleJobSheets = filterJobSheetsByAccess(allJobSheets, ctx.user);
        const accessibleJobSheetIds = new Set(accessibleJobSheets.map(js => js.id));
        
        // Filter audits to only those for accessible job sheets
        return allAudits.filter(audit => accessibleJobSheetIds.has(audit.jobSheetId));
      }),

    getByJobSheet: protectedProcedure
      .input(z.object({ jobSheetId: z.number() }))
      .query(async ({ ctx, input }) => {
        // Object-level authorization: check if user can access the job sheet
        const jobSheet = await db.getJobSheetById(input.jobSheetId);
        const { enforceJobSheetAccess } = await import("./utils/authorization");
        enforceJobSheetAccess(jobSheet, ctx.user);
        
        return db.getAuditResultByJobSheetId(input.jobSheetId);
      }),

    getFindings: protectedProcedure
      .input(z.object({ auditResultId: z.number() }))
      .query(async ({ ctx, input }) => {
        // Object-level authorization: check if user can access the audit result
        const audit = await db.getAuditResultById(input.auditResultId);
        if (!audit) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Audit result not found",
          });
        }
        
        const jobSheet = await db.getJobSheetById(audit.jobSheetId);
        const { enforceAuditAccess } = await import("./utils/authorization");
        enforceAuditAccess(audit, jobSheet, ctx.user);
        
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
      .input(
        z.object({
          name: z.string(),
          version: z.string(),
          description: z.string().optional(),
          schema: z.any(),
          specType: z
            .enum(["base", "client", "contract", "workType"])
            .default("base"),
          parentSpecId: z.number().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const result = await db.createGoldSpec({
          ...input,
          createdBy: ctx.user.id,
        });

        await db.logAction({
          userId: ctx.user.id,
          action: "CREATE_GOLD_SPEC",
          entityType: "gold_spec",
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
          action: "ACTIVATE_GOLD_SPEC",
          entityType: "gold_spec",
          entityId: input.id,
          details: { activated: true },
        });

        return result;
      }),
  }),

  // ============ DISPUTES ============
  disputes: router({
    list: protectedProcedure
      .input(
        z
          .object({
            status: z.string().optional(),
            limit: z.number().min(1).max(100).default(50),
            offset: z.number().min(0).default(0),
          })
          .optional()
      )
      .query(async ({ input }) => {
        return db.getDisputes(input);
      }),

    create: protectedProcedure
      .input(
        z.object({
          auditFindingId: z.number(),
          reason: z.string(),
          evidenceUrls: z.array(z.string()).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const result = await db.createDispute({
          auditFindingId: input.auditFindingId,
          raisedBy: ctx.user.id,
          reason: input.reason,
          evidenceUrls: input.evidenceUrls,
        });

        await db.logAction({
          userId: ctx.user.id,
          action: "CREATE_DISPUTE",
          entityType: "dispute",
          entityId: result.id,
          details: { auditFindingId: input.auditFindingId },
        });

        return result;
      }),

    updateStatus: qaLeadProcedure
      .input(
        z.object({
          id: z.number(),
          status: z.enum([
            "open",
            "under_review",
            "accepted",
            "rejected",
            "escalated",
          ]),
          reviewNotes: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await db.updateDisputeStatus(
          input.id,
          input.status,
          ctx.user.id,
          input.reviewNotes
        );

        await db.logAction({
          userId: ctx.user.id,
          action: "UPDATE_DISPUTE_STATUS",
          entityType: "dispute",
          entityId: input.id,
          details: { newStatus: input.status },
        });

        return { success: true };
      }),
  }),

  // ============ WAIVERS ============
  waivers: router({
    create: adminProcedure
      .input(
        z.object({
          auditFindingId: z.number(),
          reason: z.string(),
          expiresAt: z.date().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const result = await db.createWaiver({
          auditFindingId: input.auditFindingId,
          approverId: ctx.user.id,
          reason: input.reason,
          expiresAt: input.expiresAt,
          auditTrail: [
            {
              action: "CREATED",
              userId: ctx.user.id,
              timestamp: new Date().toISOString(),
              reason: input.reason,
            },
          ],
        });

        await db.logAction({
          userId: ctx.user.id,
          action: "CREATE_WAIVER",
          entityType: "waiver",
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
      .query(async ({ ctx, input }) => {
        // Object-level authorization: users can only access their own profile (unless admin)
        const { enforceUserProfileAccess } = await import("./utils/authorization");
        enforceUserProfileAccess(input.id, ctx.user);
        
        return db.getUserById(input.id);
      }),

    updateRole: adminProcedure
      .input(
        z.object({
          id: z.number(),
          role: z.enum(["admin", "qa_lead", "technician", "viewer"]),
        })
      )
      .mutation(async ({ ctx, input }) => {
        // Client "viewer" maps to DB enum "user"
        const dbRole = input.role === "viewer" ? "user" : input.role;
        const result = await db.updateUserRole(input.id, dbRole);

        await db.logAction({
          userId: ctx.user.id,
          action: "UPDATE_USER_ROLE",
          entityType: "user",
          entityId: input.id,
          details: { newRole: input.role, dbRole },
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
          configured: !!process.env.GEMINI_API_KEY,
          valid: !!process.env.GEMINI_API_KEY,
        },
        // PR-9: pinned models (no secrets)
        modelRegistry: getModelRegistry(),
      };
    }),

    /** PR-9: env-driven model registry (no secrets, no live API calls). */
    modelRegistry: protectedProcedure.query(() => getModelRegistry()),
  }),

  // ============ AUDIT LOG ============
  auditLog: router({
    list: adminProcedure
      .input(
        z
          .object({
            userId: z.number().optional(),
            entityType: z.string().optional(),
            limit: z.number().min(1).max(500).default(100),
            offset: z.number().min(0).default(0),
          })
          .optional()
      )
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
      .input(
        z.object({
          settingKey: z.string(),
          settingValue: z.any(),
          description: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await db.updateProcessingSetting(
          input.settingKey,
          input.settingValue,
          ctx.user.id,
          input.description
        );

        await db.logAction({
          userId: ctx.user.id,
          action: "UPDATE_PROCESSING_SETTING",
          entityType: "processing_setting",
          entityId: null,
          details: {
            settingKey: input.settingKey,
            newValue: input.settingValue,
          },
        });

        return { success: true };
      }),

    updateBatch: adminProcedure
      .input(
        z.object({
          settings: z.array(
            z.object({
              settingKey: z.string(),
              settingValue: z.any(),
            })
          ),
        })
      )
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
          action: "UPDATE_PROCESSING_SETTINGS_BATCH",
          entityType: "processing_setting",
          entityId: null,
          details: {
            updatedKeys: input.settings.map(s => s.settingKey),
          },
        });

        return { success: true };
      }),
  }),

  // ============ AUDIT POLICY (Major / Minor fail) ============
  auditPolicy: router({
    get: protectedProcedure.query(async () => {
      return db.getAuditPolicy();
    }),

    getDefaults: protectedProcedure.query(() => {
      return DEFAULT_AUDIT_POLICY;
    }),

    save: qaLeadProcedure
      .input(
        z.object({
          version: z.string().min(1),
          weights: z.object({
            major: z.number().min(0).max(100),
            minor: z.number().min(0).max(100),
            informational: z.number().min(0).max(100),
          }),
          forms: z.record(
            z.string(),
            z.object({
              label: z.string(),
              rules: z.array(
                z.object({
                  ruleId: z.string(),
                  label: z.string(),
                  description: z.string(),
                  failClass: z.enum([
                    "major",
                    "minor",
                    "informational",
                  ] as const satisfies readonly FailClass[]),
                  enabled: z.boolean(),
                  fieldAliases: z.array(z.string()).optional(),
                })
              ),
            })
          ),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const currentPolicy = await db.getAuditPolicy();

        // Optimistic version check: reject stale saves
        if (currentPolicy.version !== input.version) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "Audit policy was modified by another user. Please refresh and retry.",
          });
        }

        // Safety-critical guard: changing failClass or enabled on
        // safety-critical rules requires admin — qa_lead is not enough.
        const isAdmin = ctx.user.role === "admin";
        if (!isAdmin) {
          const currentRuleMap = new Map<
            string,
            { failClass: string; enabled: boolean }
          >();
          for (const form of Object.values(currentPolicy.forms)) {
            for (const rule of form.rules) {
              currentRuleMap.set(rule.ruleId, {
                failClass: rule.failClass,
                enabled: rule.enabled,
              });
            }
          }

          for (const form of Object.values(input.forms)) {
            for (const rule of form.rules) {
              if (!SAFETY_CRITICAL_RULE_IDS.has(rule.ruleId)) continue;
              const prev = currentRuleMap.get(rule.ruleId);
              if (!prev) continue;
              if (
                rule.failClass !== prev.failClass ||
                rule.enabled !== prev.enabled
              ) {
                throw new TRPCError({
                  code: "FORBIDDEN",
                  message: `Changing failClass or enabled on safety-critical rule ${rule.ruleId} requires admin privileges.`,
                });
              }
            }
          }
        }

        const nextVersion = bumpPatchVersion(input.version);
        const policy = mergeAuditPolicy({ ...input, version: nextVersion });
        await db.saveAuditPolicy(policy, ctx.user.id);
        await db.logAction({
          userId: ctx.user.id,
          action: "UPDATE_AUDIT_POLICY",
          entityType: "audit_policy",
          entityId: null,
          details: {
            version: policy.version,
            formKeys: Object.keys(policy.forms),
            weights: policy.weights,
          },
        });
        return { success: true, policy };
      }),

    reset: qaLeadProcedure.mutation(async ({ ctx }) => {
      const policy = mergeAuditPolicy(null);
      await db.saveAuditPolicy(policy, ctx.user.id);
      await db.logAction({
        userId: ctx.user.id,
        action: "RESET_AUDIT_POLICY",
        entityType: "audit_policy",
        entityId: null,
        details: { version: policy.version },
      });
      return { success: true, policy };
    }),
  }),
});

export type AppRouter = typeof appRouter;
