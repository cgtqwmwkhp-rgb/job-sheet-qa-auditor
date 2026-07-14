import { describe, expect, it } from "vitest";
import { auditContextFromLocation } from "./errorTracking";

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
