/**
 * Validation Service Implementation
 * 
 * Validates extracted fields against specification rules.
 * Produces deterministic validatedFields and findings.
 */

import type { ValidationRule, RuleStatus } from '../specResolver/types';
import type { ExtractedField } from '../extraction/types';
import type {
  ValidatedField,
  Finding,
  ValidationResult,
  ValidationArtifact,
} from './types';
import { getCorrelationId } from '../../utils/context';

const VALIDATION_VERSION = '1.0.0';

/**
 * PX-113: Known human-readable format tokens compiled to real regexes.
 *
 * Legacy/default spec rules store `pattern` as a display token (e.g.
 * "DD/MM/YYYY") rather than a regex source. Passing a token like that
 * straight into `new RegExp(...)` produces a literal-string matcher that
 * can never match real dates — it looks for the text "DD/MM/YYYY" itself.
 * Known tokens are compiled here; anything else falls back to being
 * treated as literal regex source (the pre-existing behavior for
 * `pattern`-type rules like `^SN-\d{5}-[A-Z]{2}$`).
 */
const KNOWN_FORMAT_TOKEN_PATTERNS: Record<string, RegExp> = {
  'DD/MM/YYYY': /^\d{1,2}\/\d{1,2}\/\d{4}$/,
  'MM/DD/YYYY': /^\d{1,2}\/\d{1,2}\/\d{4}$/,
  'DD-MM-YYYY': /^\d{1,2}-\d{1,2}-\d{4}$/,
  'MM-DD-YYYY': /^\d{1,2}-\d{1,2}-\d{4}$/,
  'YYYY-MM-DD': /^\d{4}-\d{2}-\d{2}$/,
  'YYYY/MM/DD': /^\d{4}\/\d{1,2}\/\d{1,2}$/,
  'HH:MM': /^([01]?\d|2[0-3]):[0-5]\d$/,
  'HH:MM:SS': /^([01]?\d|2[0-3]):[0-5]\d:[0-5]\d$/,
};

/**
 * Compile a rule `pattern` string into a RegExp.
 *
 * Known human-readable format tokens are compiled to their matching regex.
 * Anything else (e.g. an actual regex source like `^JOB-\d{6}$`) is
 * compiled as literal regex source, matching pre-existing behavior.
 */
function compileFormatPattern(pattern: string): RegExp {
  const knownToken = KNOWN_FORMAT_TOKEN_PATTERNS[pattern.trim().toUpperCase()];
  if (knownToken) return knownToken;
  return new RegExp(pattern);
}

/**
 * Custom validator registry
 */
const customValidators: Map<string, (value: any, param?: string) => boolean> = new Map([
  ['minLength', (value, param) => {
    const minLen = parseInt(param || '0', 10);
    return typeof value === 'string' && value.length >= minLen;
  }],
  ['maxLength', (value, param) => {
    const maxLen = parseInt(param || '0', 10);
    return typeof value === 'string' && value.length <= maxLen;
  }],
  ['notEmpty', (value) => {
    return value !== null && value !== undefined && value !== '';
  }],
]);

/**
 * Validate a single rule against extracted field
 */
function validateRule(
  rule: ValidationRule,
  extractedField: ExtractedField | undefined
): { status: RuleStatus; message?: string } {
  // Handle missing field
  if (!extractedField || extractedField.value === null || extractedField.value === undefined) {
    if (rule.type === 'required') {
      return {
        status: 'failed',
        message: `Required field '${rule.field}' is missing`,
      };
    }
    // Non-required rules skip if field is missing
    return { status: 'skipped', message: 'Field not present' };
  }
  
  const value = extractedField.value;
  
  switch (rule.type) {
    case 'required':
      // Field exists, so required passes
      if (value === '' || (typeof value === 'string' && value.trim() === '')) {
        return {
          status: 'failed',
          message: `Required field '${rule.field}' is empty`,
        };
      }
      return { status: 'passed' };
      
    case 'format':
    case 'pattern':
      if (rule.pattern) {
        try {
          const regex = compileFormatPattern(rule.pattern);
          const stringValue = String(value);
          if (regex.test(stringValue)) {
            return { status: 'passed' };
          }
          return {
            status: 'failed',
            message: `Field '${rule.field}' does not match expected format`,
          };
        } catch {
          return {
            status: 'error',
            message: `Invalid pattern in rule ${rule.ruleId}`,
          };
        }
      }
      return { status: 'passed' };
      
    case 'range':
      if (rule.range) {
        const numValue = typeof value === 'number' ? value : parseFloat(String(value));
        if (isNaN(numValue)) {
          return {
            status: 'failed',
            message: `Field '${rule.field}' is not a valid number`,
          };
        }
        
        if (rule.range.min !== undefined) {
          const min = typeof rule.range.min === 'number' 
            ? rule.range.min 
            : parseFloat(rule.range.min);
          if (numValue < min) {
            return {
              status: 'failed',
              message: `Field '${rule.field}' is below minimum value ${min}`,
            };
          }
        }
        
        if (rule.range.max !== undefined) {
          const max = typeof rule.range.max === 'number'
            ? rule.range.max
            : parseFloat(rule.range.max);
          if (numValue > max) {
            return {
              status: 'failed',
              message: `Field '${rule.field}' exceeds maximum value ${max}`,
            };
          }
        }
      }
      return { status: 'passed' };
      
    case 'custom':
      if (rule.customValidator) {
        const [validatorName, param] = rule.customValidator.split(':');
        const validator = customValidators.get(validatorName);
        
        if (!validator) {
          return {
            status: 'error',
            message: `Unknown custom validator: ${validatorName}`,
          };
        }
        
        if (validator(value, param)) {
          return { status: 'passed' };
        }
        return {
          status: 'failed',
          message: `Field '${rule.field}' failed custom validation: ${rule.customValidator}`,
        };
      }
      return { status: 'passed' };
      
    default:
      return { status: 'passed' };
  }
}

