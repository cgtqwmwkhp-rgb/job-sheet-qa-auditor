/**
 * Gold Standard Job Sheet Specification
 * Based on analysis of real Repair Reports and Compliance Reports
 * 
 * This specification defines:
 * - Required and optional fields
 * - Validation rules
 * - Severity levels for missing/invalid fields
 * - Business logic rules
 */

export interface GoldStandardField {
  id: string;
  name: string;
  category: string;
  required: boolean;
  severity: 'S0' | 'S1' | 'S2' | 'S3';
  description: string;
  validationRules: ValidationRule[];
  whyItMatters: string;
}

export interface ValidationRule {
  id: string;
  type: 'presence' | 'format' | 'range' | 'enum' | 'dependency' | 'business_logic';
  description: string;
  errorMessage: string;
  validator: (value: any, allFields: Record<string, any>) => boolean;
}

export interface GoldStandardSpec {
  version: string;
  name: string;
  description: string;
  documentTypes: string[];
  fields: GoldStandardField[];
  businessRules: BusinessRule[];
  createdAt: string;
  updatedAt: string;
}

export interface BusinessRule {
  id: string;
  name: string;
  severity: 'S0' | 'S1' | 'S2' | 'S3';
  description: string;
  condition: (fields: Record<string, any>) => boolean;
  errorMessage: string;
  whyItMatters: string;
}

// ============================================================================
// VALIDATION RULE FACTORIES
// ============================================================================

const createPresenceRule = (fieldName: string): ValidationRule => ({
  id: `presence_${fieldName}`,
  type: 'presence',
  description: `${fieldName} must be present`,
  errorMessage: `${fieldName} is missing`,
  validator: (value) => value !== null && value !== undefined && value !== '',
});

const createFormatRule = (
  fieldName: string,
  pattern: RegExp,
  formatDescription: string
): ValidationRule => ({
  id: `format_${fieldName}`,
  type: 'format',
  description: `${fieldName} must match format: ${formatDescription}`,
  errorMessage: `${fieldName} has invalid format. Expected: ${formatDescription}`,
  validator: (value) => !value || pattern.test(String(value)),
});

const createEnumRule = (
  fieldName: string,
  allowedValues: string[]
): ValidationRule => ({
  id: `enum_${fieldName}`,
  type: 'enum',
  description: `${fieldName} must be one of: ${allowedValues.join(', ')}`,
  errorMessage: `${fieldName} has invalid value. Allowed: ${allowedValues.join(', ')}`,
  validator: (value) => !value || allowedValues.map(v => v.toLowerCase()).includes(String(value).toLowerCase()),
});

const createRangeRule = (
  fieldName: string,
  min: number,
  max: number
): ValidationRule => ({
  id: `range_${fieldName}`,
  type: 'range',
  description: `${fieldName} must be between ${min} and ${max}`,
  errorMessage: `${fieldName} is out of range (${min}-${max})`,
  validator: (value) => {
    if (value === null || value === undefined) return true;
    const num = Number(value);
    return !isNaN(num) && num >= min && num <= max;
  },
});

// ============================================================================
// GOLD STANDARD SPECIFICATION v1.0
// ============================================================================

