/**
 * Gold Standard Specification Validator
 * Validates spec JSON against a strict schema before saving
 */

export interface ValidationError {
  path: string;
  message: string;
  value?: unknown;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

// JSON Schema for Gold Standard Specification
const GOLD_SPEC_SCHEMA = {
  type: 'object',
  required: ['name', 'version', 'rules'],
  properties: {
    name: {
      type: 'string',
      minLength: 1,
      maxLength: 200,
      description: 'Human-readable name for the specification',
    },
    version: {
      type: 'string',
      pattern: '^\\d+\\.\\d+\\.\\d+$',
      description: 'Semantic version (e.g., 1.0.0)',
    },
    description: {
      type: 'string',
      maxLength: 1000,
    },
    effectiveDate: {
      type: 'string',
      format: 'date-time',
    },
    expiryDate: {
      type: 'string',
      format: 'date-time',
    },
    rules: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['id', 'field', 'type', 'required', 'description'],
        properties: {
          id: {
            type: 'string',
            pattern: '^[A-Z]+-\\d{3}$',
            description: 'Rule ID (e.g., R-001)',
          },
          field: {
            type: 'string',
            minLength: 1,
            maxLength: 100,
          },
          type: {
            type: 'string',
            enum: ['presence', 'format', 'regex', 'range', 'enum'],
          },
          required: {
            type: 'boolean',
          },
          description: {
            type: 'string',
            minLength: 1,
            maxLength: 500,
          },
          pattern: {
            type: 'string',
            description: 'Regex pattern for type=regex',
          },
          format: {
            type: 'string',
            description: 'Format string for type=format',
          },
          minValue: {
            type: 'number',
            description: 'Minimum value for type=range',
          },
          maxValue: {
            type: 'number',
            description: 'Maximum value for type=range',
          },
          allowedValues: {
            type: 'array',
            items: { type: 'string' },
            description: 'Allowed values for type=enum',
          },
          severity: {
            type: 'string',
            enum: ['S0', 'S1', 'S2', 'S3'],
            description: 'Default severity for violations',
          },
        },
      },
    },
    metadata: {
      type: 'object',
      properties: {
        author: { type: 'string' },
        approvedBy: { type: 'string' },
        approvalDate: { type: 'string', format: 'date-time' },
        tags: { type: 'array', items: { type: 'string' } },
      },
    },
  },
};

/**
 * Validate a value against a type
 */
function validateType(value: unknown, expectedType: string): boolean {
  switch (expectedType) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && !isNaN(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'array':
      return Array.isArray(value);
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    default:
      return true;
  }
}

/**
 * Validate a string against a regex pattern
 */
function validatePattern(value: string, pattern: string): boolean {
  try {
    const regex = new RegExp(pattern);
    return regex.test(value);
  } catch {
    return false;
  }
}

/**
 * Validate a date-time string
 */
function isValidDateTime(value: string): boolean {
  const date = new Date(value);
  return !isNaN(date.getTime());
}

/**
 * Validate a Gold Standard specification
 */
