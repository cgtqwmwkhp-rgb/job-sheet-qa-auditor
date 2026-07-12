/**
 * Request Logging Middleware
 * 
 * Logs all incoming requests with timing, user info, and performance metrics.
 * Useful for debugging, monitoring, and security auditing.
 */

import type { Request, Response, NextFunction } from "express";

interface RequestLog {
  timestamp: string;
  method: string;
  path: string;
  userId?: number;
  userRole?: string;
  ip?: string;
  userAgent?: string;
  duration?: number;
  statusCode?: number;
  error?: string;
}

/**
 * Request logger middleware.
 * Logs all requests with timing and user context.
 * 
 * @example
 * app.use(requestLogger({ 
 *   logLevel: 'info',
 *   excludePaths: ['/health', '/metrics']
 * }));
 */
export function requestLogger(options: {
  logLevel?: "debug" | "info" | "warn" | "error";
  excludePaths?: string[];
  logBody?: boolean;
  logHeaders?: boolean;
} = {}) {
  const {
    logLevel = "info",
    excludePaths = ["/health", "/metrics", "/favicon.ico"],
    logBody = false,
    logHeaders = false,
  } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    // Skip excluded paths
    if (excludePaths.some((path) => req.path.startsWith(path))) {
      return next();
    }

    const startTime = Date.now();
    const log: RequestLog = {
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path,
      ip: req.ip || req.headers["x-forwarded-for"] as string,
      userAgent: req.headers["user-agent"],
    };

    // Extract user info from request if available
    if ((req as any).user) {
      const user = (req as any).user;
      log.userId = user.id;
      log.userRole = user.role;
    }

    // Add body/headers if requested (be careful with sensitive data!)
    const extraData: any = {};
    if (logBody && req.body && Object.keys(req.body).length > 0) {
      extraData.body = sanitizeLogData(req.body);
    }
    if (logHeaders) {
      extraData.headers = sanitizeHeaders(req.headers);
    }

    // Intercept response to log completion
    const originalSend = res.send;
    res.send = function (data: any) {
      res.send = originalSend; // Restore original
      
      const duration = Date.now() - startTime;
      log.duration = duration;
      log.statusCode = res.statusCode;

      // Determine log level based on status code
      let level = logLevel;
      if (res.statusCode >= 500) level = "error";
      else if (res.statusCode >= 400) level = "warn";
      else if (duration > 5000) level = "warn"; // Slow request

      // Log the request
      const message = `${log.method} ${log.path} ${log.statusCode} ${duration}ms${log.userId ? ` user:${log.userId}` : ""}`;
      
      switch (level) {
        case "error":
          console.error(`[RequestLogger] ${message}`, { ...log, ...extraData });
          break;
        case "warn":
          console.warn(`[RequestLogger] ${message}`, { ...log, ...extraData });
          break;
        case "debug":
          console.debug(`[RequestLogger] ${message}`, { ...log, ...extraData });
          break;
        default:
          console.log(`[RequestLogger] ${message}`, { ...log, ...extraData });
      }

      return originalSend.call(this, data);
    };

    next();
  };
}

/**
 * Sanitize request body for logging - remove sensitive fields.
 */
function sanitizeLogData(data: any): any {
  if (!data || typeof data !== "object") return data;

  const sensitiveFields = [
    "password",
    "token",
    "secret",
    "apiKey",
    "authorization",
    "creditCard",
    "ssn",
    "csrfToken",
  ];

  const sanitized: any = Array.isArray(data) ? [] : {};
  
  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    
    // Redact sensitive fields
    if (sensitiveFields.some((field) => lowerKey.includes(field))) {
      sanitized[key] = "[REDACTED]";
    }
    // Recursively sanitize nested objects
    else if (value && typeof value === "object") {
      sanitized[key] = sanitizeLogData(value);
    }
    // Truncate long strings
    else if (typeof value === "string" && value.length > 500) {
      sanitized[key] = value.substring(0, 500) + "...[TRUNCATED]";
    }
    else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Sanitize headers for logging - remove sensitive headers.
 */
function sanitizeHeaders(headers: any): any {
  const sanitized: any = {};
  const sensitiveHeaders = ["authorization", "cookie", "x-api-key"];

  for (const [key, value] of Object.entries(headers)) {
    if (sensitiveHeaders.includes(key.toLowerCase())) {
      sanitized[key] = "[REDACTED]";
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Error logging middleware.
 * Logs unhandled errors with full context.
 */
export function errorLogger() {
  return (err: Error, req: Request, res: Response, next: NextFunction) => {
    const log = {
      timestamp: new Date().toISOString(),
      error: err.message,
      stack: err.stack,
      method: req.method,
      path: req.path,
      userId: (req as any).user?.id,
      ip: req.ip,
    };

    console.error("[ErrorLogger] Unhandled error:", log);

    // Pass to next error handler
    next(err);
  };
}

/**
 * Performance monitoring middleware.
 * Tracks slow requests and logs warnings.
 */
export function performanceMonitor(thresholdMs: number = 3000) {
  return (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();

    res.on("finish", () => {
      const duration = Date.now() - startTime;
      
      if (duration > thresholdMs) {
        console.warn(
          `[PerformanceMonitor] Slow request detected: ${req.method} ${req.path} took ${duration}ms`,
          {
            threshold: thresholdMs,
            userId: (req as any).user?.id,
            statusCode: res.statusCode,
          }
        );
      }
    });

    next();
  };
}
