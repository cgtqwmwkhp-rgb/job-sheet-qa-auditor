/**
 * Default Template Definition
 * 
 * PR-1: SSOT Enforcement - This replaces the hardcoded getDefaultGoldSpec()
 * 
 * The default template is auto-registered when no templates exist,
 * ensuring the pipeline ALWAYS uses the template system (no fallback path).
 * 
 * CRITICAL: This is the ONLY source of truth for spec definitions.
 */

import type { SpecJson, SelectionConfig, RoiConfig } from './types';

/**
 * Default template ID - used as the fallback when no specific template matches
 */
export const DEFAULT_TEMPLATE_ID = 'standard-maintenance-v1';
export const DEFAULT_TEMPLATE_NAME = 'Standard Maintenance Job Sheet';

/**
 * Default specification JSON
 * Migrated from analyzer.ts getDefaultGoldSpec()
 * 
 * MUST match the legacy spec exactly for backward compatibility.
 */
export const DEFAULT_SPEC_JSON: SpecJson = {
  name: 'Standard Maintenance Job Sheet',
  version: '2.1.0',
  fields: [
    {
      field: 'customerSignature',
      label: 'Customer Signature',
      type: 'string',
      required: true,
      extractionHints: ['signature', 'customer sign-off', 'authorized by'],
      aliases: ['Customer Sign-off', 'Signature'],
    },
    {
      field: 'dateOfService',
      label: 'Date of Service',
      type: 'date',
      required: true,
      extractionHints: ['date', 'service date', 'completed on'],
      aliases: ['Service Date', 'Date'],
    },
    {
      field: 'serialNumber',
      label: 'Serial Number',
      type: 'string',
      required: true,
      extractionHints: ['serial', 'SN', 'asset number'],
      aliases: ['Serial No', 'S/N', 'Asset ID'],
    },
    {
      field: 'technicianName',
      label: 'Technician Name',
      type: 'string',
      required: true,
      extractionHints: ['technician', 'engineer', 'completed by'],
      aliases: ['Engineer Name', 'Tech'],
    },
    {
      field: 'workDescription',
      label: 'Work Description',
      type: 'string',
      required: true,
      extractionHints: ['work performed', 'description', 'tasks'],
      aliases: ['Work Performed', 'Description of Work'],
    },
    {
      field: 'partsUsed',
      label: 'Parts Used',
      type: 'list',
      required: false,
      extractionHints: ['parts', 'materials', 'components'],
      aliases: ['Parts List', 'Materials Used'],
    },
    {
      field: 'timeIn',
      label: 'Time In',
      type: 'string',
      required: true,
      extractionHints: ['start time', 'time in', 'arrival'],
      aliases: ['Start Time', 'Arrival Time'],
    },
    {
      field: 'timeOut',
      label: 'Time Out',
      type: 'string',
      required: true,
      extractionHints: ['end time', 'time out', 'departure'],
      aliases: ['End Time', 'Departure Time'],
    },
    {
      field: 'customerName',
      label: 'Customer Name',
      type: 'string',
      required: true,
      extractionHints: ['customer', 'client', 'company'],
      aliases: ['Client Name', 'Company Name'],
    },
    {
      field: 'jobNumber',
      label: 'Job Number',
      type: 'string',
      required: true,
      extractionHints: ['job number', 'job no', 'reference'],
      aliases: ['Job No', 'Reference Number'],
    },
  ],
  rules: [
    {
      ruleId: 'R-001',
      field: 'customerSignature',
      description: 'Must contain a valid signature in the customer sign-off box.',
      severity: 'critical',
      type: 'required',
      enabled: true,
      tags: ['compliance', 'signature'],
    },
    {
      ruleId: 'R-002',
      field: 'dateOfService',
      description: 'Date must be present and match the standard format.',
      severity: 'critical',
      type: 'format',
      pattern: 'DD/MM/YYYY',
      enabled: true,
      tags: ['compliance', 'date'],
    },
    {
      ruleId: 'R-003',
      field: 'serialNumber',
      description: 'Serial number must match the pattern SN-XXXXX-XX.',
      severity: 'critical',
      type: 'pattern',
      pattern: '^SN-\\d{5}-[A-Z]{2}$',
      enabled: true,
      tags: ['asset-tracking'],
    },
    {
      ruleId: 'R-004',
      field: 'technicianName',
      description: 'Technician name must be clearly written.',
      severity: 'critical',
      type: 'required',
      enabled: true,
      tags: ['audit-trail'],
    },
    {
      ruleId: 'R-005',
      field: 'workDescription',
      description: 'Description of work performed must be provided.',
      severity: 'critical',
      type: 'required',
      enabled: true,
      tags: ['documentation'],
    },
    {
      ruleId: 'R-006',
      field: 'partsUsed',
      description: 'List of parts used during service (if applicable).',
      severity: 'minor',
      type: 'required',
      enabled: true,
      tags: ['inventory'],
    },
    {
      ruleId: 'R-007',
      field: 'timeIn',
      description: 'Start time of service must be recorded.',
      severity: 'critical',
      type: 'format',
      pattern: 'HH:MM',
      enabled: true,
      tags: ['time-tracking'],
    },
    {
      ruleId: 'R-008',
      field: 'timeOut',
      description: 'End time of service must be recorded.',
      severity: 'critical',
      type: 'format',
      pattern: 'HH:MM',
      enabled: true,
      tags: ['time-tracking'],
    },
    {
      ruleId: 'R-009',
      field: 'customerName',
      description: 'Customer name must be clearly identified.',
      severity: 'critical',
      type: 'required',
      enabled: true,
      tags: ['compliance', 'customer'],
    },
    {
      ruleId: 'R-010',
      field: 'jobNumber',
      description: 'Job number must match the pattern JOB-XXXXXX.',
      severity: 'critical',
      type: 'pattern',
      pattern: '^JOB-\\d{6}$',
      enabled: true,
      tags: ['reference'],
    },
  ],
  metadata: {
    createdFrom: 'legacy-getDefaultGoldSpec',
    migratedAt: '2026-01-11',
    ssotVersion: '1.0.0',
  },
};

