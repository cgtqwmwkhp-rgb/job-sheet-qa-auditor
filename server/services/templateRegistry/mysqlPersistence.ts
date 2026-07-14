import { and, eq } from "drizzle-orm";
import {
  selectionTraces,
  templates,
  templateVersions,
  type InsertSelectionTrace,
} from "../../../drizzle/schema";
import { getDb } from "../../db";
import { webhookEvents } from "../webhooks";
import { isFailClosedEnvironment } from "./defaultTemplate";
import type { SelectionTraceArtifact } from "./selectionTraceWriter";
import type { SelectionResult } from "./types";

export type TemplateLike = {
  id: number;
  templateId: string;
  name: string;
  client: string | null;
  assetType: string | null;
  workType: string | null;
  status: "draft" | "active" | "deprecated" | "archived";
  description: string | null;
  createdBy: number;
  createdAt: Date;
  updatedAt: Date;
};

export type VersionLike = {
  id: number;
  templateId: number;
  version: string;
  hashSha256: string;
  specJson: unknown;
  selectionConfigJson: unknown;
  roiJson: unknown | null;
  isActive: boolean;
  changeNotes: string | null;
  createdBy: number;
  createdAt: Date;
};

/** Durable registry snapshot loaded from MySQL (boot hydrate). */
export type TemplateRegistrySnapshot = {
  templates: TemplateLike[];
  versions: VersionLike[];
};

export type PersistenceWriteResult =
  | { status: "stored"; id?: number }
  | { status: "skipped"; reason: string };

/**
 * MySQL write-through / load-path gate.
 *
 * Prod contract (fail-closed = production|staging):
 * - Persistence is ALWAYS on (TEMPLATE_REGISTRY_MYSQL_PERSISTENCE_ENABLED=false ignored).
 * - Boot must hydrate from DB when available so custom activations survive pod recycle.
 *
 * Other envs: opt-in via TEMPLATE_REGISTRY_MYSQL_PERSISTENCE_ENABLED=true.
 */
export function isTemplateMysqlPersistenceEnabled(): boolean {
  if (isFailClosedEnvironment()) {
    const explicit = process.env.TEMPLATE_REGISTRY_MYSQL_PERSISTENCE_ENABLED;
    if (explicit === "false") {
      console.warn(
        "[TemplateRegistry] TEMPLATE_REGISTRY_MYSQL_PERSISTENCE_ENABLED=false " +
          "ignored in fail-closed environment. DB-backed registry is mandatory."
      );
    }
    return true;
  }
  return process.env.TEMPLATE_REGISTRY_MYSQL_PERSISTENCE_ENABLED === "true";
}

/**
 * Assert prod contract: fail-closed envs require DB-backed registry.
 * Soft-fails with a loud warning when DATABASE_URL is missing (boot still continues).
 */
export function assertTemplateRegistryMysqlProdContract(): {
  ok: boolean;
  reason?: string;
} {
  if (!isFailClosedEnvironment()) {
    return { ok: true };
  }
  if (!isTemplateMysqlPersistenceEnabled()) {
    const reason =
      "SSOT_VIOLATION: template registry MySQL persistence disabled in fail-closed env";
    console.error(`[TemplateRegistry] ${reason}`);
    return { ok: false, reason };
  }
  if (!process.env.DATABASE_URL) {
    const reason =
      "TEMPLATE_REGISTRY_WARNING: fail-closed env without DATABASE_URL — " +
      "custom activations cannot survive pod recycle (JSON seed-only)";
    console.warn(`[TemplateRegistry] ${reason}`);
    return { ok: false, reason };
  }
  return { ok: true };
}

