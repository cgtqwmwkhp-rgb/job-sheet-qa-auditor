/**
 * Template Studio — dual-control promote queue (staging → production).
 * Durable JSON sidecars survive restarts; integrity hash verified on approve/apply.
 */

import { createHash, randomUUID } from "crypto";
import {
  getTemplate,
  getTemplateVersion,
  type SpecJson,
  type SelectionConfig,
  type RoiConfig,
} from "../templateRegistry";
import { buildActivationReport } from "./activationReport";
import { loadStudioJson, persistStudioJson, promoteKey } from "./durableStore";

export type PromoteStatus =
  | "pending"
  | "approved"
  | "applied"
  | "rejected"
  | "cancelled";

export interface PromotePack {
  schemaVersion: "1.0.0";
  templateSlug: string;
  templateName: string;
  version: string;
  hashSha256: string;
  specJson: SpecJson;
  selectionConfigJson: SelectionConfig;
  roiJson: RoiConfig | null;
  changeNotes: string | null;
  integrityHash: string;
  stagingEvidence: {
    versionId: number;
    templateId: number;
    activatedAt: string;
    environment: string;
    activationReportSummary: {
      allowed: boolean;
      blockingIssueCount: number;
      fixtureOverall: string | null;
      collisionAllowed: boolean;
    };
    smokeJobSheetIds: number[];
  };
}

export interface PromoteRequest {
  id: string;
  status: PromoteStatus;
  pack: PromotePack;
  requestedBy: number;
  requestedAt: string;
  approvedBy: number | null;
  approvedAt: string | null;
  appliedBy: number | null;
  appliedAt: string | null;
  rejectedBy: number | null;
  rejectedAt: string | null;
  rejectReason: string | null;
  notes: string | null;
}

const promoteStore = new Map<string, PromoteRequest>();

export function resetPromoteStore(): void {
  promoteStore.clear();
}

export function listPromoteRequests(status?: PromoteStatus): PromoteRequest[] {
  const all = Array.from(promoteStore.values());
  const filtered = status ? all.filter(r => r.status === status) : all;
  return filtered.sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
}

export function getPromoteRequest(id: string): PromoteRequest | null {
  return promoteStore.get(id) ?? null;
}

export async function resolvePromoteRequest(
  id: string
): Promise<PromoteRequest | null> {
  const cached = promoteStore.get(id);
  if (cached) return cached;
  const loaded = await loadStudioJson<PromoteRequest>(promoteKey(id));
  if (loaded) {
    promoteStore.set(id, loaded);
    return loaded;
  }
  return null;
}

async function persistPromote(req: PromoteRequest): Promise<void> {
  promoteStore.set(req.id, req);
  await persistStudioJson(promoteKey(req.id), req);
}

export function packIntegrityHash(
  pack: Omit<PromotePack, "integrityHash"> | PromotePack
): string {
  const payload = JSON.stringify({
    templateSlug: pack.templateSlug,
    version: pack.version,
    hashSha256: pack.hashSha256,
    specJson: pack.specJson,
    selectionConfigJson: pack.selectionConfigJson,
    roiJson: pack.roiJson,
  });
  return createHash("sha256").update(payload).digest("hex");
}

export function assertPackIntegrity(pack: PromotePack): void {
  const expected = packIntegrityHash(pack);
  if (!pack.integrityHash || pack.integrityHash !== expected) {
    throw new Error(
      "Promote pack integrity hash mismatch — pack may have been tampered with"
    );
  }
}

