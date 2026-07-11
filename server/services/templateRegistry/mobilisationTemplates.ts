/**
 * Gold mobilisation templates — boot-seed Job Summary, Wasted Journey (and future families).
 *
 * Staging/prod registry is in-memory; without boot seed, custom templates vanish
 * on pod restart. Import + activate from versioned JSON packs on startup.
 */

import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import {
  activateVersion,
  getActiveVersion,
  getTemplateBySlug,
  getTemplateVersion,
} from "./registryService";
import { importBulkPack, type BulkImportPack } from "./importPack";
import { createSafeLogger } from "../../utils/safeLogger";

const logger = createSafeLogger("MobilisationTemplates");

const JOB_SUMMARY_SLUG = "job-summary-v1";
const WASTED_JOURNEY_SLUG = "wasted-journey-v1";

const JOB_SUMMARY_PACK =
  "data/templates-mobilisation/job-summary-import-pack.json";
const WASTED_JOURNEY_PACK =
  "data/templates-mobilisation/wasted-journey-import-pack.json";

function resolvePackPath(relativePath: string, label: string): string {
  const candidates = [
    join(process.cwd(), relativePath),
    join(dirname(fileURLToPath(import.meta.url)), "../../../", relativePath),
    join(dirname(fileURLToPath(import.meta.url)), "../", relativePath),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(
    `${label} import pack not found (tried: ${candidates.join(", ")})`
  );
}

function loadPack(relativePath: string, label: string): BulkImportPack {
  const packPath = resolvePackPath(relativePath, label);
  return JSON.parse(readFileSync(packPath, "utf-8")) as BulkImportPack;
}

function bootActivateTemplate(options: {
  slug: string;
  packRelative: string;
  label: string;
  createdBy?: number;
  /** When set, re-import + activate if active version string differs. */
  expectedVersion?: string;
}): number | null {
  const { slug, packRelative, label, createdBy = 0, expectedVersion } = options;

  if (hasActiveTemplate(slug)) {
    if (!expectedVersion) return null;
    const existing = getTemplateBySlug(slug);
    const active = existing ? getActiveVersion(existing.id) : null;
    if (active?.version === expectedVersion) return null;
    logger.info(`${label} pack version changed — re-seeding`, {
      activeVersion: active?.version ?? null,
      expectedVersion,
    });
  }

  try {
    const pack = loadPack(packRelative, label);
    const result = importBulkPack(pack, createdBy);
    if (!result.success || result.failureCount > 0) {
      logger.warn(`${label} pack import failed`, {
        errors: result.results.flatMap(r => r.errors ?? []),
      });
      return null;
    }

    const created = result.results.find(r => r.templateId === slug);
    const versionId = created?.created.versionDbId;
    if (!versionId) {
      logger.warn(`${label} import produced no version id`);
      return null;
    }

    const version = getTemplateVersion(versionId);
    if (!version) {
      logger.warn(`${label} version missing after import`, { versionId });
      return null;
    }

    activateVersion(versionId);

    logger.info(`${label} gold template activated`, {
      templateId: slug,
      versionId,
      version: version.version,
    });
    return versionId;
  } catch (err) {
    logger.warn(`${label} boot seed failed soft`, {
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

function hasActiveTemplate(slug: string): boolean {
  const t = getTemplateBySlug(slug);
  if (!t) return false;
  return getActiveVersion(t.id) != null;
}

/**
 * Ensure job-summary-v1 is imported and active.
 * Idempotent: no-ops when an active version already exists.
 */
export function initializeJobSummaryTemplate(
  createdBy: number = 0
): number | null {
  return bootActivateTemplate({
    slug: JOB_SUMMARY_SLUG,
    packRelative: JOB_SUMMARY_PACK,
    label: "Job Summary",
    createdBy,
  });
}

export function hasJobSummaryTemplate(): boolean {
  return hasActiveTemplate(JOB_SUMMARY_SLUG);
}

/**
 * Ensure wasted-journey-v1 is imported and active.
 * Idempotent: no-ops when an active version already exists.
 */
export function initializeWastedJourneyTemplate(
  createdBy: number = 0
): number | null {
  return bootActivateTemplate({
    slug: WASTED_JOURNEY_SLUG,
    packRelative: WASTED_JOURNEY_PACK,
    label: "Wasted Journey",
    createdBy,
    expectedVersion: "1.2.0",
  });
}

export function hasWastedJourneyTemplate(): boolean {
  return hasActiveTemplate(WASTED_JOURNEY_SLUG);
}
