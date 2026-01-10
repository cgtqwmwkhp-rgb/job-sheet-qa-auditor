/**
 * Activation Gates
 * 
 * PR-D: Preconditions that must pass before a template version can be activated.
 * Prevents unsafe activation by validating:
 * - Selection config completeness
 * - Critical fields presence in spec
 */

import type { SpecJson, SelectionConfig } from './types';

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

/**
 * Check activation preconditions for a template version
 * 
 * @param specJson - The specification JSON
 * @param selectionConfigJson - The selection configuration
 * @returns Precondition check result
 */
export function checkActivationPreconditions(
  specJson: SpecJson,
  selectionConfigJson: SelectionConfig
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
