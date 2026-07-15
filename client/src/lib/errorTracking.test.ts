import { describe, expect, it, vi } from "vitest";
import {
  auditContextFromLocation,
  logError,
  redactErrorContext,
} from "./errorTracking";

describe("auditContextFromLocation", () => {
  it("extracts job sheet / audit id from /audits?id=", () => {
    expect(
      auditContextFromLocation("https://app.example/audits?id=42")
    ).toEqual({
      route: "/audits",
      jobSheetId: 42,
      auditId: 42,
    });
  });

  it("accepts jobSheetId / auditId query aliases", () => {
    expect(
      auditContextFromLocation("https://app.example/hold-queue?jobSheetId=7")
    ).toMatchObject({ route: "/hold-queue", jobSheetId: 7, auditId: 7 });
    expect(
      auditContextFromLocation("https://app.example/x?auditId=9")
    ).toMatchObject({ auditId: 9, jobSheetId: 9 });
  });

  it("returns route only when no audit id is present", () => {
    expect(auditContextFromLocation("https://app.example/settings")).toEqual({
      route: "/settings",
    });
  });

  it("ignores invalid ids", () => {
    expect(
      auditContextFromLocation("https://app.example/audits?id=abc")
    ).toEqual({
      route: "/audits",
    });
  });
});

describe("telemetry PII redaction", () => {
  it("removes PII from contexts, error messages, and console output", () => {
    const context = {
      user: {
        id: 17,
        email: "alice@example.com",
        role: "auditor",
      },
      metadata: {
        reporterEmail: "reporter@example.com",
        phone: "+44 7700 900123",
        nested: {
          contactName: "Alice Example",
          note: "Contact alice@example.com for details",
        },
      },
    };
    const safeContext = redactErrorContext(context);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    logError(new Error("Failed for alice@example.com"), context);

    expect(safeContext).toEqual({
      user: { id: 17, role: "auditor" },
      metadata: {
        reporterEmail: "[REDACTED]",
        phone: "[REDACTED]",
        nested: {
          contactName: "[REDACTED]",
          note: "Contact [REDACTED] for details",
        },
      },
    });
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(
      "alice@example.com"
    );
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(
      "reporter@example.com"
    );
    consoleError.mockRestore();
  });
});
