/**
 * Request/Response Logging Middleware
 * Provides structured logging with correlation IDs and PII redaction
 */

import { createRequestContext, runWithContext, getCorrelationId, getElapsedMs } from './context';
import { redactObject } from './piiRedaction';

export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  correlationId?: string;
  requestId?: string;
  userId?: number;
  method?: string;
  path?: string;
  statusCode?: number;
  durationMs?: number;
  message: string;
  data?: Record<string, unknown>;
}

export interface LoggerOptions {
  redactPII?: boolean;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  includeBody?: boolean;
  maxBodyLength?: number;
}

const DEFAULT_OPTIONS: LoggerOptions = {
  redactPII: true,
  logLevel: 'info',
  includeBody: false,
  maxBodyLength: 1000,
};

// Log level hierarchy
const LOG_LEVELS: Record<string, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let currentLogLevel = LOG_LEVELS.info;

/**
 * Set the minimum log level
 */
export function setLogLevel(level: 'debug' | 'info' | 'warn' | 'error'): void {
  currentLogLevel = LOG_LEVELS[level];
}

/**
 * Check if a log level should be output
 */
function shouldLog(level: string): boolean {
  return LOG_LEVELS[level] >= currentLogLevel;
}

/**
 * Format a log entry as JSON
 */
function formatLogEntry(entry: LogEntry): string {
  return JSON.stringify(entry);
}

/**
 * Create a structured log entry
 */
function createLogEntry(
  level: LogEntry['level'],
  message: string,
  data?: Record<string, unknown>,
  options: LoggerOptions = {}
): LogEntry {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    correlationId: getCorrelationId(),
    message,
  };

  if (data) {
    entry.data = opts.redactPII ? redactObject(data) : data;
  }

  return entry;
}

/**
 * Log an info message
 */
export function logInfo(message: string, data?: Record<string, unknown>, options?: LoggerOptions): void {
  if (!shouldLog('info')) return;
  const entry = createLogEntry('info', message, data, options);
  console.log(formatLogEntry(entry));
}

/**
 * Log a warning message
 */
export function logWarn(message: string, data?: Record<string, unknown>, options?: LoggerOptions): void {
  if (!shouldLog('warn')) return;
  const entry = createLogEntry('warn', message, data, options);
  console.warn(formatLogEntry(entry));
}

/**
 * Log an error message
 */
export function logError(message: string, data?: Record<string, unknown>, options?: LoggerOptions): void {
  if (!shouldLog('error')) return;
  const entry = createLogEntry('error', message, data, options);
  console.error(formatLogEntry(entry));
}

/**
 * Log a debug message
 */
export function logDebug(message: string, data?: Record<string, unknown>, options?: LoggerOptions): void {
  if (!shouldLog('debug')) return;
  const entry = createLogEntry('debug', message, data, options);
  console.debug(formatLogEntry(entry));
}

/**
 * Log request start
 */
export function logRequestStart(method: string, path: string, userId?: number): void {
  logInfo('Request started', {
    method,
    path,
    userId,
  });
}

/**
 * Log request completion
 */
export function logRequestComplete(
  method: string,
  path: string,
  statusCode: number,
  userId?: number
): void {
  const durationMs = getElapsedMs();
  
  const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
  
  const entry = createLogEntry(level, 'Request completed', {
    method,
    path,
    statusCode,
    durationMs,
    userId,
  });
  
  entry.statusCode = statusCode;
  entry.durationMs = durationMs;
  
  if (level === 'error') {
    console.error(formatLogEntry(entry));
  } else if (level === 'warn') {
    console.warn(formatLogEntry(entry));
  } else {
    console.log(formatLogEntry(entry));
  }
}

/**
 * Log an API call to external service
 */
export function logExternalCall(
  service: string,
  operation: string,
  durationMs: number,
  success: boolean,
  error?: string
): void {
  const level = success ? 'info' : 'error';
  const entry = createLogEntry(level, `External call: ${service}`, {
    service,
    operation,
    durationMs,
    success,
    error,
  });
  
  if (success) {
    console.log(formatLogEntry(entry));
  } else {
    console.error(formatLogEntry(entry));
  }
}

/**
 * Log an audit event
 */
export function logAuditEvent(
  action: string,
  resourceType: string,
  resourceId: string | number,
  userId?: number,
  details?: Record<string, unknown>
): void {
  logInfo(`Audit: ${action}`, {
    action,
    resourceType,
    resourceId,
    userId,
    ...details,
  });
}

/**
 * Create a child logger with preset context
 */
export function createLogger(context: Record<string, unknown>) {
  return {
    info: (message: string, data?: Record<string, unknown>) => 
      logInfo(message, { ...context, ...data }),
    warn: (message: string, data?: Record<string, unknown>) => 
      logWarn(message, { ...context, ...data }),
    error: (message: string, data?: Record<string, unknown>) => 
      logError(message, { ...context, ...data }),
    debug: (message: string, data?: Record<string, unknown>) => 
      logDebug(message, { ...context, ...data }),
  };
}

/**
 * Middleware wrapper for tRPC procedures
 */
export function withRequestLogging<T>(
  procedureName: string,
  fn: () => Promise<T>
): Promise<T> {
  const context = createRequestContext();
  
  return runWithContext(context, async () => {
    const startTime = Date.now();
    
    logInfo(`Procedure started: ${procedureName}`);
    
    try {
      const result = await fn();
      
      logInfo(`Procedure completed: ${procedureName}`, {
        durationMs: Date.now() - startTime,
        success: true,
      });
      
      return result;
    } catch (error) {
      logError(`Procedure failed: ${procedureName}`, {
        durationMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      throw error;
    }
  });
}
