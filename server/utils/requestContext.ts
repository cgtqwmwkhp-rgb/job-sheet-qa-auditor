/**
 * Request Context and Correlation IDs
 * 
 * Adds correlation IDs to requests for debugging and tracing.
 * Helps track requests across the system and correlate logs.
 */

import { nanoid } from "nanoid";
import type { Request, Response, NextFunction } from "express";

/**
 * Request context stored in async local storage
 */
export interface RequestContext {
  requestId: string;
  userId?: number;
  userRole?: string;
  startTime: number;
  route?: string;
  method?: string;
}

/**
 * Generate a unique request ID
 */
export function generateRequestId(): string {
  return `req_${nanoid(16)}`;
}

/**
 * Express middleware to add request ID and context
 */
export function requestContextMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const requestId = generateRequestId();
  const startTime = Date.now();

  // Add request ID to request object
  (req as any).requestId = requestId;
  (req as any).startTime = startTime;

  // Add request ID to response headers for client-side correlation
  res.setHeader("X-Request-ID", requestId);

  // Log request start
  console.log(`[${requestId}] ${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get("user-agent"),
  });

  // Log request completion
  res.on("finish", () => {
    const duration = Date.now() - startTime;
    console.log(`[${requestId}] ${res.statusCode} ${duration}ms`);
  });

  next();
}

/**
 * Get request context from Express request
 */
export function getRequestContext(req: Request): RequestContext {
  return {
    requestId: (req as any).requestId || generateRequestId(),
    userId: (req as any).user?.id,
    userRole: (req as any).user?.role,
    startTime: (req as any).startTime || Date.now(),
    route: req.path,
    method: req.method,
  };
}

/**
 * Add request context to tRPC context
 */
export function enhanceTrpcContext(baseContext: any): any {
  const requestId = generateRequestId();
  const startTime = Date.now();

  return {
    ...baseContext,
    requestId,
    startTime,
    // Add correlation helpers
    log: (message: string, data?: any) => {
      console.log(`[${requestId}]`, message, data);
    },
    logError: (message: string, error?: any) => {
      console.error(`[${requestId}]`, message, error);
    },
  };
}

/**
 * Format log message with request context
 */
export function formatLogMessage(
  context: RequestContext,
  message: string,
  data?: any
): string {
  const parts = [`[${context.requestId}]`, message];
  
  if (context.userId) {
    parts.push(`userId=${context.userId}`);
  }
  
  if (data) {
    parts.push(JSON.stringify(data));
  }
  
  return parts.join(" ");
}

/**
 * Create a child logger with request context
 */
export function createContextLogger(context: RequestContext) {
  return {
    info: (message: string, data?: any) => {
      console.log(formatLogMessage(context, message, data));
    },
    warn: (message: string, data?: any) => {
      console.warn(formatLogMessage(context, message, data));
    },
    error: (message: string, error?: any) => {
      console.error(formatLogMessage(context, message, error));
    },
    debug: (message: string, data?: any) => {
      console.debug(formatLogMessage(context, message, data));
    },
  };
}

/**
 * Measure operation duration and log with context
 */
export async function measureOperation<T>(
  context: RequestContext,
  operationName: string,
  operation: () => Promise<T>
): Promise<T> {
  const startTime = Date.now();
  const logger = createContextLogger(context);
  
  logger.info(`${operationName} started`);
  
  try {
    const result = await operation();
    const duration = Date.now() - startTime;
    logger.info(`${operationName} completed`, { durationMs: duration });
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(`${operationName} failed`, { durationMs: duration, error });
    throw error;
  }
}

/**
 * Extract correlation ID from client request
 */
export function extractCorrelationId(req: Request): string | undefined {
  return req.get("X-Correlation-ID") || req.get("X-Request-ID");
}

/**
 * Propagate correlation ID to external services
 */
export function getCorrelationHeaders(requestId: string): Record<string, string> {
  return {
    "X-Correlation-ID": requestId,
    "X-Request-ID": requestId,
  };
}
