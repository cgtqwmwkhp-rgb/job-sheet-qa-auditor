/**
 * Error Tracking and Logging
 *
 * Centralized client error tracking. When a Sentry DSN is configured
 * (build-time VITE_SENTRY_DSN or runtime via system.health), production
 * errors are reported with user / route / audit context. Missing DSN
 * fails soft — console-only, never throws.
 */

import type { ErrorInfo } from "react";
import * as Sentry from "@sentry/react";

export interface ErrorContext {
  user?: {
    id: number;
    email?: string;
    role: string;
  };
  route?: string;
  component?: string;
  action?: string;
  /** Job sheet id from /audits?id=… (primary audit workspace key). */
  auditId?: number;
  jobSheetId?: number;
  metadata?: Record<string, unknown>;
}

type SentryInitState = "idle" | "initializing" | "ready" | "disabled";

let sentryState: SentryInitState = "idle";
let baseContext: Partial<ErrorContext> = {};
let warnedMissingDsn = false;

const REDACTED = "[REDACTED]";
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const SENSITIVE_FIELD_PATTERN =
  /email|phone|mobile|(?:first|last|contact)[_-]?name|(?:^|[_-])name(?:$|[_-])|address|postcode|postal|dob|birth|ssn|national|passport|token|password|secret|cookie|authorization/i;

function redactString(value: string): string {
  return value.replace(EMAIL_PATTERN, REDACTED);
}

function redactTelemetryValue(
  value: unknown,
  seen = new WeakSet<object>()
): unknown {
  if (typeof value === "string") return redactString(value);
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return REDACTED;
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map(item => redactTelemetryValue(item, seen));
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [
      key,
      SENSITIVE_FIELD_PATTERN.test(key)
        ? REDACTED
        : redactTelemetryValue(nestedValue, seen),
    ])
  );
}

/**
 * Remove PII from error context before it crosses a telemetry boundary.
 * Keep the internal user id and role for triage, but never include email.
 */
export function redactErrorContext(context: ErrorContext): ErrorContext {
  const { email: _email, ...safeUser } = context.user ?? {};
  const safeMetadata = redactTelemetryValue(context.metadata) as
    | Record<string, unknown>
    | undefined;

  return {
    ...context,
    user: context.user ? (safeUser as ErrorContext["user"]) : undefined,
    metadata: safeMetadata,
  };
}

function readBuildTimeDsn(): string | undefined {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (typeof dsn !== "string" || !dsn.trim()) return undefined;
  // Guard unsubstituted deploy templates (same pattern as analytics.ts)
  if (dsn.includes("%") || dsn.includes("${")) return undefined;
  return dsn.trim();
}

function readEnvironment(): string {
  const fromEnv = import.meta.env.VITE_SENTRY_ENVIRONMENT;
  if (typeof fromEnv === "string" && fromEnv.trim()) return fromEnv.trim();
  return import.meta.env.MODE || "production";
}

function readRelease(): string | undefined {
  const fromEnv = import.meta.env.VITE_SENTRY_RELEASE;
  if (typeof fromEnv === "string" && fromEnv.trim()) return fromEnv.trim();
  return undefined;
}

/**
 * Extract audit / job-sheet identifiers from the current URL.
 * Audit workspace uses `/audits?id=<jobSheetId>`.
 */
export function auditContextFromLocation(
  href: string = typeof window !== "undefined" ? window.location.href : ""
): Pick<ErrorContext, "route" | "auditId" | "jobSheetId"> {
  if (!href) return {};
  try {
    const url = new URL(href, "http://local");
    const route = url.pathname;
    const rawId =
      url.searchParams.get("id") ||
      url.searchParams.get("jobSheetId") ||
      url.searchParams.get("auditId");
    const parsed = rawId ? Number.parseInt(rawId, 10) : NaN;
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return { route };
    }
    // /audits?id=N is the job-sheet id; keep auditId alias for challenge bar.
    return { route, jobSheetId: parsed, auditId: parsed };
  } catch {
    return {};
  }
}

function mergeContext(context?: Partial<ErrorContext>): ErrorContext {
  const fromLocation = auditContextFromLocation();
  return {
    ...fromLocation,
    ...baseContext,
    ...context,
    route:
      context?.route ||
      baseContext.route ||
      fromLocation.route ||
      (typeof window !== "undefined" ? window.location.pathname : undefined),
    metadata: {
      ...fromLocation,
      ...baseContext.metadata,
      ...context?.metadata,
    },
  };
}

