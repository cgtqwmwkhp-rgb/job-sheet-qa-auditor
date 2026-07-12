/**
 * Object-level auth must honour job_sheets.uploadedBy (schema field name).
 */

import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import {
  enforceJobSheetAccess,
  resolveResourceOwnerId,
} from "../../utils/authorization";

describe("resolveResourceOwnerId", () => {
  it("reads uploadedBy from job sheet schema shape", () => {
    expect(resolveResourceOwnerId({ uploadedBy: 42 })).toBe(42);
    expect(resolveResourceOwnerId({ uploadedById: 7 })).toBe(7);
    expect(resolveResourceOwnerId({ createdById: 3, uploadedBy: 9 })).toBe(3);
  });
});

describe("enforceJobSheetAccess", () => {
  it("allows qa_lead for any sheet", () => {
    expect(() =>
      enforceJobSheetAccess({ uploadedBy: 99 }, { id: 1, role: "qa_lead" })
    ).not.toThrow();
  });

  it("allows owner via uploadedBy", () => {
    expect(() =>
      enforceJobSheetAccess({ uploadedBy: 5 }, { id: 5, role: "user" })
    ).not.toThrow();
  });

  it("denies non-owner viewer", () => {
    expect(() =>
      enforceJobSheetAccess({ uploadedBy: 5 }, { id: 8, role: "user" })
    ).toThrow(TRPCError);
  });
});

describe("filterJobSheetsByAccess", () => {
  it("uses uploadedBy for ownership filtering", async () => {
    const { filterJobSheetsByAccess } = await import(
      "../../utils/authorization"
    );
    const rows = [
      { id: 1, uploadedBy: 5 },
      { id: 2, uploadedBy: 8 },
    ];
    expect(filterJobSheetsByAccess(rows, { id: 5, role: "user" })).toEqual([
      rows[0],
    ]);
    expect(filterJobSheetsByAccess(rows, { id: 1, role: "qa_lead" })).toEqual(
      rows
    );
  });
});
