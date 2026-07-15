import type { Request, Response } from "express";
import { describe, expect, it } from "vitest";
import {
  correlationContextMiddleware,
  createRequestContext,
  getCorrelationId,
  runWithContext,
} from "../../utils/context";

describe("Correlation context contract", () => {
  it("propagates a supplied X-Correlation-ID through async work", async () => {
    await runWithContext(createRequestContext("corr-from-client"), async () => {
      await Promise.resolve();
      expect(getCorrelationId()).toBe("corr-from-client");
    });
  });

  it("mounts the supplied ID from HTTP requests and echoes it to callers", () => {
    const headers: Record<string, string> = {};
    const req = {
      method: "POST",
      originalUrl: "/api/trpc/jobSheets.process",
      get: (name: string) =>
        name === "X-Correlation-ID" ? "corr-ingest-process-audit" : undefined,
    } as unknown as Request;
    const res = {
      setHeader: (name: string, value: string) => {
        headers[name] = value;
      },
    } as unknown as Response;

    correlationContextMiddleware(req, res, () => {
      expect(getCorrelationId()).toBe("corr-ingest-process-audit");
    });

    expect(headers["X-Correlation-ID"]).toBe("corr-ingest-process-audit");
  });

  it("generates and exposes an ID when the client does not provide one", () => {
    const headers: Record<string, string> = {};
    const req = {
      method: "POST",
      originalUrl: "/api/ingest",
      get: () => undefined,
    } as unknown as Request;
    const res = {
      setHeader: (name: string, value: string) => {
        headers[name] = value;
      },
    } as unknown as Response;

    correlationContextMiddleware(req, res, () => {
      expect(getCorrelationId()).toMatch(/^corr-/);
    });

    expect(headers["X-Correlation-ID"]).toMatch(/^corr-/);
  });
});