function applyUserContext(user?: ErrorContext["user"]) {
  if (!user || sentryState !== "ready") return;
  Sentry.setUser({
    id: String(user.id),
  });
  Sentry.setTag("user.role", user.role);
}

function captureToSentry(
  error: Error,
  context: ErrorContext,
  extras?: Record<string, unknown>
) {
  if (sentryState !== "ready") return;
  const safeContext = redactErrorContext(context);
  const safeExtras = redactTelemetryValue(extras) as
    | Record<string, unknown>
    | undefined;
  const safeError = new Error(redactString(error.message));
  safeError.name = error.name;
  safeError.stack = error.stack ? redactString(error.stack) : undefined;

  Sentry.withScope(scope => {
    if (safeContext.user) {
      scope.setUser({
        id: String(safeContext.user.id),
      });
      scope.setTag("user.role", safeContext.user.role);
    }

    if (safeContext.route) scope.setTag("route", safeContext.route);
    if (safeContext.component) scope.setTag("component", safeContext.component);
    if (safeContext.action) scope.setTag("action", safeContext.action);
    if (safeContext.auditId != null) {
      scope.setTag("auditId", String(safeContext.auditId));
      scope.setContext("audit", {
        auditId: safeContext.auditId,
        jobSheetId: safeContext.jobSheetId ?? safeContext.auditId,
      });
    } else if (safeContext.jobSheetId != null) {
      scope.setTag("jobSheetId", String(safeContext.jobSheetId));
      scope.setContext("audit", { jobSheetId: safeContext.jobSheetId });
    }

    if (safeContext.metadata || safeExtras) {
      scope.setContext("app", { ...safeContext.metadata, ...safeExtras });
    }

    Sentry.captureException(safeError);
  });
}

function warnMissingDsnOnce() {
  if (warnedMissingDsn || !import.meta.env.PROD) return;
  warnedMissingDsn = true;
  console.info(
    "[ErrorTracking] Sentry DSN not configured — errors stay console-only. Set VITE_SENTRY_DSN (build) or SENTRY_CLIENT_DSN (runtime)."
  );
}

/**
 * Initialize the Sentry browser client. Safe to call multiple times;
 * no-ops when DSN is missing or already ready.
 */
export function initSentry(dsn?: string): boolean {
  if (sentryState === "ready") return true;
  if (sentryState === "disabled") return false;

  const resolved = (dsn || readBuildTimeDsn())?.trim();
  if (!resolved) {
    sentryState = "disabled";
    warnMissingDsnOnce();
    return false;
  }

  try {
    sentryState = "initializing";
    Sentry.init({
      dsn: resolved,
      environment: readEnvironment(),
      release: readRelease(),
      // Keep noise down; we primarily report explicit exceptions.
      tracesSampleRate: 0,
      // Defense in depth for automatic Sentry events and future call sites.
      beforeSend(event) {
        return redactTelemetryValue(event) as typeof event;
      },
    });
    sentryState = "ready";
    applyUserContext(baseContext.user);
    return true;
  } catch (err) {
    sentryState = "disabled";
    console.warn(
      "[ErrorTracking] Sentry init failed — continuing without telemetry",
      err
    );
    return false;
  }
}

/**
 * Fetch runtime DSN from system.health (Container App env, no rebuild).
 * Fail soft on any network/parse error.
 */
async function resolveRuntimeDsn(): Promise<string | undefined> {
  try {
    const response = await fetch(
      `/api/trpc/system.health?input=${encodeURIComponent(JSON.stringify({ json: { timestamp: Date.now() } }))}`,
      {
        credentials: "include",
        headers: { Accept: "application/json" },
      }
    );
    if (!response.ok) return undefined;
    const data = await response.json();
    const config =
      data?.result?.data?.json?.config ?? data?.result?.data?.config;
    const dsn = config?.sentryDsn;
    if (typeof dsn === "string" && dsn.trim() && !dsn.includes("%")) {
      return dsn.trim();
    }
  } catch {
    // fail soft
  }
  return undefined;
}

/**
 * Log an error to the console and external tracking service
 */