/**
 * Default selection configuration
 * ULTRA-permissive catch-all for all job sheet variants
 * This template should ALWAYS match to ensure processing proceeds
 */
export const DEFAULT_SELECTION_CONFIG: SelectionConfig = {
  requiredTokensAll: [], // No strict requirements - this is the fallback
  requiredTokensAny: [], // Empty - acts as universal catch-all
  optionalTokens: [
    // Job/work related
    'job', 'sheet', 'card', 'repair', 'service', 'maintenance', 'work', 'order', 'report',
    'task', 'inspection', 'check', 'visit', 'call', 'ticket', 'invoice', 'form',
    // Personnel
    'technician', 'engineer', 'customer', 'client', 'operator', 'contractor',
    // Documentation
    'signature', 'signed', 'date', 'time', 'reference', 'number', 'id',
    // Equipment
    'serial', 'asset', 'equipment', 'unit', 'machine', 'system', 'plant',
    // Status
    'complete', 'completed', 'done', 'passed', 'failed', 'pending',
    // Parts
    'parts', 'materials', 'used', 'replaced', 'fitted',
  ],
  formCodeRegex: undefined,
  tokenWeights: {
    'job': 5,
    'sheet': 5,
    'card': 5,
    'repair': 5,
    'service': 4,
    'maintenance': 4,
    'work': 3,
    'order': 3,
    'signature': 3,
    'date': 2,
  },
};

/**
 * Default ROI configuration (minimal - for standard job sheet layout)
 */
