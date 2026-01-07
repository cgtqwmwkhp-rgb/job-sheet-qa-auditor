/**
 * Governance Rules Engine
 * 
 * Enforces governance policies for templates as code.
 * All rules are declarative and auditable.
 */

import { CANONICAL_REASON_CODES, type CanonicalReasonCode } from './canonicalSemantics';

// ============================================================================
// Types
// ============================================================================

export interface GovernanceRule {
  ruleId: string;
  name: string;
  description: string;
  severity: 'blocking' | 'warning' | 'info';
  category: 'schema' | 'naming' | 'coverage' | 'security' | 'quality';
  enabled: boolean;
}

export interface GovernanceViolation {
  ruleId: string;
  ruleName: string;
  severity: 'blocking' | 'warning' | 'info';
  message: string;
  location?: string;
  suggestion?: string;
}

export interface GovernanceReport {
  templateId: string;
  templateVersion: string;
  timestamp: string;
  passed: boolean;
  blockingViolations: GovernanceViolation[];
  warnings: GovernanceViolation[];
  info: GovernanceViolation[];
  summary: {
    totalRules: number;
    passedRules: number;
    failedRules: number;
    blockedBy: string[];
  };
}

export interface TemplateSpec {
  templateId: string;
  version: string;
  displayName: string;
  client: string;
  documentType: string;
  fieldRules: Array<{
    field: string;
    label: string;
    required: boolean;
    type: string;
    description?: string;
  }>;
  validationRules: Array<{
    ruleId: string;
    field: string;
    type: string;
    description?: string;
    severity?: string;
    reasonCode?: string;
  }>;
  selection?: {
    method: string;
    requiredTokensAll?: string[];
    requiredTokensAny?: string[];
    formCodeRegex?: string;
  };
}

// ============================================================================
// Governance Rules Registry
// ============================================================================

export const GOVERNANCE_RULES: GovernanceRule[] = [
  // Schema Rules
  {
    ruleId: 'GOV-001',
    name: 'Template ID Format',
    description: 'Template ID must follow naming convention: CLIENT_DOCTYPE_VERSION',
    severity: 'blocking',
    category: 'naming',
    enabled: true,
  },
  {
    ruleId: 'GOV-002',
    name: 'Version Format',
    description: 'Version must follow semantic versioning (X.Y.Z)',
    severity: 'blocking',
    category: 'schema',
    enabled: true,
  },
  {
    ruleId: 'GOV-003',
    name: 'Required Metadata',
    description: 'Template must have displayName, client, and documentType',
    severity: 'blocking',
    category: 'schema',
    enabled: true,
  },
  {
    ruleId: 'GOV-004',
    name: 'Minimum Field Count',
    description: 'Template must define at least 5 fields',
    severity: 'blocking',
    category: 'coverage',
    enabled: true,
  },
  {
    ruleId: 'GOV-005',
    name: 'Minimum Validation Rules',
    description: 'Template must define at least 3 validation rules',
    severity: 'blocking',
    category: 'coverage',
    enabled: true,
  },
  
  // Naming Rules
  {
    ruleId: 'GOV-010',
    name: 'Field Naming Convention',
    description: 'Field names must be camelCase',
    severity: 'warning',
    category: 'naming',
    enabled: true,
  },
  {
    ruleId: 'GOV-011',
    name: 'Rule ID Naming Convention',
    description: 'Rule IDs must follow pattern: RULE_XXX',
    severity: 'warning',
    category: 'naming',
    enabled: true,
  },
  
  // Coverage Rules
  {
    ruleId: 'GOV-020',
    name: 'Required Field Coverage',
    description: 'At least 50% of fields must be marked as required',
    severity: 'warning',
    category: 'coverage',
    enabled: true,
  },
  {
    ruleId: 'GOV-021',
    name: 'Field Validation Coverage',
    description: 'All required fields must have at least one validation rule',
    severity: 'blocking',
    category: 'coverage',
    enabled: true,
  },
  {
    ruleId: 'GOV-022',
    name: 'Selection Criteria',
    description: 'Template must have selection criteria for auto-selection',
    severity: 'warning',
    category: 'coverage',
    enabled: true,
  },
  
  // Security Rules
  {
    ruleId: 'GOV-030',
    name: 'No PII in Field Names',
    description: 'Field names must not contain PII indicators',
    severity: 'warning',
    category: 'security',
    enabled: true,
  },
  {
    ruleId: 'GOV-031',
    name: 'Canonical Reason Codes',
    description: 'All reason codes must be from the canonical set',
    severity: 'blocking',
    category: 'quality',
    enabled: true,
  },
  
  // Quality Rules
  {
    ruleId: 'GOV-040',
    name: 'Field Descriptions',
    description: 'All fields should have descriptions',
    severity: 'info',
    category: 'quality',
    enabled: true,
  },
  {
    ruleId: 'GOV-041',
    name: 'Rule Descriptions',
    description: 'All validation rules should have descriptions',
    severity: 'info',
    category: 'quality',
    enabled: true,
  },
  {
    ruleId: 'GOV-042',
    name: 'Duplicate Field Detection',
    description: 'No duplicate field names allowed',
    severity: 'blocking',
    category: 'quality',
    enabled: true,
  },
  {
    ruleId: 'GOV-043',
    name: 'Duplicate Rule Detection',
    description: 'No duplicate rule IDs allowed',
    severity: 'blocking',
    category: 'quality',
    enabled: true,
  },
];

