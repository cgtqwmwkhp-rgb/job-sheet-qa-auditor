/**
 * Safe Logger - PII-aware logging utility
 * 
 * CRITICAL: This logger MUST be used for all external service integrations
 * to prevent accidental logging of OCR text, PII, or sensitive content.
 * 
 * Features:
 * - Automatic PII redaction
 * - OCR text filtering (never logs raw extracted text)
 * - Structured JSON output
 * - Correlation ID tracking
 */

import { getCorrelationId } from './context';
import { redactObject } from './piiRedaction';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface SafeLogEntry {
  timestamp: string;
  level: LogLevel;
  correlationId?: string;
  service: string;
  message: string;
  data?: Record<string, unknown>;
}

/**
 * Fields that should NEVER be logged (contain raw OCR/document text)
 */
const FORBIDDEN_FIELDS = new Set([
  'markdown',
  'rawText',
  'ocrText',
  'extractedText',
  'documentContent',
  'pageContent',
  'base64',
  'base64Data',
  'documentData',
]);

/**
 * Fields that should be truncated if too long
 */
const TRUNCATE_FIELDS = new Set([
  'prompt',
  'response',
  'error',
  'errorText',
]);

const MAX_FIELD_LENGTH = 500;

/**
 * Sanitize data object for safe logging
 * - Removes forbidden fields (OCR text, raw content)
 * - Truncates long fields
 * - Redacts PII
 */
function sanitizeForLogging(data: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(data)) {
    // Skip forbidden fields entirely
    if (FORBIDDEN_FIELDS.has(key)) {
      sanitized[key] = '[REDACTED - OCR/DOCUMENT CONTENT]';
      continue;
    }
    
    // Handle nested objects
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      sanitized[key] = sanitizeForLogging(value as Record<string, unknown>);
      continue;
    }
    
    // Handle arrays
    if (Array.isArray(value)) {
      sanitized[key] = value.map(item => {
        if (item && typeof item === 'object') {
          return sanitizeForLogging(item as Record<string, unknown>);
        }
        return item;
      });
      continue;
    }
    
    // Truncate long string fields
    if (typeof value === 'string' && TRUNCATE_FIELDS.has(key) && value.length > MAX_FIELD_LENGTH) {
      sanitized[key] = value.substring(0, MAX_FIELD_LENGTH) + `... [truncated, ${value.length} chars total]`;
      continue;
    }
    
    sanitized[key] = value;
  }
  
  // Apply PII redaction as final step
  return redactObject(sanitized);
}

/**
 * Create a safe log entry
 */
function createSafeLogEntry(
  level: LogLevel,
  service: string,
  message: string,
  data?: Record<string, unknown>
): SafeLogEntry {
  const entry: SafeLogEntry = {
    timestamp: new Date().toISOString(),
    level,
    correlationId: getCorrelationId(),
    service,
    message,
  };
  
  if (data) {
    entry.data = sanitizeForLogging(data);
  }
  
  return entry;
}

/**
 * Format log entry as JSON string
 */
function formatEntry(entry: SafeLogEntry): string {
  return JSON.stringify(entry);
}

/**
 * Safe logger instance for a specific service
 */
export interface SafeLogger {
  debug: (message: string, data?: Record<string, unknown>) => void;
  info: (message: string, data?: Record<string, unknown>) => void;
  warn: (message: string, data?: Record<string, unknown>) => void;
  error: (message: string, data?: Record<string, unknown>) => void;
}

/**
 * Create a safe logger for a specific service
 * 
 * @example
 * const logger = createSafeLogger('MistralOCR');
 * logger.info('Processing document', { documentId: 123, pageCount: 5 });
 * // OCR text will be automatically redacted
 */
export function createSafeLogger(service: string): SafeLogger {
  return {
    debug: (message: string, data?: Record<string, unknown>) => {
      if (process.env.LOG_LEVEL === 'debug') {
        console.debug(formatEntry(createSafeLogEntry('debug', service, message, data)));
      }
    },
    info: (message: string, data?: Record<string, unknown>) => {
      console.log(formatEntry(createSafeLogEntry('info', service, message, data)));
    },
    warn: (message: string, data?: Record<string, unknown>) => {
      console.warn(formatEntry(createSafeLogEntry('warn', service, message, data)));
    },
    error: (message: string, data?: Record<string, unknown>) => {
      console.error(formatEntry(createSafeLogEntry('error', service, message, data)));
    },
  };
}

/**
 * Verify that a data object is safe to log (for testing)
 * Returns list of unsafe fields if any found
 */
export function checkLoggingSafety(data: Record<string, unknown>): string[] {
  const unsafeFields: string[] = [];
  
  function checkObject(obj: Record<string, unknown>, path: string = '') {
    for (const [key, value] of Object.entries(obj)) {
      const fullPath = path ? `${path}.${key}` : key;
      
      if (FORBIDDEN_FIELDS.has(key)) {
        // Check if the value looks like actual content (not already redacted)
        if (typeof value === 'string' && !value.includes('[REDACTED')) {
          unsafeFields.push(fullPath);
        }
      }
      
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        checkObject(value as Record<string, unknown>, fullPath);
      }
      
      if (Array.isArray(value)) {
        value.forEach((item, index) => {
          if (item && typeof item === 'object') {
            checkObject(item as Record<string, unknown>, `${fullPath}[${index}]`);
          }
        });
      }
    }
  }
  
  checkObject(data);
  return unsafeFields;
}
