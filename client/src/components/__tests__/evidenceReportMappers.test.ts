/**
 * Evidence AI reportJson mappers must never throw on truncated blobs
 * (ErrorBoundary crash when opening processed sheets).
 */

import { describe, it, expect } from "vitest";
import {
  mapPhotoPairCompareFromReport,
  photoPairHasActionableFail,
} from "../review/BeforeAfterComparePane";
import { mapCommentQualityFromReport } from "../review/CommentQualityPanel";
import { mapDeepNoteFromReport } from "../DeepNoteAnalysis";

describe("Evidence AI reportJson mapper crash guards", () => {
  it("mapPhotoPairCompareFromReport returns null when pairs missing", () => {
    expect(
      mapPhotoPairCompareFromReport({
        photoPairCompare: { enabled: true, provider: "x" },
      })
    ).toBeNull();
  });

  it("mapPhotoPairCompareFromReport normalizes pairs without axes", () => {
    const art = mapPhotoPairCompareFromReport({
      photoPairCompare: {
        enabled: true,
        provider: "heuristic",
        model: "v1",
        pairs: [{ beforePage: 3, afterPage: 5 }],
        pageRoles: [],
        summary: "ok",
        processingTimeMs: 1,
      },
    });
    expect(art).not.toBeNull();
    expect(art!.pairs).toHaveLength(1);
    expect(art!.pairs[0].axes.work_done).toBe("inconclusive");
    expect(photoPairHasActionableFail(art)).toBe(false);
  });

  it("mapCommentQualityFromReport coerces missingAxes", () => {
    const { signals } = mapCommentQualityFromReport({
      commentQualitySignals: {
        onFailurePath: true,
        present: true,
        coherent: false,
      },
    });
    expect(signals).not.toBeNull();
    expect(signals!.missingAxes).toEqual([]);
    expect(signals!.missingAxes.length).toBe(0);
  });

  it("mapDeepNoteFromReport coerces non-array flags", () => {
    const note = mapDeepNoteFromReport({
      commentDeepNote: {
        enabled: true,
        completenessScore: 40,
        toneScore: 50,
        clarityScore: 60,
        flags: { bad: true },
        summary: "thin",
      },
    });
    expect(note).not.toBeNull();
    expect(Array.isArray(note!.flags)).toBe(true);
    expect(note!.flags).toEqual([]);
  });

  it("photoPairHasActionableFail is safe on null / empty", () => {
    expect(photoPairHasActionableFail(null)).toBe(false);
    expect(
      photoPairHasActionableFail({
        enabled: true,
        provider: "x",
        model: "y",
        pairs: [],
        pageRoles: [],
        summary: "",
        processingTimeMs: 0,
      })
    ).toBe(false);
  });
});