export async function requestPromote(input: {
  versionId: number;
  requestedBy: number;
  smokeJobSheetIds?: number[];
  notes?: string;
}): Promise<PromoteRequest> {
  const version = getTemplateVersion(input.versionId);
  if (!version) {
    throw new Error(`Version not found: ${input.versionId}`);
  }
  if (!version.isActive) {
    throw new Error(
      "Only staging-activated versions can be requested for production promote"
    );
  }
  const template = getTemplate(version.templateId);
  if (!template) {
    throw new Error(`Template not found: ${version.templateId}`);
  }

  const report = await buildActivationReport(input.versionId);
  if (!report.allowed) {
    throw new Error(
      "Activation report still has blocking issues — fix before requesting promote"
    );
  }

  for (const existing of Array.from(promoteStore.values())) {
    if (
      existing.status === "pending" &&
      existing.pack.hashSha256 === version.hashSha256
    ) {
      throw new Error(
        `A pending promote already exists for this version hash (${existing.id})`
      );
    }
  }

  const packBase = {
    schemaVersion: "1.0.0" as const,
    templateSlug: template.templateId,
    templateName: template.name,
    version: version.version,
    hashSha256: version.hashSha256,
    specJson: version.specJson,
    selectionConfigJson: version.selectionConfigJson,
    roiJson: version.roiJson,
    changeNotes: version.changeNotes,
    stagingEvidence: {
      versionId: version.id,
      templateId: template.id,
      activatedAt: version.createdAt.toISOString(),
      environment: process.env.APP_ENV || "staging",
      activationReportSummary: {
        allowed: report.allowed,
        blockingIssueCount: report.preconditions.blockingIssues.length,
        fixtureOverall: report.fixtures.report?.overallResult ?? null,
        collisionAllowed: report.collision.allowed,
      },
      smokeJobSheetIds: input.smokeJobSheetIds ?? [],
    },
  };

  const pack: PromotePack = {
    ...packBase,
    integrityHash: packIntegrityHash(packBase),
  };

  const request: PromoteRequest = {
    id: randomUUID(),
    status: "pending",
    pack,
    requestedBy: input.requestedBy,
    requestedAt: new Date().toISOString(),
    approvedBy: null,
    approvedAt: null,
    appliedBy: null,
    appliedAt: null,
    rejectedBy: null,
    rejectedAt: null,
    rejectReason: null,
    notes: input.notes ?? null,
  };

  await persistPromote(request);
  return request;
}

export async function approvePromote(input: {
  promoteId: string;
  approvedBy: number;
}): Promise<PromoteRequest> {
  const req = await resolvePromoteRequest(input.promoteId);
  if (!req) {
    throw new Error(`Promote request not found: ${input.promoteId}`);
  }
  if (req.status !== "pending") {
    throw new Error(`Promote request is ${req.status}, expected pending`);
  }
  if (req.requestedBy === input.approvedBy) {
    throw new Error(
      "Self-approve blocked: promoter must be a different admin/qa_lead than the requester"
    );
  }

  assertPackIntegrity(req.pack);
  req.status = "approved";
  req.approvedBy = input.approvedBy;
  req.approvedAt = new Date().toISOString();
  await persistPromote(req);
  return req;
}

export async function rejectPromote(input: {
  promoteId: string;
  rejectedBy: number;
  reason: string;
}): Promise<PromoteRequest> {
  const req = await resolvePromoteRequest(input.promoteId);
  if (!req) {
    throw new Error(`Promote request not found: ${input.promoteId}`);
  }
  if (req.status !== "pending") {
    throw new Error(`Cannot reject promote in status ${req.status}`);
  }
  req.status = "rejected";
  req.rejectedBy = input.rejectedBy;
  req.rejectedAt = new Date().toISOString();
  req.rejectReason = input.reason;
  await persistPromote(req);
  return req;
}

export async function markPromoteApplied(
  promoteId: string,
  appliedBy: number
): Promise<PromoteRequest> {
  const req = await resolvePromoteRequest(promoteId);
  if (!req) {
    throw new Error(`Promote request not found: ${promoteId}`);
  }
  if (req.status !== "approved") {
    throw new Error(
      `Promote must be approved before apply (status=${req.status})`
    );
  }
  assertPackIntegrity(req.pack);
  if (req.requestedBy === appliedBy) {
    throw new Error("Requester cannot apply their own promote (dual control)");
  }
  req.status = "applied";
  req.appliedBy = appliedBy;
  req.appliedAt = new Date().toISOString();
  await persistPromote(req);
  return req;
}