export function validateGoldSpec(spec: unknown): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // Check if spec is an object
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
    errors.push({
      path: '$',
      message: 'Specification must be a JSON object',
      value: typeof spec,
    });
    return { valid: false, errors, warnings };
  }

  const specObj = spec as Record<string, unknown>;

  // Validate required fields
  for (const field of GOLD_SPEC_SCHEMA.required) {
    if (!(field in specObj)) {
      errors.push({
        path: `$.${field}`,
        message: `Required field '${field}' is missing`,
      });
    }
  }

  // Validate name
  if ('name' in specObj) {
    if (typeof specObj.name !== 'string') {
      errors.push({
        path: '$.name',
        message: 'Name must be a string',
        value: typeof specObj.name,
      });
    } else {
      if (specObj.name.length === 0) {
        errors.push({
          path: '$.name',
          message: 'Name cannot be empty',
        });
      }
      if (specObj.name.length > 200) {
        errors.push({
          path: '$.name',
          message: 'Name cannot exceed 200 characters',
          value: specObj.name.length,
        });
      }
    }
  }

  // Validate version
  if ('version' in specObj) {
    if (typeof specObj.version !== 'string') {
      errors.push({
        path: '$.version',
        message: 'Version must be a string',
        value: typeof specObj.version,
      });
    } else if (!validatePattern(specObj.version, '^\\d+\\.\\d+\\.\\d+$')) {
      errors.push({
        path: '$.version',
        message: 'Version must follow semantic versioning (e.g., 1.0.0)',
        value: specObj.version,
      });
    }
  }

  // Validate effectiveDate
  if ('effectiveDate' in specObj && specObj.effectiveDate) {
    if (typeof specObj.effectiveDate !== 'string' || !isValidDateTime(specObj.effectiveDate)) {
      errors.push({
        path: '$.effectiveDate',
        message: 'effectiveDate must be a valid ISO 8601 date-time',
        value: specObj.effectiveDate,
      });
    }
  }

  // Validate expiryDate
  if ('expiryDate' in specObj && specObj.expiryDate) {
    if (typeof specObj.expiryDate !== 'string' || !isValidDateTime(specObj.expiryDate)) {
      errors.push({
        path: '$.expiryDate',
        message: 'expiryDate must be a valid ISO 8601 date-time',
        value: specObj.expiryDate,
      });
    }
  }

  // Validate rules array
  if ('rules' in specObj) {
    if (!Array.isArray(specObj.rules)) {
      errors.push({
        path: '$.rules',
        message: 'Rules must be an array',
        value: typeof specObj.rules,
      });
    } else {
      if (specObj.rules.length === 0) {
        errors.push({
          path: '$.rules',
          message: 'Rules array cannot be empty',
        });
      }

      const ruleIds = new Set<string>();

      specObj.rules.forEach((rule, index) => {
        const rulePath = `$.rules[${index}]`;
        
        if (!rule || typeof rule !== 'object' || Array.isArray(rule)) {
          errors.push({
            path: rulePath,
            message: 'Each rule must be an object',
          });
          return;
        }

        const ruleObj = rule as Record<string, unknown>;

        // Validate required rule fields
        const requiredRuleFields = ['id', 'field', 'type', 'required', 'description'];
        for (const field of requiredRuleFields) {
          if (!(field in ruleObj)) {
            errors.push({
              path: `${rulePath}.${field}`,
              message: `Required field '${field}' is missing in rule`,
            });
          }
        }

        // Validate rule ID format and uniqueness
        if ('id' in ruleObj) {
          if (typeof ruleObj.id !== 'string') {
            errors.push({
              path: `${rulePath}.id`,
              message: 'Rule ID must be a string',
            });
          } else {
            if (!validatePattern(ruleObj.id, '^[A-Z]+-\\d{3}$')) {
              warnings.push({
                path: `${rulePath}.id`,
                message: 'Rule ID should follow pattern X-NNN (e.g., R-001)',
                value: ruleObj.id,
              });
            }
            if (ruleIds.has(ruleObj.id)) {
              errors.push({
                path: `${rulePath}.id`,
                message: `Duplicate rule ID: ${ruleObj.id}`,
                value: ruleObj.id,
              });
            }
            ruleIds.add(ruleObj.id);
          }
        }

        // Validate rule type
        const validTypes = ['presence', 'format', 'regex', 'range', 'enum'];
        if ('type' in ruleObj && !validTypes.includes(ruleObj.type as string)) {
          errors.push({
            path: `${rulePath}.type`,
            message: `Invalid rule type. Must be one of: ${validTypes.join(', ')}`,
            value: ruleObj.type,
          });
        }

        // Validate type-specific fields
        if (ruleObj.type === 'regex' && !('pattern' in ruleObj)) {
          errors.push({
            path: `${rulePath}.pattern`,
            message: 'Pattern is required for regex type rules',
          });
        }

        if (ruleObj.type === 'regex' && 'pattern' in ruleObj) {
          try {
            new RegExp(ruleObj.pattern as string);
          } catch {
            errors.push({
              path: `${rulePath}.pattern`,
              message: 'Invalid regex pattern',
              value: ruleObj.pattern,
            });
          }
        }

        if (ruleObj.type === 'range') {
          if (!('minValue' in ruleObj) && !('maxValue' in ruleObj)) {
            errors.push({
              path: rulePath,
              message: 'Range type requires minValue and/or maxValue',
            });
          }
        }

        if (ruleObj.type === 'enum' && !('allowedValues' in ruleObj)) {
          errors.push({
            path: `${rulePath}.allowedValues`,
            message: 'allowedValues is required for enum type rules',
          });
        }

        // Validate severity if present
        if ('severity' in ruleObj) {
          const validSeverities = ['S0', 'S1', 'S2', 'S3'];
          if (!validSeverities.includes(ruleObj.severity as string)) {
            errors.push({
              path: `${rulePath}.severity`,
              message: `Invalid severity. Must be one of: ${validSeverities.join(', ')}`,
              value: ruleObj.severity,
            });
          }
        }
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate and sanitize a spec, returning cleaned version
 */
export function sanitizeGoldSpec(spec: unknown): { spec: unknown; result: ValidationResult } {
  const result = validateGoldSpec(spec);
  
  if (!result.valid) {
    return { spec: null, result };
  }

  // Return sanitized spec (could add more sanitization here)
  const specObj = spec as Record<string, unknown>;
  
  return {
    spec: {
      name: String(specObj.name).trim(),
      version: String(specObj.version).trim(),
      description: specObj.description ? String(specObj.description).trim() : undefined,
      effectiveDate: specObj.effectiveDate,
      expiryDate: specObj.expiryDate,
      rules: specObj.rules,
      metadata: specObj.metadata,
    },
    result,
  };
}

/**
 * Compare two spec versions and return differences
 */
export function diffSpecs(
  oldSpec: Record<string, unknown>,
  newSpec: Record<string, unknown>
): { added: string[]; removed: string[]; modified: string[] } {
  const added: string[] = [];
  const removed: string[] = [];
  const modified: string[] = [];

  const oldRules = (oldSpec.rules as Array<{ id: string }>) || [];
  const newRules = (newSpec.rules as Array<{ id: string }>) || [];

  const oldRuleIds = new Set(oldRules.map(r => r.id));
  const newRuleIds = new Set(newRules.map(r => r.id));

  // Find added rules
  Array.from(newRuleIds).forEach(id => {
    if (!oldRuleIds.has(id)) {
      added.push(id);
    }
  });

  // Find removed rules
  Array.from(oldRuleIds).forEach(id => {
    if (!newRuleIds.has(id)) {
      removed.push(id);
    }
  });

  // Find modified rules
  for (const newRule of newRules) {
    if (oldRuleIds.has(newRule.id)) {
      const oldRule = oldRules.find(r => r.id === newRule.id);
      if (JSON.stringify(oldRule) !== JSON.stringify(newRule)) {
        modified.push(newRule.id);
      }
    }
  }

  return { added, removed, modified };
}
