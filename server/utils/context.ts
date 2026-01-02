/**
 * Request Context & Correlation ID Management
 * Provides tracing and context propagation for audit trail
 */

import { AsyncLocalStorage } from 'async_hooks';
import { v4 as uuidv4 } from 'uuid';

export interface RequestContext {
  correlationId: string;
  requestId: string;
  userId?: number;
  userRole?: string;
  startTime: number;
  path?: string;
  method?: string;
  metadata: Record<string, unknown>;
}

// AsyncLocalStorage for request-scoped context
const contextStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Generate a new correlation ID
 */
export function generateCorrelationId(): string {
  return `corr-${uuidv4()}`;
}

/**
 * Generate a new request ID
 */
export function generateRequestId(): string {
  return `req-${uuidv4()}`;
}

/**
 * Create a new request context
 */
export function createRequestContext(
  correlationId?: string,
  metadata: Record<string, unknown> = {}
): RequestContext {
  return {
    correlationId: correlationId || generateCorrelationId(),
    requestId: generateRequestId(),
    startTime: Date.now(),
    metadata,
  };
}

/**
 * Run a function within a request context
 */
export function runWithContext<T>(
  context: RequestContext,
  fn: () => T
): T {
  return contextStorage.run(context, fn);
}

/**
 * Get the current request context
 */
export function getContext(): RequestContext | undefined {
  return contextStorage.getStore();
}

/**
 * Get the current correlation ID
 */
export function getCorrelationId(): string | undefined {
  return getContext()?.correlationId;
}

/**
 * Get the current request ID
 */
export function getRequestId(): string | undefined {
  return getContext()?.requestId;
}

/**
 * Add metadata to the current context
 */
export function addContextMetadata(key: string, value: unknown): void {
  const context = getContext();
  if (context) {
    context.metadata[key] = value;
  }
}

/**
 * Set user info in the current context
 */
export function setContextUser(userId: number, role?: string): void {
  const context = getContext();
  if (context) {
    context.userId = userId;
    context.userRole = role;
  }
}

/**
 * Calculate elapsed time from context start
 */
export function getElapsedMs(): number {
  const context = getContext();
  return context ? Date.now() - context.startTime : 0;
}

/**
 * Create a child context (for async operations)
 */
export function createChildContext(
  additionalMetadata: Record<string, unknown> = {}
): RequestContext {
  const parent = getContext();
  return {
    correlationId: parent?.correlationId || generateCorrelationId(),
    requestId: generateRequestId(),
    userId: parent?.userId,
    userRole: parent?.userRole,
    startTime: Date.now(),
    metadata: { ...parent?.metadata, ...additionalMetadata },
  };
}

/**
 * Format context for logging
 */
export function formatContextForLog(): Record<string, unknown> {
  const context = getContext();
  if (!context) {
    return {};
  }

  return {
    correlationId: context.correlationId,
    requestId: context.requestId,
    userId: context.userId,
    elapsedMs: getElapsedMs(),
  };
}
