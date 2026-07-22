/**
 * Gold mobilisation templates — boot-seed Job Summary, Wasted Journey (and future families).
 *
 * Prod load-path: MySQL hydrate runs first (see hydrateTemplateRegistryFromMysql).
 * JSON packs only fill gaps when a gold template is missing after hydrate — custom
 * activations survive pod recycle via DB, not seed-only.
 */

import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import {
  activateVersion,
  getActiveVersion,
  getTemplateBySlug,
  getTemplateVersion,
  listVersions,
} from "./registryService";
import { importBulkPack, type BulkImportPack } from "./importPack";
import { createSafeLogger } from "../../utils/safeLogger";

const logger = createSafeLogger("MobilisationTemplates");

const JOB_SUMMARY_SLUG = "job-summary-v1";
const WASTED_JOURNEY_SLUG = "wasted-journey-v1";
const PTO_SERVICE_SLUG = "compliance-checklist-pto-service-v1";

/** Form-family selection catalogs (PX-105 / PR4) — distinctive tokens after extract. */
export const FORM_FAMILY_CATALOG_SLUGS = [
  "ford-service-v1",
  "gas-boiler-v1",
  "generator-service-v1",
  "trailer-service-v1",
  "ukpn-v1",
  "loler-examination-v1",
] as const;

const JOB_SUMMARY_PACK =
  "data/templates-mobilisation/job-summary-import-pack.json";
const WASTED_JOURNEY_PACK =
  "data/templates-mobilisation/wasted-journey-import-pack.json";
const PTO_SERVICE_PACK =
  "data/templates-mobilisation/compliance-checklist-pto-service-import-pack.json";
const FORM_FAMILY_CATALOGS_PACK =
  "data/templates-mobilisation/form-family-selection-catalogs-import-pack.json";

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

  // Prefer already-hydrated / previously activated templates (MySQL or prior seed).
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
      logger.warn(`${label} pack import failed (will try activate existing)`, {
        errors: result.results.flatMap(r => r.errors ?? []),
      });
    }

    const created = result.results.find(r => r.templateId === slug);
    let versionId = created?.created.versionDbId ?? null;

    // Import is often a no-op when the expected version content already exists
    // ("identical content"). Still activate that version so MySQL hydrate cannot
    // leave a stale older active (e.g. LOLER 1.0.0 vs expected 1.3.0).
    if (!versionId && expectedVersion) {
      const existing = getTemplateBySlug(slug);
      const match = existing
        ? listVersions(existing.id).find(v => v.version === expectedVersion)
        : null;
      versionId = match?.id ?? null;
    }

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
 * Idempotent: no-ops when an active version already exists (including MySQL hydrate).
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
 * Idempotent: no-ops when an active version already exists (including MySQL hydrate).
 */
export function initializeWastedJourneyTemplate(
  createdBy: number = 0
): number | null {
  return bootActivateTemplate({
    slug: WASTED_JOURNEY_SLUG,
    packRelative: WASTED_JOURNEY_PACK,
    label: "Wasted Journey",
    createdBy,
    expectedVersion: "1.3.0",
  });
}

export function hasWastedJourneyTemplate(): boolean {
  return hasActiveTemplate(WASTED_JOURNEY_SLUG);
}

/**
 * Ensure compliance-checklist-pto-service-v1 is imported and active.
 * Tall-page PTO/OVP compliance grids — beats generic job-summary when
 * "PTO Service" + checklist tokens are present.
 */
export function initializePtoServiceTemplate(
  createdBy: number = 0
): number | null {
  return bootActivateTemplate({
    slug: PTO_SERVICE_SLUG,
    packRelative: PTO_SERVICE_PACK,
    label: "Compliance Checklist PTO Service",
    createdBy,
    // 1.2.0: P.T.O. tokenize + drop inspection negative + stronger pto weight.
    expectedVersion: "1.2.0",
  });
}

export function hasPtoServiceTemplate(): boolean {
  return hasActiveTemplate(PTO_SERVICE_SLUG);
}

/** Per-slug pack versions that must be active after boot (PX-116 drift reseed). */
const FORM_FAMILY_EXPECTED_VERSIONS: Record<
  (typeof FORM_FAMILY_CATALOG_SLUGS)[number],
  string
> = {
  "ford-service-v1": "1.0.0",
  "gas-boiler-v1": "1.0.0",
  "generator-service-v1": "1.0.0",
  "trailer-service-v1": "1.0.0",
  "ukpn-v1": "1.0.0",
  // 1.3.0: winch/lifting in requiredAny + fileName-augmented selection text.
  "loler-examination-v1": "1.3.0",
};

/**
 * Ensure Ford / Gas / Generator / Trailer / UKPN / LOLER selection catalogs
 * are imported and active. Idempotent per slug; re-seeds when version drifts.
 */
export function initializeFormFamilySelectionCatalogs(createdBy: number = 0): {
  seeded: string[];
  skipped: string[];
} {
  const seeded: string[] = [];
  const skipped: string[] = [];

  const needsReseed = FORM_FAMILY_CATALOG_SLUGS.some(slug => {
    if (!hasActiveTemplate(slug)) return true;
    const existing = getTemplateBySlug(slug);
    const active = existing ? getActiveVersion(existing.id) : null;
    return active?.version !== FORM_FAMILY_EXPECTED_VERSIONS[slug];
  });

  if (!needsReseed) {
    return { seeded, skipped: [...FORM_FAMILY_CATALOG_SLUGS] };
  }

  try {
    const pack = loadPack(FORM_FAMILY_CATALOGS_PACK, "Form-family catalogs");
    const result = importBulkPack(pack, createdBy);
    if (!result.success || result.failureCount > 0) {
      logger.warn(
        "Form-family catalog pack import failed (will try activate existing)",
        {
          errors: result.results.flatMap(r => r.errors ?? []),
        }
      );
    }

    for (const slug of FORM_FAMILY_CATALOG_SLUGS) {
      const expectedVersion = FORM_FAMILY_EXPECTED_VERSIONS[slug];
      const existing = getTemplateBySlug(slug);
      const active = existing ? getActiveVersion(existing.id) : null;
      if (active?.version === expectedVersion) {
        skipped.push(slug);
        continue;
      }

      if (active) {
        logger.info("Form-family catalog pack version changed — re-seeding", {
          slug,
          activeVersion: active.version,
          expectedVersion,
        });
      }

      const created = result.results.find(r => r.templateId === slug);
      let versionId = created?.created.versionDbId ?? null;
      if (!versionId && existing) {
        versionId =
          listVersions(existing.id).find(v => v.version === expectedVersion)
            ?.id ?? null;
      }
      if (!versionId) {
        logger.warn("Form-family catalog missing version after import", {
          slug,
          expectedVersion,
        });
        continue;
      }
      activateVersion(versionId);
      seeded.push(slug);
      logger.info("Form-family selection catalog activated", {
        templateId: slug,
        versionId,
        version: expectedVersion,
      });
    }
  } catch (err) {
    logger.warn("Form-family catalog boot seed failed soft", {
      message: err instanceof Error ? err.message : String(err),
    });
  }

  return { seeded, skipped };
}

export function hasFormFamilySelectionCatalogs(): boolean {
  return FORM_FAMILY_CATALOG_SLUGS.every(slug => hasActiveTemplate(slug));
}