function asDate(value: Date | string | null | undefined): Date {
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

export function isSelectionTraceMysqlPersistenceEnabled(): boolean {
  return process.env.SELECTION_TRACE_MYSQL_PERSISTENCE_ENABLED === "true";
}

function isPersistenceWebhookEnabled(): boolean {
  return process.env.PERSISTENCE_STORE_WEBHOOKS_ENABLED === "true";
}

function logPersistenceFailure(entity: string, error: unknown): void {
  console.error(`[TemplateRegistry] Failed to persist ${entity}:`, error);
}

function decimal(value: number | null | undefined): string | null {
  return value == null ? null : value.toFixed(2);
}

async function getPersistedTemplateBySlug(templateId: string) {
  const db = await getDb();
  if (!db) return null;

  const rows = await db
    .select()
    .from(templates)
    .where(eq(templates.templateId, templateId))
    .limit(1);

  return rows[0] ?? null;
}

async function getPersistedTemplateVersion(
  persistedTemplateId: number,
  version: VersionLike
) {
  const db = await getDb();
  if (!db) return null;

  const rows = await db
    .select()
    .from(templateVersions)
    .where(
      and(
        eq(templateVersions.templateId, persistedTemplateId),
        eq(templateVersions.hashSha256, version.hashSha256)
      )
    )
    .limit(1);

  return rows[0] ?? null;
}

export async function persistTemplateToMysql(
  template: TemplateLike
): Promise<PersistenceWriteResult> {
  if (!isTemplateMysqlPersistenceEnabled()) {
    return { status: "skipped", reason: "flag_disabled" };
  }

  const db = await getDb();
  if (!db) {
    return { status: "skipped", reason: "database_unavailable" };
  }

  await db
    .insert(templates)
    .values({
      templateId: template.templateId,
      name: template.name,
      client: template.client,
      assetType: template.assetType,
      workType: template.workType,
      status: template.status,
      description: template.description,
      createdBy: template.createdBy,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
    })
    .onDuplicateKeyUpdate({
      set: {
        name: template.name,
        client: template.client,
        assetType: template.assetType,
        workType: template.workType,
        status: template.status,
        description: template.description,
        updatedAt: template.updatedAt,
      },
    });

  const persisted = await getPersistedTemplateBySlug(template.templateId);

  if (isPersistenceWebhookEnabled()) {
    await webhookEvents.templateStored(persisted?.id ?? template.id, {
      templateId: template.templateId,
      status: template.status,
      operation: "upsert",
    });
  }

  return { status: "stored", id: persisted?.id };
}

export function persistTemplateToMysqlBestEffort(template: TemplateLike): void {
  void persistTemplateToMysql(template).catch(error =>
    logPersistenceFailure("template", error)
  );
}

export async function persistTemplateVersionToMysql(
  version: VersionLike,
  template: TemplateLike
): Promise<PersistenceWriteResult> {
  if (!isTemplateMysqlPersistenceEnabled()) {
    return { status: "skipped", reason: "flag_disabled" };
  }

  await persistTemplateToMysql(template);

  const db = await getDb();
  if (!db) {
    return { status: "skipped", reason: "database_unavailable" };
  }

  const persistedTemplate = await getPersistedTemplateBySlug(
    template.templateId
  );
  if (!persistedTemplate) {
    return { status: "skipped", reason: "template_not_persisted" };
  }

  const existingVersion = await getPersistedTemplateVersion(
    persistedTemplate.id,
    version
  );
  if (existingVersion) {
    return { status: "stored", id: existingVersion.id };
  }

  const result = await db.insert(templateVersions).values({
    templateId: persistedTemplate.id,
    version: version.version,
    hashSha256: version.hashSha256,
    specJson: version.specJson,
    selectionConfigJson: version.selectionConfigJson,
    roiJson: version.roiJson,
    isActive: version.isActive,
    changeNotes: version.changeNotes,
    createdBy: version.createdBy,
    createdAt: version.createdAt,
  });

  const persistedId = Number(result[0]?.insertId ?? undefined);

  if (isPersistenceWebhookEnabled()) {
    await webhookEvents.templateStored(persistedTemplate.id, {
      templateId: template.templateId,
      version: version.version,
      versionId: persistedId || undefined,
      operation: "version_upsert",
    });
  }

  return {
    status: "stored",
    id: Number.isFinite(persistedId) ? persistedId : undefined,
  };
}

export function persistTemplateVersionToMysqlBestEffort(
  version: VersionLike,
  template: TemplateLike
): void {
  void persistTemplateVersionToMysql(version, template).catch(error =>
    logPersistenceFailure("template version", error)
  );
}

export async function persistTemplateActivationToMysql(
  version: VersionLike,
  template: TemplateLike
): Promise<PersistenceWriteResult> {
  if (!isTemplateMysqlPersistenceEnabled()) {
    return { status: "skipped", reason: "flag_disabled" };
  }

  await persistTemplateVersionToMysql(version, template);

  const db = await getDb();
  if (!db) {
    return { status: "skipped", reason: "database_unavailable" };
  }

  const persistedTemplate = await getPersistedTemplateBySlug(
    template.templateId
  );
  if (!persistedTemplate) {
    return { status: "skipped", reason: "template_not_persisted" };
  }

  const persistedVersion = await getPersistedTemplateVersion(
    persistedTemplate.id,
    version
  );
  if (!persistedVersion) {
    return { status: "skipped", reason: "version_not_persisted" };
  }

  await db
    .update(templateVersions)
    .set({ isActive: false })
    .where(eq(templateVersions.templateId, persistedTemplate.id));
  await db
    .update(templateVersions)
    .set({ isActive: true })
    .where(eq(templateVersions.id, persistedVersion.id));
  await db
    .update(templates)
    .set({ status: "active", updatedAt: template.updatedAt })
    .where(eq(templates.id, persistedTemplate.id));

  if (isPersistenceWebhookEnabled()) {
    await webhookEvents.specActivated(
      persistedTemplate.id,
      template.name,
      version.version
    );
  }

  return { status: "stored", id: persistedVersion.id };
}

export function persistTemplateActivationToMysqlBestEffort(
  version: VersionLike,
  template: TemplateLike
): void {
  void persistTemplateActivationToMysql(version, template).catch(error =>
    logPersistenceFailure("template activation", error)
  );
}

export async function persistTemplateStatusToMysql(
  template: TemplateLike
): Promise<PersistenceWriteResult> {
  if (!isTemplateMysqlPersistenceEnabled()) {
    return { status: "skipped", reason: "flag_disabled" };
  }

  await persistTemplateToMysql(template);

  const persisted = await getPersistedTemplateBySlug(template.templateId);
  if (!persisted) {
    return { status: "skipped", reason: "template_not_persisted" };
  }

  if (isPersistenceWebhookEnabled()) {
    await webhookEvents.templateStored(persisted.id, {
      templateId: template.templateId,
      status: template.status,
      operation: "status_update",
    });
  }

  return { status: "stored", id: persisted.id };
}

export function persistTemplateStatusToMysqlBestEffort(
  template: TemplateLike
): void {
  void persistTemplateStatusToMysql(template).catch(error =>
    logPersistenceFailure("template status", error)
  );
}

function selectionTraceRow(
  trace: SelectionTraceArtifact,
  result?: SelectionResult
): InsertSelectionTrace {
  const selectedCandidate =
    result?.candidates.find(c => c.templateId === trace.outcome.templateId) ??
    result?.candidates[0] ??
    null;

  return {
    jobSheetId: trace.jobSheetId,
    templateId: trace.outcome.templateId,
    versionId: trace.outcome.versionId,
    confidenceBand: trace.outcome.confidenceBand,
    topScore: decimal(trace.outcome.topScore) ?? "0.00",
    runnerUpScore: decimal(trace.outcome.runnerUpScore),
    scoreGap: decimal(trace.outcome.scoreDelta),
    scoresJson: {
      artifactVersion: trace.artifactVersion,
      selected: trace.outcome.selected,
      candidates: trace.candidates,
    },
    tokensJson: {
      inputSignals: trace.inputSignals,
      matchedTokens:
        result?.matchedTokens ?? selectedCandidate?.matchedTokens ?? [],
    },
    autoProcessingAllowed: trace.outcome.autoProcessingAllowed,
    blockReason: trace.outcome.blockReason,
    createdAt: new Date(trace.timestamp),
  };
}

export async function persistSelectionTraceArtifactToMysql(
  trace: SelectionTraceArtifact,
  result?: SelectionResult
): Promise<PersistenceWriteResult> {
  if (!isSelectionTraceMysqlPersistenceEnabled()) {
    return { status: "skipped", reason: "flag_disabled" };
  }

  const db = await getDb();
  if (!db) {
    return { status: "skipped", reason: "database_unavailable" };
  }

  const row = selectionTraceRow(trace, result);
  const insertResult = await db.insert(selectionTraces).values(row);
  const id = Number(insertResult[0]?.insertId ?? undefined);

  if (isPersistenceWebhookEnabled()) {
    await webhookEvents.selectionTraceStored(id || trace.jobSheetId, {
      jobSheetId: trace.jobSheetId,
      templateId: trace.outcome.templateId,
      confidenceBand: trace.outcome.confidenceBand,
      autoProcessingAllowed: trace.outcome.autoProcessingAllowed,
    });
  }

  return { status: "stored", id: Number.isFinite(id) ? id : undefined };
}

export function persistSelectionTraceArtifactToMysqlBestEffort(
  trace: SelectionTraceArtifact,
  result?: SelectionResult
): void {
  void persistSelectionTraceArtifactToMysql(trace, result).catch(error =>
    logPersistenceFailure("selection trace", error)
  );
}

/**
 * Load the full template registry from MySQL for boot hydrate.
 * Returns null when persistence is off or DB unavailable (caller falls back to JSON seed).
 * Fail-safe: never throws.
 */
export async function loadTemplateRegistrySnapshotFromMysql(): Promise<TemplateRegistrySnapshot | null> {
  if (!isTemplateMysqlPersistenceEnabled()) {
    return null;
  }

  try {
    const db = await getDb();
    if (!db) return null;

    const templateRows = await db.select().from(templates);
    const versionRows = await db.select().from(templateVersions);

    return {
      templates: templateRows.map(row => ({
        id: row.id,
        templateId: row.templateId,
        name: row.name,
        client: row.client ?? null,
        assetType: row.assetType ?? null,
        workType: row.workType ?? null,
        status: row.status,
        description: row.description ?? null,
        createdBy: row.createdBy,
        createdAt: asDate(row.createdAt),
        updatedAt: asDate(row.updatedAt),
      })),
      versions: versionRows.map(row => ({
        id: row.id,
        templateId: row.templateId,
        version: row.version,
        hashSha256: row.hashSha256,
        specJson: row.specJson,
        selectionConfigJson: row.selectionConfigJson,
        roiJson: row.roiJson ?? null,
        isActive: Boolean(row.isActive),
        changeNotes: row.changeNotes ?? null,
        createdBy: row.createdBy,
        createdAt: asDate(row.createdAt),
      })),
    };
  } catch (error) {
    console.warn(
      "[TemplateRegistry] Failed to load registry snapshot from MySQL (falling back to seed):",
      error
    );
    return null;
  }
}
