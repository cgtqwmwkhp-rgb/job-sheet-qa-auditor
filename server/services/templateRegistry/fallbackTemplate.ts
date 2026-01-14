/**
 * Generic Fallback Template
 * 
 * This template is used when no other template matches a document.
 * It provides:
 * - Universal field extraction (job ref, date, signature, etc.)
 * - Basic validation rules
 * - Automatic routing to REVIEW_QUEUE
 * 
 * DESIGN PRINCIPLES:
 * - Never block processing - always provide partial results
 * - Give humans enough context to manually classify
 * - Suggest potential template matches for human selection
 */

import type { SpecJson, SelectionConfig, RoiConfig } from './types';

/**
 * Fallback template ID - used when no specific template matches
 */
export const FALLBACK_TEMPLATE_ID = 'generic-fallback-v1';
export const FALLBACK_TEMPLATE_NAME = 'Unknown Document Type';

/**
 * Fallback priority - higher number = lower priority
 * This ensures the fallback template only matches when nothing else does
 */
export const FALLBACK_PRIORITY = 999;

/**
 * Fallback specification JSON
 * 
 * Contains universal fields that should be present in most job sheets.
 * All fields are optional since we don't know what document type this is.
 */
export const FALLBACK_SPEC_JSON: SpecJson = {
  name: 'Generic Document Assessment',
  version: '1.0.0',
  fields: [
    {
      field: 'jobReference',
      label: 'Job Reference',
      type: 'string',
      required: false, // Optional - we don't know if this doc type has it
      extractionHints: [
        'job number', 'job no', 'job ref', 'work order', 'wo#', 'wo number',
        'reference', 'ref:', 'order number', 'ticket', 'case number'
      ],
      aliases: ['Job No', 'Work Order', 'WO#', 'Reference'],
    },
    {
      field: 'documentDate',
      label: 'Document Date',
      type: 'date',
      required: false,
      extractionHints: [
        'date', 'dated', 'service date', 'inspection date', 'completed on',
        'report date', 'visit date', 'examination date'
      ],
      aliases: ['Date', 'Service Date', 'Report Date'],
    },
    {
      field: 'signature',
      label: 'Signature',
      type: 'string',
      required: false,
      extractionHints: [
        'signature', 'signed', 'sign-off', 'authorized by', 'approved by',
        'customer signature', 'engineer signature', 'technician signature'
      ],
      aliases: ['Signed By', 'Authorized By'],
    },
    {
      field: 'assetIdentifier',
      label: 'Asset Identifier',
      type: 'string',
      required: false,
      extractionHints: [
        'serial number', 'serial no', 's/n', 'asset number', 'asset id',
        'registration', 'reg no', 'fleet number', 'plant number', 'equipment id'
      ],
      aliases: ['Serial No', 'Asset ID', 'Registration', 'Fleet No'],
    },
    {
      field: 'engineerName',
      label: 'Engineer/Technician Name',
      type: 'string',
      required: false,
      extractionHints: [
        'engineer', 'technician', 'tech', 'inspector', 'examiner',
        'completed by', 'attended by', 'service by'
      ],
      aliases: ['Technician', 'Inspector', 'Completed By'],
    },
    {
      field: 'customerName',
      label: 'Customer/Site Name',
      type: 'string',
      required: false,
      extractionHints: [
        'customer', 'client', 'company', 'site', 'location', 'address',
        'site name', 'customer name'
      ],
      aliases: ['Client', 'Site', 'Location'],
    },
    {
      field: 'documentType',
      label: 'Document Type Indicator',
      type: 'string',
      required: false,
      extractionHints: [
        'report type', 'form type', 'certificate', 'inspection', 'service',
        'compliance', 'examination', 'LOLER', 'VOR', 'PTO', 'checklist'
      ],
      aliases: ['Form Type', 'Report Type'],
    },
    {
      field: 'workDescription',
      label: 'Work Description',
      type: 'string',
      required: false,
      extractionHints: [
        'work performed', 'work done', 'description', 'summary', 'notes',
        'findings', 'comments', 'remarks', 'details'
      ],
      aliases: ['Description', 'Work Performed', 'Summary'],
    },
  ],
  validationRules: [
    {
      id: 'GEN-001',
      name: 'Document has readable content',
      description: 'At least some text was extracted from the document',
      rule: 'extractedFieldCount >= 1',
      severity: 'S2',
      reasonCode: 'OCR_FAILURE',
    },
    {
      id: 'GEN-002',
      name: 'Basic identification present',
      description: 'Document has at least a date OR job reference OR asset identifier',
      rule: 'hasJobReference OR hasDate OR hasAssetIdentifier',
      severity: 'S2',
      reasonCode: 'MISSING_FIELD',
    },
    {
      id: 'GEN-003',
      name: 'OCR confidence acceptable',
      description: 'Overall OCR confidence is above minimum threshold',
      rule: 'ocrConfidence >= 0.5',
      severity: 'S2',
      reasonCode: 'LOW_CONFIDENCE',
    },
  ],
};

