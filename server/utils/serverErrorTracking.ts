import * as Sentry from "@sentry/node";
import type { ErrorRequestHandler } from "express";
import { getCorrelationId } from "./context";

export type ErrorTrackingMetadata = {
  boundary: "express" | "trpc" | "startup";
  correlationId?: string;
  method?: string;
  path?: string;
  procedure?: string;
  procedureType?: string;
};

type TrpcErrorLike = {
  code: string;
  cause?: unknown;
};

let sentryEnabled = false;

/**
 * Configure Sentry only when a server DSN is supplied. An absent or invalid
 * DSN leaves reporting disabled and must never prevent the application booting.
 */
export function initServerErrorTracking(dsn = process.env.SENTRY_DSN): boolean {
  if (sentryEnabled) {
    return true;
  }

  if (!dsn?.trim()) {
    return false;
  }

  try {
    Sentry.init({
      dsn: dsn.trim(),
      environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    });
    sentryEnabled = true;
    return true;
  } catch (error) {
    console.warn(
      "[ErrorTracking] Server Sentry init failed — continuing without telemetry",
      error
    );
    return false;
  }
}

/**
 * Report an unexpected server error without affecting request handling.
 */
export function captureServerException(
  error: unknown,
  metadata: ErrorTrackingMetadata
): boolean {
  if (!sentryEnabled) {
    return false;
  }

  try {
    Sentry.withScope(scope => {
      if (metadata.correlationId) {
        scope.setTag("correlationId", metadata.correlationId);
      }

      scope.setTag("error.boundary", metadata.boundary);
      scope.setContext("server_error", {
        ...metadata,
        correlationId: metadata.correlationId,
      });
      Sentry.captureException(error);
    });
    return true;
  } catch (captureError) {
    console.warn(
      "[ErrorTracking] Server Sentry capture failed — continuing request handling",
      captureError
    );
    return false;
  }
}

/**
 * tRPC invokes its error hook for expected client responses too. Only send
 * unexpected internal failures to Sentry.
 */
export function captureTrpcException(
  error: TrpcErrorLike,
  metadata: Omit<ErrorTrackingMetadata, "boundary">
): boolean {
  if (error.code !== "INTERNAL_SERVER_ERROR") {
    return false;
  }

  return captureServerException(error.cause ?? error, {
    ...metadata,
    boundary: "trpc",
  });
}

/**
 * Express error middleware that reports, then delegates to the existing
 * response/error handling path unchanged.
 */
export const captureExpressException: ErrorRequestHandler = (
  error,
  req,
  _res,
  next
) => {
  captureServerException(error, {
    boundary: "express",
    correlationId: getCorrelationId() ?? req.get("X-Correlation-ID")?.trim(),
    method: req.method,
    path: req.originalUrl,
  });
  next(error);
};
