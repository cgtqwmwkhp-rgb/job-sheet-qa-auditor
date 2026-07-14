import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { nextOpenFindingId, scrollFindingIntoView } from "./reviewActionFeel";

describe("nextOpenFindingId", () => {
  const findings = [
    { id: 1, status: "missing" },
    { id: 2, status: "warning" },
    { id: 3, status: "missing" },
    { id: 4, status: "passed" },
  ];

  it("advances to the next open finding after resolve", () => {
    expect(nextOpenFindingId(findings, 1, new Set())).toBe(2);
    expect(nextOpenFindingId(findings, 2, new Set())).toBe(3);
  });

  it("skips optimistic-passed ids and wraps", () => {
    expect(nextOpenFindingId(findings, 3, new Set([1]))).toBe(2);
    expect(nextOpenFindingId(findings, 3, new Set([1, 2]))).toBe(null);
  });

  it("returns null when nothing remains open", () => {
    expect(
      nextOpenFindingId(
        [
          { id: 1, status: "missing" },
          { id: 2, status: "passed" },
        ],
        1,
        new Set()
      )
    ).toBe(null);
  });
});

describe("scrollFindingIntoView", () => {
  const scrollIntoView = vi.fn();
  const getElementById = vi.fn();

  beforeEach(() => {
    scrollIntoView.mockReset();
    getElementById.mockReset();
    getElementById.mockReturnValue({ scrollIntoView });
    vi.stubGlobal("document", { getElementById });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses instant scroll for snappy find↔PDF feel", () => {
    scrollFindingIntoView(42);
    expect(getElementById).toHaveBeenCalledWith("finding-42");
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "auto",
      block: "nearest",
    });
  });

  it("no-ops when the finding row is missing", () => {
    getElementById.mockReturnValue(null);
    scrollFindingIntoView(99);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});
