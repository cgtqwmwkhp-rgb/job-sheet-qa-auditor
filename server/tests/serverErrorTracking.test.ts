import type { Request, Response } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sentry = vi.hoisted(() => ({
  captureException: vi.fn(),
  init: vi.fn(),
  scope: {
    setContext: vi.fn(),
    setTag: vi.fn(),
  },
  withScope: vi.fn(),
}));

vi.mock("@sentry/node", () => ({
  captureException: sentry.captureException,
  init: sentry.init,
  withScope: (callback: (scope: typeof sentry.scope) => void) => {
    sentry.withScope(callback);
    callback(sentry.scope);
  },
}));

describe("server error tracking", () => {
  const originalDsn = process.env.SENTRY_DSN;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.SENTRY_DSN;
  });

  afterEach(() => {
    if (originalDsn === undefined) {
      delete process.env.SENTRY_DSN;
    } else {
      process.env.SENTRY_DSN = originalDsn;
    }
  });

  it("is an honest no-op when SENTRY_DSN is unset", async () => {
    const tracking = await import("../utils/serverErrorTracking");

    expect(tracking.initServerErrorTracking()).toBe(false);
    expect(
      tracking.captureServerException(new Error("not reported"), {
        boundary: "startup",
        correlationId: "corr-disabled",
      })
    ).toBe(false);
    expect(sentry.init).not.toHaveBeenCalled();
    expect(sentry.captureException).not.toHaveBeenCalled();
  });

  it("reports an exception with its correlation ID tag when configured", async () => {
    const tracking = await import("../utils/serverErrorTracking");
    const error = new Error("unexpected failure");

    expect(
      tracking.initServerErrorTracking(
        "https://examplePublicKey@o0.ingest.sentry.io/0"
      )
    ).toBe(true);
    expect(
      tracking.captureServerException(error, {
        boundary: "trpc",
        correlationId: "corr-trpc-123",
        procedure: "jobSheets.process",
      })
    ).toBe(true);

    expect(sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: "https://examplePublicKey@o0.ingest.sentry.io/0",
      })
    );
    expect(sentry.scope.setTag).toHaveBeenCalledWith(
      "correlationId",
      "corr-trpc-123"
    );
    expect(sentry.captureException).toHaveBeenCalledWith(error);
  });

  it("reports only unexpected tRPC failures", async () => {
    const tracking = await import("../utils/serverErrorTracking");
    tracking.initServerErrorTracking(
      "https://examplePublicKey@o0.ingest.sentry.io/0"
    );
    const unexpected = new Error("procedure failed");

    expect(
      tracking.captureTrpcException(
        { code: "INTERNAL_SERVER_ERROR", cause: unexpected },
        {
          correlationId: "corr-trpc-789",
          procedure: "jobSheets.process",
          procedureType: "mutation",
        }
      )
    ).toBe(true);
    expect(
      tracking.captureTrpcException(
        { code: "UNAUTHORIZED" },
        { correlationId: "corr-trpc-789" }
      )
    ).toBe(false);

    expect(sentry.captureException).toHaveBeenCalledTimes(1);
    expect(sentry.captureException).toHaveBeenCalledWith(unexpected);
  });

  it("observes Express errors without changing the response path", async () => {
    const tracking = await import("../utils/serverErrorTracking");
    tracking.initServerErrorTracking(
      "https://examplePublicKey@o0.ingest.sentry.io/0"
    );
    const next = vi.fn();
    const error = new Error("route failed");
    const req = {
      get: (name: string) =>
        name === "X-Correlation-ID" ? "corr-express-456" : undefined,
      method: "POST",
      originalUrl: "/api/ingest",
    } as unknown as Request;

    tracking.captureExpressException(error, req, {} as Response, next);

    expect(sentry.scope.setTag).toHaveBeenCalledWith(
      "correlationId",
      "corr-express-456"
    );
    expect(next).toHaveBeenCalledWith(error);
  });
});
