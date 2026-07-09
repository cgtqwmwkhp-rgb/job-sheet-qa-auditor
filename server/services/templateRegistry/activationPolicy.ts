/**
 * Activation Policy Service
 *
 * PR-K: Comprehensive activation governance gates.
 * Makes unsafe template activation impossible at scale.
 */

import type { SpecJson, SelectionConfig, RoiConfig } from "./types";
import {
  checkActivationPreconditions,
  CRITICAL_FIELDS,
} from "./activationGates";
import {
  hasFixturePack,
  getFixturePack,
  runFixtureMatrix,
} from "./fixtureRunner";
import { CRITICAL_ROI_FIELDS, getMissingCriticalRois } from "../roiProcessor";
import {
  detectTemplateCollisions,
  fingerprintFromSelectionConfig,
  type CollisionReport,
  type TemplateFingerprint,
} from "./collisionDetector";

/**
 * Activation policy violation
 */
export interface PolicyViolation {
  code: string;
  severity: "blocking" | "warning";
  message: string;
  fixPath?: string;
}

/**
 * Activation policy check result
 */
export interface PolicyCheckResult {
  allowed: boolean;
  violations: PolicyViolation[];
  warnings: PolicyViolation[];
}

/**
 * Template Activation Report artifact
 */
export interface ActivationReport {
  /** Report version */
  reportVersion: "1.0.0";
  /** Template version ID */
  templateVersionId: number;
  /** Activation timestamp */
  timestamp: string;
  /** Whether activation was allowed */
  allowed: boolean;
  /** Policy check details */
  policyCheck: PolicyCheckResult;
  /** Fixture summary */
  fixtureSummary: {
    hasFixturePack: boolean;
    totalCases: number;
    passedCases: number;
    failedCases: number;
    overallResult: "PASS" | "FAIL" | "NOT_RUN";
  };
  /** ROI presence check */
  roiPresence: {
    hasRoiConfig: boolean;
    criticalRoisPresent: string[];
    criticalRoisMissing: string[];
    allowedMissingRois: string[];
  };
  /** Selection config summary */
  selectionConfigSummary: {
    hasRequiredTokens: boolean;
    hasFormCodeRegex: boolean;
    tokenCount: number;
  };
  /** PR-16: fingerprint collision governance */
  collisionCheck: {
    allowed: boolean;
    blockingCount: number;
    warningCount: number;
    message: string;
  };
}

/**
 * Policy configuration - can be customized per deployment
 */
export interface ActivationPolicyConfig {
  /** Require fixture pack for activation */
  requireFixturePack: boolean;
  /** Require all fixtures passing */
  requirePassingFixtures: boolean;
  /** Require all critical ROIs */
  requireCriticalRois: boolean;
  /** Allow specific ROIs to be missing (with documented policy) */
  allowedMissingRois: string[];
  /** Minimum selection tokens required */
  minSelectionTokens: number;
  /** Require no high/exact fingerprint collisions (PR-16) */
  requireNoCollisions: boolean;
  /** Existing template fingerprints to check against (PR-16) */
  existingFingerprints?: TemplateFingerprint[];
  /** Candidate template slug for collision reporting */
  candidateSlug?: string;
}

/**
 * Default policy configuration
 */
export const DEFAULT_POLICY_CONFIG: ActivationPolicyConfig = {
  requireFixturePack: true,
  requirePassingFixtures: true,
  requireCriticalRois: true,
  allowedMissingRois: [], // Can be ['expiryDate'] if documented
  minSelectionTokens: 1,
  requireNoCollisions: true,
};

/**
 * Run comprehensive policy check for template activation
 */