/**
 * Fallback selection config
 * 
 * This config ensures the fallback template:
 * - Has no required tokens (matches anything)
 * - Has no boosters (doesn't compete with real templates)
 * - Has no excluders (accepts all documents)
 */
export const FALLBACK_SELECTION_CONFIG: SelectionConfig = {
  fingerprint: {
    requiredTokensAll: [],
    requiredTokensAny: [],
    optionalTokens: [],
    excludeTokens: [],
  },
  // No client context - accepts all clients
};

/**
 * Fallback ROI config - empty since we don't know where to look
 */
export const FALLBACK_ROI_CONFIG: RoiConfig = {
  pageIndex0Based: 0,
  regions: [],
};

/**
 * Check if a template ID is the fallback template
 */
export function isFallbackTemplate(templateId: string): boolean {
  return templateId === FALLBACK_TEMPLATE_ID;
}

/**
 * Suggested template hints based on extracted text
 * 
 * These patterns help suggest which real template the document might match,
 * giving humans a head start in manual classification.
 */
export const TEMPLATE_SUGGESTION_PATTERNS: {
  pattern: RegExp;
  suggestedTemplateHint: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}[] = [
  {
    pattern: /LOLER|thorough examination|lifting equipment|6 month|12 month examination/i,
    suggestedTemplateHint: 'LOLER Examination Report',
    confidence: 'HIGH',
  },
  {
    pattern: /VOR|vehicle off road|breakdown|repair report/i,
    suggestedTemplateHint: 'VOR/Repair Report',
    confidence: 'HIGH',
  },
  {
    pattern: /PTO|power take-off|power take off/i,
    suggestedTemplateHint: 'PTO Service Report',
    confidence: 'HIGH',
  },
  {
    pattern: /aztec|weighing system|onboard weighing/i,
    suggestedTemplateHint: 'Aztec Weighing System',
    confidence: 'HIGH',
  },
  {
    pattern: /compliance|checklist|service report/i,
    suggestedTemplateHint: 'Compliance/Service Report',
    confidence: 'MEDIUM',
  },
  {
    pattern: /inspection|examination|certificate/i,
    suggestedTemplateHint: 'Inspection Certificate',
    confidence: 'LOW',
  },
];

/**
 * Get suggested templates based on document text
 */
export function getSuggestedTemplates(documentText: string): {
  hint: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}[] {
  const suggestions: { hint: string; confidence: 'HIGH' | 'MEDIUM' | 'LOW' }[] = [];
  
  for (const { pattern, suggestedTemplateHint, confidence } of TEMPLATE_SUGGESTION_PATTERNS) {
    if (pattern.test(documentText)) {
      suggestions.push({ hint: suggestedTemplateHint, confidence });
    }
  }
  
  // Sort by confidence (HIGH first)
  const order = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  suggestions.sort((a, b) => order[a.confidence] - order[b.confidence]);
  
  return suggestions;
}
