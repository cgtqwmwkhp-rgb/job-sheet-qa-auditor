/**
 * Activation Gates
 * 
 * PR-D: Preconditions that must pass before a template version can be activated.
 * Prevents unsafe activation by validating:
 * - Selection config completeness
 * - Critical fields presence in spec
 * - Critical ROIs + field↔ROI parity (GIGO)
 */

import type { SpecJson, SelectionConfig, RoiConfig, RoiRegion } from './types';

/**
 * Critical fields that must be present in any activated template spec
 */
export const CRITICAL_FIELDS = [
  'jobReference',
  'assetId', 
  'date',
  'engineerSignOff',
] as const;

/**
 * Optional critical fields (warning if missing, not blocking)
 */
export const RECOMMENDED_FIELDS = [
  'expiryDate',
  'complianceTickboxes',
  'customerSignature',
] as const;

/**
 * Critical ROI region names that must be drawn before activate
 */
export const CRITICAL_ROI_NAMES = [
  'jobReference',
  'assetId',
  'date',
  'tickboxBlock',
  'signatureBlock',
] as const;

/**
 * Activation precondition result
 */
export interface ActivationPreconditionResult {
  /** Whether activation is allowed */
  allowed: boolean;
  /** List of blocking issues */
  blockingIssues: ActivationIssue[];
  /** List of warnings (non-blocking) */
  warnings: ActivationIssue[];
  /** Fix path for each blocking issue */
  fixPaths: Record<string, string>;
}

/**
 * Single activation issue
 */
export interface ActivationIssue {
  code: string;
  message: string;
  field?: string;
}

function enabledRegions(roiJson?: RoiConfig | null): RoiRegion[] {
  return (roiJson?.regions ?? []).filter(
    r => (r as { enabled?: boolean }).enabled !== false
  );
}

/** ROI covers a field via name match or region.fields */
export function regionCoversField(region: RoiRegion, fieldId: string): boolean {
  if (region.name === fieldId) return true;
  if (region.fields?.includes(fieldId)) return true;
  // Canonical aliases used in Studio
  if (fieldId === 'engineerSignOff') {
    return (
      region.name === 'engineerSignature' ||
      region.name === 'signatureBlock' ||
      region.fields?.includes('engineerSignOff') === true
    );
  }
  if (fieldId === 'customerSignature') {
    return (
      region.name === 'customerSignature' ||
      region.name === 'signatureBlock' ||
      region.fields?.includes('customerSignature') === true
    );
  }
  if (fieldId === 'complianceTickboxes') {
    return region.name === 'tickboxBlock' || region.fields?.includes('complianceTickboxes') === true;
  }
  return false;
}

export function findRegionForField(
  regions: RoiRegion[],
  fieldId: string
): RoiRegion | undefined {
  return regions.find(r => regionCoversField(r, fieldId));
}

/**
 * Check activation preconditions for a template version
 */