export function runPolicyCheck(
  versionId: number,
  specJson: SpecJson,
  selectionConfigJson: SelectionConfig,
  roiJson: RoiConfig | null,
  config: ActivationPolicyConfig = DEFAULT_POLICY_CONFIG
): PolicyCheckResult {
  const violations: PolicyViolation[] = [];
  const warnings: PolicyViolation[] = [];

  // 1. Check base preconditions (selection config, critical fields)
  const preconditions = checkActivationPreconditions(
    specJson,
    selectionConfigJson
  );
  if (!preconditions.allowed) {
    for (const issue of preconditions.blockingIssues) {
      violations.push({
        code: issue.code,
        severity: "blocking",
        message: issue.message,
        fixPath:
          preconditions.fixPaths[issue.code] ??
          preconditions.fixPaths[`${issue.code}:${issue.field}`],
      });
    }
  }
  for (const issue of preconditions.warnings) {
    warnings.push({
      code: issue.code,
      severity: "warning",
      message: issue.message,
    });
  }

  // 2. Check fixture pack exists
  if (config.requireFixturePack) {
    if (!hasFixturePack(versionId)) {
      violations.push({
        code: "MISSING_FIXTURE_PACK",
        severity: "blocking",
        message: "Template version has no fixture pack",
        fixPath:
          "Create fixture pack with createFixturePack() before activation",
      });
    }
  }

  // 3. Check fixtures passing
  if (config.requirePassingFixtures && hasFixturePack(versionId)) {
    const fixtureReport = runFixtureMatrix(
      versionId,
      specJson,
      selectionConfigJson
    );
    if (fixtureReport.overallResult === "FAIL") {
      violations.push({
        code: "FIXTURES_FAILING",
        severity: "blocking",
        message: `${fixtureReport.requiredCasesFailed} required fixture case(s) failed`,
        fixPath:
          "Fix failing fixtures or update spec to match expected behavior",
      });
    }
  }

  // 4. Check critical ROIs
  if (config.requireCriticalRois) {
    const missingRois = getMissingCriticalRois(roiJson);
    const actualMissing = missingRois.filter(
      r => !config.allowedMissingRois.includes(r)
    );

    if (actualMissing.length > 0) {
      violations.push({
        code: "MISSING_CRITICAL_ROIS",
        severity: "blocking",
        message: `Missing critical ROIs: ${actualMissing.join(", ")}`,
        fixPath: "Add ROI regions using the ROI Editor for all critical fields",
      });
    }

    // Warn about allowed missing ROIs
    const allowedMissing = missingRois.filter(r =>
      config.allowedMissingRois.includes(r)
    );
    if (allowedMissing.length > 0) {
      warnings.push({
        code: "ALLOWED_MISSING_ROIS",
        severity: "warning",
        message: `ROIs allowed to be missing by policy: ${allowedMissing.join(", ")}`,
      });
    }
  }

  // 5. Check selection config has sufficient tokens
  const totalTokens =
    (selectionConfigJson.requiredTokensAll?.length ?? 0) +
    (selectionConfigJson.requiredTokensAny?.length ?? 0);

  if (totalTokens < config.minSelectionTokens) {
    violations.push({
      code: "INSUFFICIENT_SELECTION_TOKENS",
      severity: "blocking",
      message: `Selection config has ${totalTokens} tokens, minimum ${config.minSelectionTokens} required`,
      fixPath: "Add tokens to requiredTokensAll or requiredTokensAny",
    });
  }

  // 6. PR-16: fingerprint collision governance
  if (config.requireNoCollisions && config.existingFingerprints) {
    const candidate = fingerprintFromSelectionConfig(
      config.candidateSlug ?? `version-${versionId}`,
      selectionConfigJson
    );
    const collisionReport = detectTemplateCollisions(
      candidate,
      config.existingFingerprints
    );
    for (const match of collisionReport.blocking) {
      violations.push({
        code: "TEMPLATE_COLLISION",
        severity: "blocking",
        message: `${match.severity}: ${match.templateA} ↔ ${match.templateB} — ${match.reason}`,
        fixPath:
          "Differentiate requiredTokensAll / requiredTokensAny or add a unique formCodeRegex",
      });
    }
    for (const match of collisionReport.warnings) {
      warnings.push({
        code: "TEMPLATE_COLLISION_WARNING",
        severity: "warning",
        message: `${match.severity}: ${match.templateA} ↔ ${match.templateB} — ${match.reason}`,
      });
    }
  }

  return {
    allowed: violations.length === 0,
    violations,
    warnings,
  };
}

/**
 * Run collision check for a candidate selection config against fingerprints.
 * Convenience wrapper for activation reports / analytics governance UI.
 */
