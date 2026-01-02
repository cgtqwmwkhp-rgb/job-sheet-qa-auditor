/**
 * PII Redaction Utilities
 * Provides pattern-based redaction of personally identifiable information
 */

export interface RedactionRule {
  name: string;
  pattern: RegExp;
  replacement: string;
}

export interface RedactionOptions {
  rules?: RedactionRule[];
  preserveLength?: boolean;
  redactionChar?: string;
}

// Default PII patterns to redact
const DEFAULT_REDACTION_RULES: RedactionRule[] = [
  // Email addresses
  {
    name: 'email',
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/gi,
    replacement: '[EMAIL_REDACTED]',
  },
  // Phone numbers (various formats)
  {
    name: 'phone',
    pattern: /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}\b/g,
    replacement: '[PHONE_REDACTED]',
  },
  // UK phone numbers
  {
    name: 'uk_phone',
    pattern: /\b(?:0|\+44)\s?\d{2,4}\s?\d{3,4}\s?\d{3,4}\b/g,
    replacement: '[PHONE_REDACTED]',
  },
  // Social Security Numbers (US)
  {
    name: 'ssn',
    pattern: /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g,
    replacement: '[SSN_REDACTED]',
  },
  // National Insurance Numbers (UK)
  {
    name: 'nino',
    pattern: /\b[A-CEGHJ-PR-TW-Z]{2}\s?\d{2}\s?\d{2}\s?\d{2}\s?[A-D]\b/gi,
    replacement: '[NINO_REDACTED]',
  },
  // Credit card numbers
  {
    name: 'credit_card',
    pattern: /\b(?:\d{4}[-.\s]?){3}\d{4}\b/g,
    replacement: '[CARD_REDACTED]',
  },
  // IP addresses
  {
    name: 'ip_address',
    pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    replacement: '[IP_REDACTED]',
  },
  // Dates of birth (various formats)
  {
    name: 'dob',
    pattern: /\b(?:0?[1-9]|[12]\d|3[01])[-/.](?:0?[1-9]|1[0-2])[-/.](?:19|20)\d{2}\b/g,
    replacement: '[DOB_REDACTED]',
  },
  // Bank account numbers (generic)
  {
    name: 'bank_account',
    pattern: /\b\d{8,17}\b/g,
    replacement: '[ACCOUNT_REDACTED]',
  },
  // Names following common patterns (Mr/Mrs/Ms/Dr)
  {
    name: 'titled_name',
    pattern: /\b(?:Mr|Mrs|Ms|Miss|Dr|Prof)\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/g,
    replacement: '[NAME_REDACTED]',
  },
];

// Sensitive field names that should have their values redacted
const SENSITIVE_FIELD_NAMES = new Set([
  'password',
  'secret',
  'token',
  'apikey',
  'api_key',
  'authorization',
  'auth',
  'credential',
  'private_key',
  'privatekey',
  'ssn',
  'social_security',
  'credit_card',
  'card_number',
  'cvv',
  'pin',
  'dob',
  'date_of_birth',
  'birthdate',
  'national_insurance',
  'nino',
]);

/**
 * Redact PII from a string
 */
export function redactString(
  input: string,
  options: RedactionOptions = {}
): string {
  const rules = options.rules || DEFAULT_REDACTION_RULES;
  let result = input;

  for (const rule of rules) {
    result = result.replace(rule.pattern, rule.replacement);
  }

  return result;
}

/**
 * Check if a field name is sensitive
 */
export function isSensitiveField(fieldName: string): boolean {
  const normalized = fieldName.toLowerCase().replace(/[-_\s]/g, '');
  return SENSITIVE_FIELD_NAMES.has(normalized) ||
    Array.from(SENSITIVE_FIELD_NAMES).some(sensitive => 
      normalized.includes(sensitive)
    );
}

/**
 * Redact sensitive values from an object (deep)
 */
export function redactObject<T extends Record<string, unknown>>(
  obj: T,
  options: RedactionOptions = {}
): T {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => {
      if (typeof item === 'object' && item !== null) {
        return redactObject(item as Record<string, unknown>, options);
      }
      if (typeof item === 'string') {
        return redactString(item, options);
      }
      return item;
    }) as unknown as T;
  }

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (isSensitiveField(key)) {
      result[key] = '[REDACTED]';
    } else if (typeof value === 'string') {
      result[key] = redactString(value, options);
    } else if (typeof value === 'object' && value !== null) {
      result[key] = redactObject(value as Record<string, unknown>, options);
    } else {
      result[key] = value;
    }
  }

  return result as T;
}

/**
 * Create a redacted copy of extracted text for logging
 */
export function redactExtractedText(text: string): string {
  return redactString(text);
}

/**
 * Redact PII from audit findings before logging
 */
export function redactFindings(findings: unknown[]): unknown[] {
  return findings.map(finding => {
    if (typeof finding === 'object' && finding !== null) {
      const f = finding as Record<string, unknown>;
      return {
        ...f,
        rawSnippet: typeof f.rawSnippet === 'string' 
          ? redactString(f.rawSnippet) 
          : f.rawSnippet,
        normalisedSnippet: typeof f.normalisedSnippet === 'string'
          ? redactString(f.normalisedSnippet)
          : f.normalisedSnippet,
      };
    }
    return finding;
  });
}

/**
 * Safe JSON stringify with PII redaction
 */
export function safeStringify(
  obj: unknown,
  options: RedactionOptions = {}
): string {
  if (typeof obj === 'object' && obj !== null) {
    return JSON.stringify(redactObject(obj as Record<string, unknown>, options));
  }
  if (typeof obj === 'string') {
    return redactString(obj, options);
  }
  return String(obj);
}