export function checkActivationPreconditions(
  specJson: SpecJson,
  selectionConfigJson: SelectionConfig,
  roiJson?: RoiConfig | null
): ActivationPreconditionResult {
  const blockingIssues: ActivationIssue[] = [];
  const warnings: ActivationIssue[] = [];
  const fixPaths: Record<string, string> = {};

  // Check selection config completeness
  if (!selectionConfigJson.requiredTokensAll || selectionConfigJson.requiredTokensAll.length === 0) {
    if (!selectionConfigJson.requiredTokensAny || selectionConfigJson.requiredTokensAny.length === 0) {
      if (!selectionConfigJson.formCodeRegex) {
        blockingIssues.push({
          code: 'SELECTION_CONFIG_EMPTY',
          message: 'Selection config must have at least one of: requiredTokensAll, requiredTokensAny, or formCodeRegex',
        });
        fixPaths['SELECTION_CONFIG_EMPTY'] = 'Add tokens to selectionConfigJson.requiredTokensAll or requiredTokensAny, or add a formCodeRegex pattern';
      }
    }
  }

  // Check critical fields in spec
  const specFieldIds = new Set(specJson.fields.map(f => f.field));
  
  for (const criticalField of CRITICAL_FIELDS) {
    if (!specFieldIds.has(criticalField)) {
      blockingIssues.push({
        code: 'MISSING_CRITICAL_FIELD',
        message: `Critical field '${criticalField}' is missing from spec`,
        field: criticalField,
      });
      fixPaths[`MISSING_CRITICAL_FIELD:${criticalField}`] = `Add field definition for '${criticalField}' to specJson.fields`;
    }
  }

  // Check recommended fields (warnings only)
  for (const recommendedField of RECOMMENDED_FIELDS) {
    if (!specFieldIds.has(recommendedField)) {
      warnings.push({
        code: 'MISSING_RECOMMENDED_FIELD',
        message: `Recommended field '${recommendedField}' is missing from spec`,
        field: recommendedField,
      });
    }
  }

  // Check that required fields have validation rules
  const fieldsWithRules = new Set(specJson.rules.map(r => r.field));
  for (const criticalField of CRITICAL_FIELDS) {
    if (specFieldIds.has(criticalField) && !fieldsWithRules.has(criticalField)) {
      warnings.push({
        code: 'CRITICAL_FIELD_NO_RULE',
        message: `Critical field '${criticalField}' has no validation rule`,
        field: criticalField,
      });
    }
  }

  // Check spec has at least one rule
  if (specJson.rules.length === 0) {
    blockingIssues.push({
      code: 'NO_VALIDATION_RULES',
      message: 'Spec must have at least one validation rule',
    });
    fixPaths['NO_VALIDATION_RULES'] = 'Add at least one rule to specJson.rules';
  }

  // --- ROI readiness (GIGO) ---
  const regions = enabledRegions(roiJson);

  if (!roiJson || regions.length === 0) {
    blockingIssues.push({
      code: 'MISSING_ROI_CONFIG',
      message: 'Template must have ROI regions drawn before activation',
    });
    fixPaths['MISSING_ROI_CONFIG'] =
      'Open Draw regions, place critical ROIs, and Save ROI';
  } else {
    for (const roiName of CRITICAL_ROI_NAMES) {
      const found =
        roiName === 'signatureBlock'
          ? regions.some(
              r =>
                r.name === 'signatureBlock' ||
                r.name === 'engineerSignature' ||
                r.fields?.includes('engineerSignOff')
            )
          : regions.some(r => r.name === roiName);
      if (!found) {
        blockingIssues.push({
          code: 'MISSING_CRITICAL_ROI',
          message: `Critical ROI '${roiName}' is missing`,
          field: roiName,
        });
        fixPaths[`MISSING_CRITICAL_ROI:${roiName}`] =
          `Draw a region named '${roiName}' on the sample PDF`;
      }
    }

    // Critical field ↔ ROI parity (blocking)
    for (const criticalField of CRITICAL_FIELDS) {
      if (!specFieldIds.has(criticalField)) continue;
      if (!findRegionForField(regions, criticalField)) {
        blockingIssues.push({
          code: 'CRITICAL_FIELD_NO_ROI',
          message: `Critical field '${criticalField}' has no matching ROI region`,
          field: criticalField,
        });
        fixPaths[`CRITICAL_FIELD_NO_ROI:${criticalField}`] =
          `Draw an ROI whose name or fields[] is '${criticalField}' (engineerSignOff may use signatureBlock / engineerSignature)`;
      }
    }

    // Recommended field ↔ ROI parity (warnings)
    for (const recommendedField of RECOMMENDED_FIELDS) {
      if (!specFieldIds.has(recommendedField)) continue;
      if (!findRegionForField(regions, recommendedField)) {
        warnings.push({
          code: 'RECOMMENDED_FIELD_NO_ROI',
          message: `Recommended field '${recommendedField}' has no matching ROI`,
          field: recommendedField,
        });
      }
    }

    // Orphan ROIs (warn)
    for (const region of regions) {
      const covered =
        specFieldIds.has(region.name) ||
        (region.fields ?? []).some(f => specFieldIds.has(f)) ||
        region.name === 'header' ||
        region.name === 'tickboxBlock' ||
        region.name === 'signatureBlock' ||
        region.name === 'workDescription' ||
        region.name === 'partsUsed' ||
        region.name === 'engineerSignature' ||
        region.name === 'customerSignature';
      if (!covered) {
        warnings.push({
          code: 'ORPHAN_ROI',
          message: `ROI '${region.name}' is not linked to a spec field — rename to a field id or set region.fields`,
          field: region.name,
        });
      }
    }
  }

  return {
    allowed: blockingIssues.length === 0,
    blockingIssues,
    warnings,
    fixPaths,
  };
}

/**
 * Format activation precondition failure as PIPELINE_ERROR message
 */
export function formatActivationError(result: ActivationPreconditionResult): string {
  const issues = result.blockingIssues.map(i => `- ${i.code}: ${i.message}`).join('\n');
  const fixes = Object.entries(result.fixPaths)
    .map(([code, path]) => `  ${code}: ${path}`)
    .join('\n');
  
  return `PIPELINE_ERROR: Activation preconditions not met.\n\nBlocking Issues:\n${issues}\n\nFix Paths:\n${fixes}`;
}