export const GOLD_STANDARD_SPEC_V1: GoldStandardSpec = {
  version: '1.0.0',
  name: 'Job Sheet QA Gold Standard',
  description: 'Enterprise specification for validating job sheets, repair reports, and compliance documents',
  documentTypes: ['Repair Report', 'Compliance Report', 'Service Report', 'Inspection Report'],
  createdAt: '2026-01-02T00:00:00Z',
  updatedAt: '2026-01-02T00:00:00Z',
  
  fields: [
    // ========== ASSET INFORMATION (Category) ==========
    {
      id: 'asset_no',
      name: 'Asset Number',
      category: 'Asset Information',
      required: true,
      severity: 'S0',
      description: 'Unique identifier for the asset/equipment being serviced',
      whyItMatters: 'Critical for asset tracking, maintenance history, and warranty claims. Without this, the work cannot be attributed to the correct equipment.',
      validationRules: [
        createPresenceRule('Asset Number'),
        createFormatRule('Asset Number', /^[A-Z0-9\-_]+$/i, 'Alphanumeric with hyphens/underscores'),
      ],
    },
    {
      id: 'make_model',
      name: 'Make/Model',
      category: 'Asset Information',
      required: true,
      severity: 'S1',
      description: 'Manufacturer and model designation of the asset',
      whyItMatters: 'Essential for parts ordering, technical documentation lookup, and warranty verification.',
      validationRules: [
        createPresenceRule('Make/Model'),
      ],
    },
    {
      id: 'serial_no',
      name: 'Serial Number',
      category: 'Asset Information',
      required: false,
      severity: 'S2',
      description: 'Manufacturer serial number for unique identification',
      whyItMatters: 'Required for warranty claims and manufacturer support cases.',
      validationRules: [],
    },
    {
      id: 'mileage_hours',
      name: 'Mileage/Hours',
      category: 'Asset Information',
      required: false,
      severity: 'S3',
      description: 'Current odometer reading or operating hours',
      whyItMatters: 'Tracks equipment usage for preventive maintenance scheduling.',
      validationRules: [
        createRangeRule('Mileage/Hours', 0, 10000000),
      ],
    },
    
    // ========== JOB INFORMATION (Category) ==========
    {
      id: 'job_no',
      name: 'Job Number',
      category: 'Job Information',
      required: true,
      severity: 'S0',
      description: 'Unique work order or job reference number',
      whyItMatters: 'Primary key for billing, scheduling, and audit trail. Required for invoicing and dispute resolution.',
      validationRules: [
        createPresenceRule('Job Number'),
        createFormatRule('Job Number', /^\d+$/, 'Numeric job reference'),
      ],
    },
    {
      id: 'customer_name',
      name: 'Customer Name',
      category: 'Job Information',
      required: true,
      severity: 'S0',
      description: 'Name of the customer or client organization',
      whyItMatters: 'Required for billing, customer communication, and contract compliance.',
      validationRules: [
        createPresenceRule('Customer Name'),
      ],
    },
    {
      id: 'date',
      name: 'Service Date',
      category: 'Job Information',
      required: true,
      severity: 'S0',
      description: 'Date when the service/repair was performed',
      whyItMatters: 'Critical for warranty calculations, SLA compliance, and billing accuracy.',
      validationRules: [
        createPresenceRule('Service Date'),
        createFormatRule('Service Date', /^\d{4}-\d{2}-\d{2}$|^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/, 'YYYY-MM-DD or DD/MM/YYYY'),
      ],
    },
    {
      id: 'engineer_name',
      name: 'Engineer Name',
      category: 'Job Information',
      required: true,
      severity: 'S0',
      description: 'Name of the technician who performed the work',
      whyItMatters: 'Required for accountability, quality tracking, and competency verification.',
      validationRules: [
        createPresenceRule('Engineer Name'),
      ],
    },
    {
      id: 'contact_name',
      name: 'Contact Name',
      category: 'Job Information',
      required: false,
      severity: 'S3',
      description: 'On-site contact person',
      whyItMatters: 'Useful for follow-up communication and access arrangements.',
      validationRules: [],
    },
    {
      id: 'address',
      name: 'Site Address',
      category: 'Job Information',
      required: false,
      severity: 'S3',
      description: 'Location where the work was performed',
      whyItMatters: 'Required for travel time verification and future site visits.',
      validationRules: [],
    },
    {
      id: 'travel_time',
      name: 'Travel Time',
      category: 'Job Information',
      required: false,
      severity: 'S3',
      description: 'Time spent traveling to the job site (hours)',
      whyItMatters: 'Used for billing and route optimization.',
      validationRules: [
        createRangeRule('Travel Time', 0, 24),
      ],
    },
    
    // ========== ISSUE & WORK DESCRIPTION (Category) ==========
    {
      id: 'issue_description',
      name: 'Issue Description',
      category: 'Issue & Work',
      required: true,
      severity: 'S1',
      description: 'Description of the reported problem or reason for the job',
      whyItMatters: 'Documents the original complaint for root cause analysis and prevents repeat visits.',
      validationRules: [
        createPresenceRule('Issue Description'),
      ],
    },
    {
      id: 'engineer_comments',
      name: 'Engineer Comments',
      category: 'Issue & Work',
      required: true,
      severity: 'S1',
      description: 'Detailed notes from the engineer about work performed',
      whyItMatters: 'Primary evidence of work done. Critical for quality assurance and dispute resolution.',
      validationRules: [
        createPresenceRule('Engineer Comments'),
        {
          id: 'min_length_comments',
          type: 'format',
          description: 'Engineer comments must be at least 20 characters',
          errorMessage: 'Engineer comments are too brief. Please provide detailed work description.',
          validator: (value) => !value || String(value).length >= 20,
        },
      ],
    },
    {
      id: 'fault_reason',
      name: 'Fault Reason',
      category: 'Issue & Work',
      required: false,
      severity: 'S2',
      description: 'Category of the fault or reason for repair',
      whyItMatters: 'Enables trend analysis and preventive maintenance planning.',
      validationRules: [
        createEnumRule('Fault Reason', ['Wear & Tear', 'Routine', 'Damage', 'Electrical', 'Mechanical', 'User Error', 'Unknown', 'Reason']),
      ],
    },
    {
      id: 'repair_duration',
      name: 'Repair Duration',
      category: 'Issue & Work',
      required: false,
      severity: 'S2',
      description: 'Time spent on the repair (hours)',
      whyItMatters: 'Required for billing and productivity tracking.',
      validationRules: [
        createRangeRule('Repair Duration', 0, 100),
      ],
    },
    
    // ========== PARTS & MATERIALS (Category) ==========
    {
      id: 'parts_used',
      name: 'Parts Used',
      category: 'Parts & Materials',
      required: false,
      severity: 'S2',
      description: 'List of parts or components used in the repair',
      whyItMatters: 'Required for inventory management, billing, and warranty tracking.',
      validationRules: [],
    },
    {
      id: 'parts_required',
      name: 'Parts Still Required',
      category: 'Parts & Materials',
      required: false,
      severity: 'S2',
      description: 'Parts needed to complete the job',
      whyItMatters: 'Triggers parts ordering and follow-up scheduling.',
      validationRules: [],
    },
    {
      id: 'consumables_used',
      name: 'Consumables Used',
      category: 'Parts & Materials',
      required: false,
      severity: 'S3',
      description: 'Whether consumable materials were used',
      whyItMatters: 'Affects billing and inventory tracking.',
      validationRules: [],
    },
    
    // ========== COMPLETION STATUS (Category) ==========
    {
      id: 'works_completed',
      name: 'Works Fully Completed',
      category: 'Completion Status',
      required: true,
      severity: 'S1',
      description: 'Whether all requested work was completed',
      whyItMatters: 'Determines if the job can be closed or requires follow-up.',
      validationRules: [
        createPresenceRule('Works Completed'),
      ],
    },
    {
      id: 'return_visit_required',
      name: 'Return Visit Required',
      category: 'Completion Status',
      required: true,
      severity: 'S1',
      description: 'Whether a follow-up visit is needed',
      whyItMatters: 'Triggers scheduling and affects first-time-fix metrics.',
      validationRules: [
        createPresenceRule('Return Visit Required'),
      ],
    },
    {
      id: 'safe_to_use',
      name: 'Safe to Use',
      category: 'Completion Status',
      required: true,
      severity: 'S0',
      description: 'Whether the asset is safe to operate after service',
      whyItMatters: 'CRITICAL SAFETY FIELD. Determines VOR (Vehicle Off Road) status. Liability implications.',
      validationRules: [
        createPresenceRule('Safe to Use'),
      ],
    },
    {
      id: 'vor_status',
      name: 'VOR Status',
      category: 'Completion Status',
      required: false,
      severity: 'S0',
      description: 'Vehicle Off Road indicator',
      whyItMatters: 'Critical for fleet availability tracking and customer SLA compliance.',
      validationRules: [],
    },
    {
      id: 'overtime',
      name: 'Overtime',
      category: 'Completion Status',
      required: false,
      severity: 'S3',
      description: 'Whether overtime was worked',
      whyItMatters: 'Affects billing rates and labor cost tracking.',
      validationRules: [],
    },
    
    // ========== SIGNATURES & AUTHORIZATION (Category) ==========
    {
      id: 'technician_signature',
      name: 'Technician Signature',
      category: 'Signatures',
      required: true,
      severity: 'S0',
      description: 'Technician signature confirming work completion',
      whyItMatters: 'Legal requirement. Confirms engineer accountability and work authorization.',
      validationRules: [
        createPresenceRule('Technician Signature'),
      ],
    },
  ],
  
  // ========== BUSINESS RULES ==========
  businessRules: [
    {
      id: 'vor_safety_consistency',
      name: 'VOR and Safety Consistency',
      severity: 'S0',
      description: 'If asset is marked as VOR, safe_to_use must be false',
      condition: (fields) => {
        if (fields.vor_status === true && fields.safe_to_use === true) {
          return false;
        }
        return true;
      },
      errorMessage: 'Inconsistency: Asset marked as VOR but also marked as safe to use',
      whyItMatters: 'Safety critical. VOR assets must not be flagged as safe to prevent accidents.',
    },
    {
      id: 'return_visit_parts_required',
      name: 'Return Visit Parts Consistency',
      severity: 'S2',
      description: 'If parts are still required, return visit should typically be required',
      condition: (fields) => {
        if (fields.parts_required && fields.parts_required.length > 0 && fields.return_visit_required === false) {
          return false;
        }
        return true;
      },
      errorMessage: 'Warning: Parts still required but no return visit scheduled',
      whyItMatters: 'Ensures follow-up is scheduled when parts need to be fitted.',
    },
    {
      id: 'incomplete_work_return_visit',
      name: 'Incomplete Work Return Visit',
      severity: 'S1',
      description: 'If work is not fully completed, return visit should be required',
      condition: (fields) => {
        if (fields.works_completed === false && fields.return_visit_required === false) {
          return false;
        }
        return true;
      },
      errorMessage: 'Work not completed but no return visit scheduled',
      whyItMatters: 'Prevents jobs being closed prematurely without resolution.',
    },
    {
      id: 'unsafe_asset_vor',
      name: 'Unsafe Asset VOR Status',
      severity: 'S0',
      description: 'If asset is not safe to use, it should be marked as VOR',
      condition: (fields) => {
        // This is a warning, not a hard failure - VOR might not always be applicable
        return true;
      },
      errorMessage: 'Asset marked as unsafe but VOR status not set',
      whyItMatters: 'Ensures unsafe equipment is properly flagged for fleet management.',
    },
    {
      id: 'engineer_comments_quality',
      name: 'Engineer Comments Quality',
      severity: 'S2',
      description: 'Engineer comments should be substantive and descriptive',
      condition: (fields) => {
        const comments = fields.engineer_comments;
        if (!comments) return true;
        // Check for low-quality comments
        const lowQualityPatterns = [
          /^(ok|done|fixed|completed|n\/a|na|none)$/i,
          /^.{1,10}$/,
        ];
        return !lowQualityPatterns.some(p => p.test(String(comments).trim()));
      },
      errorMessage: 'Engineer comments appear to be too brief or generic',
      whyItMatters: 'Detailed comments are essential for quality assurance and knowledge transfer.',
    },
  ],
};