/**
 * Validate extracted fields against rules
 */
export function validateFields(
  extractedFields: Map<string, ExtractedField>,
  rules: ValidationRule[],
  specPackId: string,
  specPackVersion: string
): ValidationResult {
  const startTime = Date.now();
  const correlationId = getCorrelationId();
  
  const validatedFields: ValidatedField[] = [];
  const findings: Finding[] = [];
  
  // Summary counters
  let passedRules = 0;
  let failedRules = 0;
  let skippedRules = 0;
  let criticalFailures = 0;
  let majorFailures = 0;
  let minorFailures = 0;
  let infoFailures = 0;
  
  // Process rules in deterministic order (already sorted by ruleId)
  for (const rule of rules) {
    if (!rule.enabled) {
      skippedRules++;
      validatedFields.push({
        ruleId: rule.ruleId,
        field: rule.field,
        status: 'skipped',
        severity: rule.severity,
        message: 'Rule disabled',
      });
      continue;
    }
    
    const extractedField = extractedFields.get(rule.field);
    const { status, message } = validateRule(rule, extractedField);
    
    // Create validated field entry
    const validatedField: ValidatedField = {
      ruleId: rule.ruleId,
      field: rule.field,
      status,
      value: extractedField?.value ?? null,
      confidence: extractedField?.confidence,
      pageNumber: extractedField?.pageNumber,
      severity: rule.severity,
      message,
    };
    
    validatedFields.push(validatedField);
    
    // Update counters
    switch (status) {
      case 'passed':
        passedRules++;
        break;
      case 'failed':
        failedRules++;
        // Create finding
        findings.push({
          ruleId: rule.ruleId,
          field: rule.field,
          status: 'failed',
          severity: rule.severity,
          message: message || rule.description,
          actualValue: extractedField?.value ?? null,
          expectedValue: rule.pattern,
          pageNumber: extractedField?.pageNumber,
        });
        // Count by severity
        switch (rule.severity) {
          case 'critical': criticalFailures++; break;
          case 'major': majorFailures++; break;
          case 'minor': minorFailures++; break;
          case 'info': infoFailures++; break;
        }
        break;
      case 'skipped':
        skippedRules++;
        break;
      case 'error':
        failedRules++;
        break;
    }
  }
  
  const processingTimeMs = Date.now() - startTime;
  
  // Overall pass: no critical or major failures
  const passed = criticalFailures === 0 && majorFailures === 0;
  
  return {
    passed,
    validatedFields,
    findings,
    summary: {
      totalRules: rules.length,
      passedRules,
      failedRules,
      skippedRules,
      criticalFailures,
      majorFailures,
      minorFailures,
      infoFailures,
    },
    metadata: {
      processingTimeMs,
      validationVersion: VALIDATION_VERSION,
      specPackId,
      specPackVersion,
    },
    correlationId,
  };
}

/**
 * Generate validation artifact for persistence
 */
export function generateValidationArtifact(
  result: ValidationResult,
  documentId?: string
): ValidationArtifact {
  return {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    correlationId: result.correlationId,
    documentId,
    passed: result.passed,
    validatedFields: result.validatedFields,
    findings: result.findings,
    summary: result.summary,
    metadata: result.metadata,
  };
}

/**
 * Register a custom validator
 */
export function registerCustomValidator(
  name: string,
  validator: (value: any, param?: string) => boolean
): void {
  customValidators.set(name, validator);
}