export const DEFAULT_ROI_CONFIG: RoiConfig = {
  regions: [
    {
      name: 'header',
      page: 1,
      bounds: { x: 0, y: 0, width: 1, height: 0.15 },
      fields: ['serialNumber', 'dateOfService'],
    },
    {
      name: 'signatureBlock',
      page: 1,
      bounds: { x: 0.5, y: 0.8, width: 0.5, height: 0.2 },
      fields: ['customerSignature'],
    },
    {
      name: 'workArea',
      page: 1,
      bounds: { x: 0, y: 0.2, width: 1, height: 0.5 },
      fields: ['workDescription', 'partsUsed'],
    },
  ],
};

/**
 * SSOT Mode - controls whether the pipeline enforces template-only processing
 * 
 * When true (default in staging/prod):
 * - No fallback to hardcoded specs
 * - Pipeline fails explicitly if no template matches
 * - All processing uses DB templates only
 * 
 * When false (dev/testing):
 * - Auto-initializes default template if none exist
 */
export type SsotMode = 'strict' | 'permissive';

/**
 * HARDENING: Environments where SSOT is ALWAYS strict (fail-closed)
 * 
 * In these environments, TEMPLATE_SSOT_MODE env var is IGNORED.
 * This prevents accidental permissive mode in staging/production.
 */
const FAIL_CLOSED_ENVIRONMENTS = new Set(['production', 'staging']);

/**
 * Get SSOT mode from environment
 * 
 * HARDENING (Phase A): Fail-closed enforcement
 * - In production/staging: ALWAYS strict (env var ignored)
 * - In other environments: respects TEMPLATE_SSOT_MODE
 * 
 * This is a security measure to prevent template bypass in prod/staging.
 */
export function getSsotMode(): SsotMode {
  const env = process.env.APP_ENV ?? process.env.NODE_ENV;
  
  // FAIL-CLOSED: In production/staging, ALWAYS strict - no override allowed
  if (FAIL_CLOSED_ENVIRONMENTS.has(env ?? '')) {
    // Log warning if someone tried to override
    const modeOverride = process.env.TEMPLATE_SSOT_MODE;
    if (modeOverride === 'permissive') {
      console.warn(
        `[SSOT] WARNING: TEMPLATE_SSOT_MODE=permissive ignored in ${env}. ` +
        `Fail-closed enforcement is mandatory in staging/production.`
      );
    }
    return 'strict';
  }
  
  // In non-production environments, allow override
  const modeOverride = process.env.TEMPLATE_SSOT_MODE;
  if (modeOverride === 'strict') return 'strict';
  if (modeOverride === 'permissive') return 'permissive';
  
  // Default for development: permissive
  return 'permissive';
}

/**
 * Check if we're in a fail-closed environment
 */
export function isFailClosedEnvironment(): boolean {
  const env = process.env.APP_ENV ?? process.env.NODE_ENV;
  return FAIL_CLOSED_ENVIRONMENTS.has(env ?? '');
}

/**
 * Validate that SSOT requirements are met
 * Returns validation result with error details
 */
export interface SsotValidationResult {
  valid: boolean;
  mode: SsotMode;
  hasActiveTemplates: boolean;
  hasDefaultTemplate: boolean;
  error?: string;
}

/**
 * Convert SpecJson to analyzer GoldSpec format (for backward compatibility)
 */
export function specJsonToGoldSpec(specJson: SpecJson): {
  name: string;
  version: string;
  rules: Array<{
    id: string;
    field: string;
    type: string;
    required: boolean;
    description: string;
    pattern?: string;
    format?: string;
  }>;
} {
  return {
    name: specJson.name,
    version: specJson.version,
    rules: specJson.rules.map(rule => ({
      id: rule.ruleId,
      field: rule.field,
      type: rule.type === 'required' ? 'presence' : rule.type,
      required: rule.type === 'required' || rule.severity === 'critical',
      description: rule.description,
      pattern: rule.pattern,
      format: rule.pattern, // For format type rules
    })),
  };
}
