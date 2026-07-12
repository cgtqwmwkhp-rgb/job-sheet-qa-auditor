/**
 * Error Tracking and Logging
 *
 * Centralized error tracking for the application.
 * In production, this would integrate with services like Sentry, LogRocket, etc.
 */

export interface ErrorContext {
  user?: {
    id: number;
    email?: string;
    role: string;
  };
  route?: string;
  component?: string;
  action?: string;
  metadata?: Record<string, any>;
}

/**
 * Log an error to the console and external tracking service
 */
export function logError(error: Error, context?: ErrorContext) {
  // Always log to console in development
  console.error("[Error]", {
    message: error.message,
    stack: error.stack,
    context,
    timestamp: new Date().toISOString(),
  });

  // In production, send to error tracking service
  if (import.meta.env.PROD) {
    // TODO: Integrate with Sentry, LogRocket, or similar
    // Example:
    // Sentry.captureException(error, {
    //   contexts: { custom: context },
    // });
  }
}

/**
 * Log a React error boundary catch
 */
export function logBoundaryError(
  error: Error,
  errorInfo: React.ErrorInfo,
  context?: ErrorContext
) {
  console.error("[ErrorBoundary]", {
    error: error.message,
    componentStack: errorInfo.componentStack,
    context,
    timestamp: new Date().toISOString(),
  });

  if (import.meta.env.PROD) {
    // TODO: Send to error tracking with component stack
    // Sentry.captureException(error, {
    //   contexts: {
    //     react: { componentStack: errorInfo.componentStack },
    //     custom: context,
    //   },
    // });
  }
}

/**
 * Log an unhandled promise rejection
 */
export function logUnhandledRejection(reason: any, context?: ErrorContext) {
  const error = reason instanceof Error ? reason : new Error(String(reason));

  console.error("[UnhandledRejection]", {
    reason: String(reason),
    error: error.message,
    context,
    timestamp: new Date().toISOString(),
  });

  if (import.meta.env.PROD) {
    // TODO: Send to error tracking
  }
}

/**
 * Initialize global error handlers
 */
export function initializeErrorTracking(context?: Partial<ErrorContext>) {
  // Handle unhandled promise rejections
  window.addEventListener("unhandledrejection", event => {
    logUnhandledRejection(event.reason, {
      ...context,
      route: window.location.pathname,
    });
  });

  // Handle global errors
  window.addEventListener("error", event => {
    logError(event.error || new Error(event.message), {
      ...context,
      route: window.location.pathname,
      metadata: {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      },
    });
  });
}

/**
 * Create error context from current app state
 */
export function createErrorContext(
  component: string,
  additionalContext?: Partial<ErrorContext>
): ErrorContext {
  return {
    component,
    route: window.location.pathname,
    ...additionalContext,
  };
}

/**
 * Wrap an async function with error tracking
 */
export function withErrorTracking<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  context?: ErrorContext
): T {
  return (async (...args: any[]) => {
    try {
      return await fn(...args);
    } catch (error) {
      if (error instanceof Error) {
        logError(error, context);
      }
      throw error;
    }
  }) as T;
}

/**
 * Track API errors separately
 */
export function logApiError(
  endpoint: string,
  error: any,
  context?: Partial<ErrorContext>
) {
  console.error("[API Error]", {
    endpoint,
    error: error?.message || String(error),
    status: error?.status,
    data: error?.data,
    context,
    timestamp: new Date().toISOString(),
  });

  if (import.meta.env.PROD) {
    // TODO: Send to error tracking with API-specific tags
  }
}
