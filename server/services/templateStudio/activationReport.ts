/**
 * Template Studio — activation report (gates + fixtures + collision preview).
 */

import {
  checkActivationPreconditions,
  type ActivationPreconditionResult,
} from "../templateRegistry/activationGates";
import {
  detectTemplateCollisions,
  fingerprintFromSelectionConfig,
  type CollisionReport,
} from "../templateRegistry/collisionDetector";
import {
  getTemplate,
  getTemplateVersion,
  hasFixturePack,
  listTemplateFingerprints,
  runFixtureMatrix,
  type FixtureRunReport,
} from "../templateRegistry";

export interface ActivationReport {
  versionId: number;
  templateId: number;
  templateSlug: string;
  version: string;
  hashSha256: string;
  allowed: boolean;
  preconditions: ActivationPreconditionResult;
  fixtures: {
    hasFixtures: boolean;
    report: FixtureRunReport | null;
    blocking: boolean;
  };
  collision: CollisionReport;
  environment: string;
}

export function buildActivationReport(versionId: number): ActivationReport {
  const version = getTemplateVersion(versionId);
  if (!version) {
    throw new Error(`Version not found: ${versionId}`);
  }
  const template = getTemplate(version.templateId);
  const templateSlug = template?.templateId ?? `template-${version.templateId}`;

  const preconditions = checkActivationPreconditions(
    version.specJson,
    version.selectionConfigJson
  );

  const hasFixtures = hasFixturePack(versionId);
  let fixtureReport: FixtureRunReport | null = null;
  let fixturesBlocking = false;
  if (hasFixtures) {
    fixtureReport = runFixtureMatrix(
      versionId,
      version.specJson,
      version.selectionConfigJson
    );
    fixturesBlocking =
      fixtureReport.overallResult === "FAIL" &&
      fixtureReport.requiredCasesFailed > 0;
  }

  const candidate = fingerprintFromSelectionConfig(
    templateSlug,
    version.selectionConfigJson,
    version.templateId
  );
  const existing = listTemplateFingerprints(version.templateId);
  const collision = detectTemplateCollisions(candidate, existing);

  const allowed =
    preconditions.allowed && !fixturesBlocking && collision.allowed;

  return {
    versionId,
    templateId: version.templateId,
    templateSlug,
    version: version.version,
    hashSha256: version.hashSha256,
    allowed,
    preconditions,
    fixtures: {
      hasFixtures,
      report: fixtureReport,
      blocking: fixturesBlocking,
    },
    collision,
    environment: process.env.APP_ENV || process.env.NODE_ENV || "development",
  };
}
