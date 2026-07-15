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
import { mapPartsContextFromReport } from "../review/PartsContextPanel";
import { mapAttributionFromReport } from "../review/AttrContextPanel";
import { mapMakeModelFromReport } from "../review/mapReportContext";
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

  it("mapPartsContextFromReport coerces missing signal fields", () => {
    const { assessmentSignals, catalogSignals } = mapPartsContextFromReport({
      partsAssessmentSignals: { partsImplied: true, lineCount: 2 },
      partsCatalogSignals: { enabled: true, mismatchCount: 1 },
    });
    expect(assessmentSignals).not.toBeNull();
    expect(assessmentSignals!.incompleteCount).toBe(0);
    expect(catalogSignals).not.toBeNull();
    expect(catalogSignals!.matchCount).toBe(0);
  });

  it("mapAttributionFromReport reads attribution stamp", () => {
    const stamp = mapAttributionFromReport({
      attribution: {
        extractedName: "Jane Doe",
        technicianId: 9,
        confidence: "exact",
      },
    });
    expect(stamp).not.toBeNull();
    expect(stamp!.extractedName).toBe("Jane Doe");
    expect(stamp!.technicianId).toBe(9);
  });

  it("mapMakeModelFromReport reads extractedFields.makeModel.value", () => {
    expect(
      mapMakeModelFromReport({
        extractedFields: {
          makeModel: { value: "JCB 3CX", confidence: 90 },
        },
      })
    ).toBe("JCB 3CX");
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
