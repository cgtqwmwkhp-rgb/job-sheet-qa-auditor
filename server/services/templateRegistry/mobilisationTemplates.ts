/**
 * Gold mobilisation templates — boot-seed Job Summary (and future families).
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
const PACK_RELATIVE =
  "data/templates-mobilisation/job-summary-import-pack.json";

function resolveJobSummaryPackPath(): string {
  const candidates = [
    join(process.cwd(), PACK_RELATIVE),
    // Dev: server/services/templateRegistry → repo root
    join(dirname(fileURLToPath(import.meta.url)), "../../../", PACK_RELATIVE),
    // Bundled dist/index.js → /app/data/...
    join(dirname(fileURLToPath(import.meta.url)), "../", PACK_RELATIVE),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(
    `Job Summary import pack not found (tried: ${candidates.join(", ")})`
  );
}

function loadJobSummaryPack(): BulkImportPack {
  const packPath = resolveJobSummaryPackPath();
  return JSON.parse(readFileSync(packPath, "utf-8")) as BulkImportPack;
}

/**
 * Ensure job-summary-v1 is imported and active.
 * Idempotent: no-ops when an active version already exists.
 *
 * @returns activated version id, or null if already present / failed soft
 */
export function initializeJobSummaryTemplate(
  createdBy: number = 0
): number | null {
  if (hasJobSummaryTemplate()) {
    return null;
  }

  try {
    const pack = loadJobSummaryPack();
    const result = importBulkPack(pack, createdBy);
    if (!result.success || result.failureCount > 0) {
      logger.warn("Job Summary pack import failed", {
        errors: result.results.flatMap(r => r.errors ?? []),
      });
      return null;
    }

    const created = result.results.find(r => r.templateId === JOB_SUMMARY_SLUG);
    const versionId = created?.created.versionDbId;
    if (!versionId) {
      logger.warn("Job Summary import produced no version id");
      return null;
    }

    const version = getTemplateVersion(versionId);
    if (!version) {
      logger.warn("Job Summary version missing after import", { versionId });
      return null;
    }

    // Full gates — pack is authored to pass fixtures + critical ROIs.
    activateVersion(versionId);

    logger.info("Job Summary gold template activated", {
      templateId: JOB_SUMMARY_SLUG,
      versionId,
    });
    return versionId;
  } catch (err) {
    logger.warn("Job Summary boot seed failed soft", {
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export function hasJobSummaryTemplate(): boolean {
  const t = getTemplateBySlug(JOB_SUMMARY_SLUG);
  if (!t) return false;
  return getActiveVersion(t.id) != null;
}