export function logError(error: Error, context?: ErrorContext) {
  const merged = mergeContext(context);
  const safeContext = redactErrorContext(merged);

  console.error("[Error]", {
    message: redactString(error.message),
    stack: error.stack ? redactString(error.stack) : undefined,
    context: safeContext,
    timestamp: new Date().toISOString(),
  });

  if (import.meta.env.PROD) {
    captureToSentry(error, merged);
  }
}

/**
 * Log a React error boundary catch
 */
export function logBoundaryError(
  error: Error,
  errorInfo: ErrorInfo,
  context?: ErrorContext
) {
  const merged = mergeContext(context);
  const safeContext = redactErrorContext(merged);

  console.error("[ErrorBoundary]", {
    error: redactString(error.message),
    componentStack: errorInfo.componentStack,
    context: safeContext,
    timestamp: new Date().toISOString(),
  });

  if (import.meta.env.PROD) {
    captureToSentry(error, merged, {
      componentStack: errorInfo.componentStack,
    });
  }
}

/**
 * Log an unhandled promise rejection
 */
export function logUnhandledRejection(reason: unknown, context?: ErrorContext) {
  const error = reason instanceof Error ? reason : new Error(String(reason));
  const merged = mergeContext(context);
  const safeContext = redactErrorContext(merged);

  console.error("[UnhandledRejection]", {
    reason: redactString(String(reason)),
    error: redactString(error.message),
    context: safeContext,
    timestamp: new Date().toISOString(),
  });

  if (import.meta.env.PROD) {
    captureToSentry(error, merged, { unhandledRejection: true });
  }
}

/**
 * Initialize global error handlers and (when configured) Sentry.
 */
export function initializeErrorTracking(context?: Partial<ErrorContext>) {
  if (context) {
    baseContext = { ...baseContext, ...context };
    applyUserContext(baseContext.user);
  }

  // Build-time DSN first (local / image baked with VITE_SENTRY_DSN)
  if (sentryState === "idle") {
    const buildDsn = readBuildTimeDsn();
    if (buildDsn) {
      initSentry(buildDsn);
    } else {
      // Runtime DSN from Container App env via system.health — fail soft
      void resolveRuntimeDsn().then(dsn => {
        if (dsn) {
          initSentry(dsn);
          applyUserContext(baseContext.user);
        } else if (sentryState === "idle") {
          sentryState = "disabled";
          warnMissingDsnOnce();
        }
      });
    }
  } else if (sentryState === "ready") {
    applyUserContext(baseContext.user);
  }

  // Avoid duplicate listeners if AuthContext remounts with a new user
  if ((initializeErrorTracking as unknown as { _bound?: boolean })._bound) {
    return;
  }
  (initializeErrorTracking as unknown as { _bound?: boolean })._bound = true;

  window.addEventListener("unhandledrejection", event => {
    logUnhandledRejection(event.reason, {
      ...baseContext,
      ...auditContextFromLocation(),
    });
  });

  window.addEventListener("error", event => {
    logError(event.error || new Error(event.message), {
      ...baseContext,
      ...auditContextFromLocation(),
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
  return mergeContext({
    component,
    ...additionalContext,
  });
}

/**
 * Wrap an async function with error tracking
 */
export function withErrorTracking<
  T extends (...args: never[]) => Promise<unknown>,
>(fn: T, context?: ErrorContext): T {
  return (async (...args: Parameters<T>) => {
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
  error: unknown,
  context?: Partial<ErrorContext>
) {
  const err =
    error instanceof Error
      ? error
      : new Error(
          typeof error === "object" &&
          error &&
          "message" in error &&
          typeof (error as { message: unknown }).message === "string"
            ? (error as { message: string }).message
            : String(error)
        );
  const merged = mergeContext({
    ...context,
    action: context?.action || "api",
    metadata: {
      ...context?.metadata,
      endpoint,
      status:
        typeof error === "object" && error && "status" in error
          ? (error as { status: unknown }).status
          : undefined,
    },
  });
  const safeContext = redactErrorContext(merged);

  console.error("[API Error]", {
    endpoint: redactString(endpoint),
    error: redactString(err.message),
    status: safeContext.metadata?.status,
    context: safeContext,
    timestamp: new Date().toISOString(),
  });

  if (import.meta.env.PROD) {
    captureToSentry(err, merged, { api: true, endpoint });
  }
}

/** Test / diagnostics helper — do not use in UI. */
export function getErrorTrackingStatus(): SentryInitState {
  return sentryState;
}