// ============================================================================
// Rule Validators
// ============================================================================

type RuleValidator = (template: TemplateSpec) => GovernanceViolation[];

const validators: Record<string, RuleValidator> = {
  'GOV-001': (template) => {
    const violations: GovernanceViolation[] = [];
    const pattern = /^[A-Z]+_[A-Z_]+_V\d+$/;
    if (!pattern.test(template.templateId)) {
      violations.push({
        ruleId: 'GOV-001',
        ruleName: 'Template ID Format',
        severity: 'blocking',
        message: `Template ID "${template.templateId}" does not follow naming convention`,
        location: 'templateId',
        suggestion: 'Use format: CLIENT_DOCTYPE_VERSION (e.g., PE_LOLER_EXAM_V1)',
      });
    }
    return violations;
  },

  'GOV-002': (template) => {
    const violations: GovernanceViolation[] = [];
    const pattern = /^\d+\.\d+\.\d+$/;
    if (!pattern.test(template.version)) {
      violations.push({
        ruleId: 'GOV-002',
        ruleName: 'Version Format',
        severity: 'blocking',
        message: `Version "${template.version}" is not valid semantic versioning`,
        location: 'version',
        suggestion: 'Use format: X.Y.Z (e.g., 1.0.0)',
      });
    }
    return violations;
  },

  'GOV-003': (template) => {
    const violations: GovernanceViolation[] = [];
    if (!template.displayName) {
      violations.push({
        ruleId: 'GOV-003',
        ruleName: 'Required Metadata',
        severity: 'blocking',
        message: 'Missing required field: displayName',
        location: 'displayName',
      });
    }
    if (!template.client) {
      violations.push({
        ruleId: 'GOV-003',
        ruleName: 'Required Metadata',
        severity: 'blocking',
        message: 'Missing required field: client',
        location: 'client',
      });
    }
    if (!template.documentType) {
      violations.push({
        ruleId: 'GOV-003',
        ruleName: 'Required Metadata',
        severity: 'blocking',
        message: 'Missing required field: documentType',
        location: 'documentType',
      });
    }
    return violations;
  },

  'GOV-004': (template) => {
    const violations: GovernanceViolation[] = [];
    if (template.fieldRules.length < 5) {
      violations.push({
        ruleId: 'GOV-004',
        ruleName: 'Minimum Field Count',
        severity: 'blocking',
        message: `Template has only ${template.fieldRules.length} fields (minimum: 5)`,
        location: 'fieldRules',
        suggestion: 'Add more field definitions to meet minimum coverage',
      });
    }
    return violations;
  },

  'GOV-005': (template) => {
    const violations: GovernanceViolation[] = [];
    if (template.validationRules.length < 3) {
      violations.push({
        ruleId: 'GOV-005',
        ruleName: 'Minimum Validation Rules',
        severity: 'blocking',
        message: `Template has only ${template.validationRules.length} validation rules (minimum: 3)`,
        location: 'validationRules',
        suggestion: 'Add more validation rules to meet minimum coverage',
      });
    }
    return violations;
  },

  'GOV-010': (template) => {
    const violations: GovernanceViolation[] = [];
    const camelCasePattern = /^[a-z][a-zA-Z0-9]*$/;
    for (const field of template.fieldRules) {
      if (!camelCasePattern.test(field.field)) {
        violations.push({
          ruleId: 'GOV-010',
          ruleName: 'Field Naming Convention',
          severity: 'warning',
          message: `Field "${field.field}" is not camelCase`,
          location: `fieldRules.${field.field}`,
          suggestion: 'Use camelCase naming (e.g., jobReference, expiryDate)',
        });
      }
    }
    return violations;
  },

  'GOV-011': (template) => {
    const violations: GovernanceViolation[] = [];
    const ruleIdPattern = /^RULE_\d{3}$/;
    for (const rule of template.validationRules) {
      if (!ruleIdPattern.test(rule.ruleId)) {
        violations.push({
          ruleId: 'GOV-011',
          ruleName: 'Rule ID Naming Convention',
          severity: 'warning',
          message: `Rule ID "${rule.ruleId}" does not follow pattern RULE_XXX`,
          location: `validationRules.${rule.ruleId}`,
          suggestion: 'Use format: RULE_001, RULE_002, etc.',
        });
      }
    }
    return violations;
  },

  'GOV-020': (template) => {
    const violations: GovernanceViolation[] = [];
    const requiredCount = template.fieldRules.filter(f => f.required).length;
    const ratio = requiredCount / template.fieldRules.length;
    if (ratio < 0.5) {
      violations.push({
        ruleId: 'GOV-020',
        ruleName: 'Required Field Coverage',
        severity: 'warning',
        message: `Only ${Math.round(ratio * 100)}% of fields are required (minimum: 50%)`,
        location: 'fieldRules',
        suggestion: 'Mark more critical fields as required',
      });
    }
    return violations;
  },

  'GOV-021': (template) => {
    const violations: GovernanceViolation[] = [];
    const requiredFields = template.fieldRules.filter(f => f.required).map(f => f.field);
    const validatedFields = new Set(template.validationRules.map(r => r.field));
    
    for (const field of requiredFields) {
      if (!validatedFields.has(field)) {
        violations.push({
          ruleId: 'GOV-021',
          ruleName: 'Field Validation Coverage',
          severity: 'blocking',
          message: `Required field "${field}" has no validation rules`,
          location: `fieldRules.${field}`,
          suggestion: 'Add at least one validation rule for this required field',
        });
      }
    }
    return violations;
  },

  'GOV-022': (template) => {
    const violations: GovernanceViolation[] = [];
    if (!template.selection || !template.selection.method) {
      violations.push({
        ruleId: 'GOV-022',
        ruleName: 'Selection Criteria',
        severity: 'warning',
        message: 'Template has no selection criteria defined',
        location: 'selection',
        suggestion: 'Add selection criteria for auto-selection support',
      });
    }
    return violations;
  },

  'GOV-030': (template) => {
    const violations: GovernanceViolation[] = [];
    const piiPatterns = ['ssn', 'socialSecurity', 'nationalId', 'passport', 'driverLicense'];
    
    for (const field of template.fieldRules) {
      const fieldLower = field.field.toLowerCase();
      for (const pattern of piiPatterns) {
        if (fieldLower.includes(pattern.toLowerCase())) {
          violations.push({
            ruleId: 'GOV-030',
            ruleName: 'No PII in Field Names',
            severity: 'warning',
            message: `Field "${field.field}" may contain PII indicator`,
            location: `fieldRules.${field.field}`,
            suggestion: 'Review field for PII handling requirements',
          });
        }
      }
    }
    return violations;
  },

  'GOV-031': (template) => {
    const violations: GovernanceViolation[] = [];
    const canonicalCodes = CANONICAL_REASON_CODES as readonly string[];
    
    for (const rule of template.validationRules) {
      if (rule.reasonCode && !canonicalCodes.includes(rule.reasonCode)) {
        violations.push({
          ruleId: 'GOV-031',
          ruleName: 'Canonical Reason Codes',
          severity: 'blocking',
          message: `Rule "${rule.ruleId}" uses non-canonical reason code "${rule.reasonCode}"`,
          location: `validationRules.${rule.ruleId}`,
          suggestion: `Use one of: ${canonicalCodes.join(', ')}`,
        });
      }
    }
    return violations;
  },

  'GOV-040': (template) => {
    const violations: GovernanceViolation[] = [];
    const fieldsWithoutDesc = template.fieldRules.filter(f => !f.description);
    if (fieldsWithoutDesc.length > 0) {
      violations.push({
        ruleId: 'GOV-040',
        ruleName: 'Field Descriptions',
        severity: 'info',
        message: `${fieldsWithoutDesc.length} fields are missing descriptions`,
        location: 'fieldRules',
        suggestion: 'Add descriptions to improve documentation',
      });
    }
    return violations;
  },

  'GOV-041': (template) => {
    const violations: GovernanceViolation[] = [];
    const rulesWithoutDesc = template.validationRules.filter(r => !r.description);
    if (rulesWithoutDesc.length > 0) {
      violations.push({
        ruleId: 'GOV-041',
        ruleName: 'Rule Descriptions',
        severity: 'info',
        message: `${rulesWithoutDesc.length} rules are missing descriptions`,
        location: 'validationRules',
        suggestion: 'Add descriptions to improve documentation',
      });
    }
    return violations;
  },

  'GOV-042': (template) => {
    const violations: GovernanceViolation[] = [];
    const fieldNames = template.fieldRules.map(f => f.field);
    const duplicates = fieldNames.filter((name, index) => fieldNames.indexOf(name) !== index);
    
    for (const dup of [...new Set(duplicates)]) {
      violations.push({
        ruleId: 'GOV-042',
        ruleName: 'Duplicate Field Detection',
        severity: 'blocking',
        message: `Duplicate field name: "${dup}"`,
        location: `fieldRules.${dup}`,
        suggestion: 'Remove or rename duplicate field',
      });
    }
    return violations;
  },

  'GOV-043': (template) => {
    const violations: GovernanceViolation[] = [];
    const ruleIds = template.validationRules.map(r => r.ruleId);
    const duplicates = ruleIds.filter((id, index) => ruleIds.indexOf(id) !== index);
    
    for (const dup of [...new Set(duplicates)]) {
      violations.push({
        ruleId: 'GOV-043',
        ruleName: 'Duplicate Rule Detection',
        severity: 'blocking',
        message: `Duplicate rule ID: "${dup}"`,
        location: `validationRules.${dup}`,
        suggestion: 'Remove or rename duplicate rule',
      });
    }
    return violations;
  },
};