export function runCollisionPolicyCheck(
  candidateSlug: string,
  selectionConfigJson: SelectionConfig,
  existingFingerprints: TemplateFingerprint[]
): CollisionReport {
  return detectTemplateCollisions(
    fingerprintFromSelectionConfig(candidateSlug, selectionConfigJson),
    existingFingerprints
  );
}

/**
 * Generate activation report artifact
 */
export function generateActivationReport(
  versionId: number,
  specJson: SpecJson,
  selectionConfigJson: SelectionConfig,
  roiJson: RoiConfig | null,
  config: ActivationPolicyConfig = DEFAULT_POLICY_CONFIG
): ActivationReport {
  const policyCheck = runPolicyCheck(
    versionId,
    specJson,
    selectionConfigJson,
    roiJson,
    config
  );

  // Fixture summary
  let fixtureSummary: ActivationReport["fixtureSummary"];
  if (hasFixturePack(versionId)) {
    const report = runFixtureMatrix(versionId, specJson, selectionConfigJson);
    fixtureSummary = {
      hasFixturePack: true,
      totalCases: report.totalCases,
      passedCases: report.passedCases,
      failedCases: report.failedCases,
      overallResult: report.overallResult,
    };
  } else {
    fixtureSummary = {
      hasFixturePack: false,
      totalCases: 0,
      passedCases: 0,
      failedCases: 0,
      overallResult: "NOT_RUN",
    };
  }

  // ROI presence
  const missingRois = getMissingCriticalRois(roiJson);
  const missingRoiStrings = missingRois as string[];
  const presentRois = CRITICAL_ROI_FIELDS.filter(
    f => !missingRoiStrings.includes(f)
  );

  const roiPresence: ActivationReport["roiPresence"] = {
    hasRoiConfig: roiJson !== null,
    criticalRoisPresent: [...presentRois],
    criticalRoisMissing: [...missingRois],
    allowedMissingRois: config.allowedMissingRois.filter(r =>
      missingRoiStrings.includes(r)
    ),
  };

  // Selection config summary
  const selectionConfigSummary: ActivationReport["selectionConfigSummary"] = {
    hasRequiredTokens:
      (selectionConfigJson.requiredTokensAll?.length ?? 0) > 0 ||
      (selectionConfigJson.requiredTokensAny?.length ?? 0) > 0,
    hasFormCodeRegex: Boolean(selectionConfigJson.formCodeRegex),
    tokenCount:
      (selectionConfigJson.requiredTokensAll?.length ?? 0) +
      (selectionConfigJson.requiredTokensAny?.length ?? 0) +
      (selectionConfigJson.optionalTokens?.length ?? 0),
  };

  const collisionReport =
    config.existingFingerprints != null
      ? detectTemplateCollisions(
          fingerprintFromSelectionConfig(
            config.candidateSlug ?? `version-${versionId}`,
            selectionConfigJson
          ),
          config.existingFingerprints
        )
      : {
          allowed: true,
          blocking: [],
          warnings: [],
          matches: [],
          message:
            "Collision check skipped (no existing fingerprints provided)",
        };

  return {
    reportVersion: "1.0.0",
    templateVersionId: versionId,
    timestamp: new Date().toISOString(),
    allowed: policyCheck.allowed,
    policyCheck,
    fixtureSummary,
    roiPresence,
    selectionConfigSummary,
    collisionCheck: {
      allowed: collisionReport.allowed,
      blockingCount: collisionReport.blocking.length,
      warningCount: collisionReport.warnings.length,
      message: collisionReport.message,
    },
  };
}

/**
 * Format policy check result as error message
 */
export function formatPolicyError(result: PolicyCheckResult): string {
  const violations = result.violations
    .map(v => `- ${v.code}: ${v.message}`)
    .join("\n");
  const fixes = result.violations
    .filter(v => v.fixPath)
    .map(v => `  ${v.code}: ${v.fixPath}`)
    .join("\n");

  return `ACTIVATION_POLICY_ERROR: Template cannot be activated.\n\nViolations:\n${violations}\n\nFix Paths:\n${fixes}`;
}