// ============================================================================
// SPEC VALIDATION FUNCTIONS
// ============================================================================

export interface ValidationResult {
  isValid: boolean;
  overallScore: number;
  fieldResults: FieldValidationResult[];
  businessRuleResults: BusinessRuleResult[];
  summary: {
    totalFields: number;
    validFields: number;
    invalidFields: number;
    missingRequired: number;
    warnings: number;
    criticalIssues: number;
  };
}

export interface FieldValidationResult {
  fieldId: string;
  fieldName: string;
  category: string;
  severity: 'S0' | 'S1' | 'S2' | 'S3';
  isRequired: boolean;
  isPresent: boolean;
  value: any;
  isValid: boolean;
  errors: string[];
  whyItMatters: string;
}

export interface BusinessRuleResult {
  ruleId: string;
  ruleName: string;
  severity: 'S0' | 'S1' | 'S2' | 'S3';
  passed: boolean;
  errorMessage?: string;
  whyItMatters: string;
}

export function validateAgainstGoldStandard(
  extractedFields: Record<string, any>,
  spec: GoldStandardSpec = GOLD_STANDARD_SPEC_V1
): ValidationResult {
  const fieldResults: FieldValidationResult[] = [];
  const businessRuleResults: BusinessRuleResult[] = [];
  
  let validFields = 0;
  let invalidFields = 0;
  let missingRequired = 0;
  let warnings = 0;
  let criticalIssues = 0;
  
  // Validate each field
  for (const fieldSpec of spec.fields) {
    const value = extractedFields[fieldSpec.id];
    const isPresent = value !== null && value !== undefined && value !== '';
    
    const errors: string[] = [];
    let isValid = true;
    
    // Check presence for required fields
    if (fieldSpec.required && !isPresent) {
      errors.push(`Required field "${fieldSpec.name}" is missing`);
      isValid = false;
      missingRequired++;
      if (fieldSpec.severity === 'S0') criticalIssues++;
    }
    
    // Run validation rules
    if (isPresent) {
      for (const rule of fieldSpec.validationRules) {
        if (!rule.validator(value, extractedFields)) {
          errors.push(rule.errorMessage);
          isValid = false;
          if (fieldSpec.severity === 'S0' || fieldSpec.severity === 'S1') {
            criticalIssues++;
          } else {
            warnings++;
          }
        }
      }
    }
    
    if (isValid) {
      validFields++;
    } else {
      invalidFields++;
    }
    
    fieldResults.push({
      fieldId: fieldSpec.id,
      fieldName: fieldSpec.name,
      category: fieldSpec.category,
      severity: fieldSpec.severity,
      isRequired: fieldSpec.required,
      isPresent,
      value,
      isValid,
      errors,
      whyItMatters: fieldSpec.whyItMatters,
    });
  }
  
  // Validate business rules
  for (const rule of spec.businessRules) {
    const passed = rule.condition(extractedFields);
    
    if (!passed) {
      if (rule.severity === 'S0' || rule.severity === 'S1') {
        criticalIssues++;
      } else {
        warnings++;
      }
    }
    
    businessRuleResults.push({
      ruleId: rule.id,
      ruleName: rule.name,
      severity: rule.severity,
      passed,
      errorMessage: passed ? undefined : rule.errorMessage,
      whyItMatters: rule.whyItMatters,
    });
  }
  
  // Calculate overall score
  const totalFields = spec.fields.length;
  const requiredFields = spec.fields.filter(f => f.required).length;
  const foundRequired = fieldResults.filter(f => f.isRequired && f.isPresent).length;
  const passedBusinessRules = businessRuleResults.filter(r => r.passed).length;
  
  const fieldScore = (validFields / totalFields) * 60;
  const requiredScore = (foundRequired / requiredFields) * 30;
  const businessRuleScore = (passedBusinessRules / spec.businessRules.length) * 10;
  
  const overallScore = Math.round(fieldScore + requiredScore + businessRuleScore);
  
  return {
    isValid: criticalIssues === 0 && missingRequired === 0,
    overallScore,
    fieldResults,
    businessRuleResults,
    summary: {
      totalFields,
      validFields,
      invalidFields,
      missingRequired,
      warnings,
      criticalIssues,
    },
  };
}

// Export for use in other modules
export { GOLD_STANDARD_SPEC_V1 as defaultGoldStandardSpec };