// ============================================================================
// Governance Engine
// ============================================================================

export function validateTemplate(template: TemplateSpec): GovernanceReport {
  const violations: GovernanceViolation[] = [];
  
  // Run all enabled rules
  for (const rule of GOVERNANCE_RULES) {
    if (!rule.enabled) continue;
    
    const validator = validators[rule.ruleId];
    if (validator) {
      const ruleViolations = validator(template);
      violations.push(...ruleViolations);
    }
  }
  
  // Categorize violations
  const blockingViolations = violations.filter(v => v.severity === 'blocking');
  const warnings = violations.filter(v => v.severity === 'warning');
  const info = violations.filter(v => v.severity === 'info');
  
  // Calculate summary
  const enabledRules = GOVERNANCE_RULES.filter(r => r.enabled);
  const failedRuleIds = new Set(violations.map(v => v.ruleId));
  const passedRules = enabledRules.filter(r => !failedRuleIds.has(r.ruleId)).length;
  
  return {
    templateId: template.templateId,
    templateVersion: template.version,
    timestamp: new Date().toISOString(),
    passed: blockingViolations.length === 0,
    blockingViolations,
    warnings,
    info,
    summary: {
      totalRules: enabledRules.length,
      passedRules,
      failedRules: enabledRules.length - passedRules,
      blockedBy: blockingViolations.map(v => v.ruleId),
    },
  };
}

