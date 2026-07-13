import { describe, it, expect } from "vitest";
import { roiDraftEquals } from "../../../client/src/lib/roiDraftEquals";

describe("roiDraftEquals — Template Studio #185 guard", () => {
  const sample = {
    regions: [
      {
        name: "jobReference",
        page: 1,
        bounds: { x: 0.05, y: 0.1, width: 0.4, height: 0.05 },
      },
    ],
  };

  it("treats identical ROI drafts as equal (skip setState)", () => {
    expect(roiDraftEquals(sample, { ...sample, regions: [...sample.regions] })).toBe(
      true
    );
    expect(
      roiDraftEquals(sample, {
        regions: [
          {
            name: "jobReference",
            page: 1,
            bounds: { x: 0.05, y: 0.1, width: 0.4, height: 0.05 },
          },
        ],
      })
    ).toBe(true);
  });

  it("detects bound changes", () => {
    expect(
      roiDraftEquals(sample, {
        regions: [
          {
            name: "jobReference",
            page: 1,
            bounds: { x: 0.1, y: 0.1, width: 0.4, height: 0.05 },
          },
        ],
      })
    ).toBe(false);
  });

  it("handles null/undefined safely", () => {
    expect(roiDraftEquals(null, sample)).toBe(false);
    expect(roiDraftEquals(undefined, undefined)).toBe(true);
    expect(roiDraftEquals(sample, sample)).toBe(true);
  });
});
