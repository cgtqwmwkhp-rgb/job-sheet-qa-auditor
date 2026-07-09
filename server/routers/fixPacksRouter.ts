/**
 * Fix Packs Workflow Router (Phase 1.9)
 *
 * Standalone export only for now. Mount in appRouter after #145 lands to avoid
 * competing edits in server/routers.ts.
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, qaLeadProcedure, router } from "../_core/trpc";
import {
  exportFixPackToJson,
  generateFixPack,
  type EngineerProfile,
  type FixPack,
  type IssueOccurrence,
} from "../services/engineerAnalytics";

type FixPackWorkflowRecord = {
  fixPack: FixPack;
  exportedJson: string;
  status: "exported" | "assigned" | "acknowledged";
  exportedAt: string;
  exportedBy: number;
  assignedAt?: string;
  assignedBy?: number;
  assignedTo?: string;
  dueAt?: string;
  note?: string;
  acknowledgedAt?: string;
  acknowledgedBy?: number;
  acknowledgmentNote?: string;
};

const fixPackWorkflowStore = new Map<string, FixPackWorkflowRecord>();

const issueTypeSchema = z.enum([
  "MISSING_FIELD",
  "INVALID_FORMAT",
  "OUT_OF_POLICY",
  "SIGNATURE_MISSING",
  "DATE_MISMATCH",
  "PHOTO_QUALITY",
  "INCOMPLETE_CHECKLIST",
  "OTHER",
]);

const engineerProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  employeeId: z.string().min(1),
  region: z.string().optional(),
  team: z.string().optional(),
  startDate: z.string().min(1),
  isActive: z.boolean(),
});

const issueOccurrenceSchema = z.object({
  id: z.string().min(1),
  engineerId: z.string().min(1),
  documentId: z.string().min(1),
  issueType: issueTypeSchema,
  severity: z.enum(["S0", "S1", "S2", "S3"]),
  fieldName: z.string().min(1),
  reasonCode: z.string().min(1),
  occurredAt: z.string().min(1),
  wasDisputed: z.boolean(),
  wasWaived: z.boolean(),
  resolutionStatus: z.enum(["open", "resolved", "waived", "disputed"]),
});

function isFixPackWorkflowEnabled(): boolean {
  return process.env.FEATURE_FIX_PACK_WORKFLOW === "true";
}

function assertWorkflowEnabled(): void {
  if (!isFixPackWorkflowEnabled()) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Fix pack workflow is disabled",
    });
  }
}

function getWorkflowRecord(fixPackId: string): FixPackWorkflowRecord {
  const record = fixPackWorkflowStore.get(fixPackId);
  if (!record) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Fix pack workflow record not found",
    });
  }
  return record;
}

function serializeRecord(record: FixPackWorkflowRecord) {
  return {
    fixPack: record.fixPack,
    exportedJson: record.exportedJson,
    workflow: {
      status: record.status,
      exportedAt: record.exportedAt,
      exportedBy: record.exportedBy,
      assignedAt: record.assignedAt,
      assignedBy: record.assignedBy,
      assignedTo: record.assignedTo,
      dueAt: record.dueAt,
      note: record.note,
      acknowledgedAt: record.acknowledgedAt,
      acknowledgedBy: record.acknowledgedBy,
      acknowledgmentNote: record.acknowledgmentNote,
    },
  };
}

export function resetFixPackWorkflowStore(): void {
  fixPackWorkflowStore.clear();
}

export const fixPacksRouter = router({
  status: protectedProcedure.query(() => ({
    enabled: isFixPackWorkflowEnabled(),
    mounted: false,
    mountDeferredUntil: "#145 routers.ts changes land",
    persistedIn: "memory",
  })),

  export: protectedProcedure
    .input(
      z.object({
        engineer: engineerProfileSchema,
        issues: z.array(issueOccurrenceSchema).min(1),
        validDays: z.number().int().positive().max(365).optional(),
      })
    )
    .mutation(({ ctx, input }) => {
      assertWorkflowEnabled();
      const fixPack = generateFixPack(
        input.engineer as EngineerProfile,
        input.issues as IssueOccurrence[],
        input.validDays
      );
      const exportedJson = exportFixPackToJson(fixPack);
      const record: FixPackWorkflowRecord = {
        fixPack,
        exportedJson,
        status: "exported",
        exportedAt: new Date().toISOString(),
        exportedBy: ctx.user.id,
      };
      fixPackWorkflowStore.set(fixPack.id, record);
      return serializeRecord(record);
    }),

  assign: qaLeadProcedure
    .input(
      z.object({
        fixPackId: z.string().min(1),
        assignedTo: z.string().min(1).optional(),
        dueAt: z.string().optional(),
        note: z.string().max(2000).optional(),
      })
    )
    .mutation(({ ctx, input }) => {
      assertWorkflowEnabled();
      const record = getWorkflowRecord(input.fixPackId);
      record.status = "assigned";
      record.assignedAt = new Date().toISOString();
      record.assignedBy = ctx.user.id;
      record.assignedTo = input.assignedTo ?? record.fixPack.engineerId;
      record.dueAt = input.dueAt;
      record.note = input.note;
      fixPackWorkflowStore.set(input.fixPackId, record);
      return serializeRecord(record);
    }),

  acknowledge: protectedProcedure
    .input(
      z.object({
        fixPackId: z.string().min(1),
        note: z.string().max(2000).optional(),
      })
    )
    .mutation(({ ctx, input }) => {
      assertWorkflowEnabled();
      const record = getWorkflowRecord(input.fixPackId);
      record.status = "acknowledged";
      record.acknowledgedAt = new Date().toISOString();
      record.acknowledgedBy = ctx.user.id;
      record.acknowledgmentNote = input.note;
      record.fixPack.acknowledgment = {
        ...record.fixPack.acknowledgment,
        acknowledgedAt: record.acknowledgedAt,
        acknowledgedBy: String(ctx.user.id),
      };
      record.exportedJson = exportFixPackToJson(record.fixPack);
      fixPackWorkflowStore.set(input.fixPackId, record);
      return serializeRecord(record);
    }),
});

export type FixPacksRouter = typeof fixPacksRouter;