// ============================================================================
// CI Integration
// ============================================================================

export interface CIGateResult {
  passed: boolean;
  exitCode: number;
  summary: string;
  reports: GovernanceReport[];
}

export function runCIGate(templates: TemplateSpec[]): CIGateResult {
  const reports: GovernanceReport[] = [];
  let allPassed = true;
  
  for (const template of templates) {
    const report = validateTemplate(template);
    reports.push(report);
    if (!report.passed) {
      allPassed = false;
    }
  }
  
  const totalBlocking = reports.reduce((sum, r) => sum + r.blockingViolations.length, 0);
  const totalWarnings = reports.reduce((sum, r) => sum + r.warnings.length, 0);
  
  return {
    passed: allPassed,
    exitCode: allPassed ? 0 : 1,
    summary: allPassed
      ? `✅ All ${templates.length} templates passed governance checks (${totalWarnings} warnings)`
      : `❌ ${reports.filter(r => !r.passed).length}/${templates.length} templates failed (${totalBlocking} blocking violations)`,
    reports,
  };
}

// ============================================================================
// Rule Management
// ============================================================================

export function getEnabledRules(): GovernanceRule[] {
  return GOVERNANCE_RULES.filter(r => r.enabled);
}

export function getRulesByCategory(category: GovernanceRule['category']): GovernanceRule[] {
  return GOVERNANCE_RULES.filter(r => r.category === category);
}

export function getRulesBySeverity(severity: GovernanceRule['severity']): GovernanceRule[] {
  return GOVERNANCE_RULES.filter(r => r.severity === severity);
}
