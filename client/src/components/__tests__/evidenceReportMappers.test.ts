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
import {
  mapPhotoEvidenceFromReport,
  photoEvidenceNeedsCoach,
} from "../review/PhotoEvidenceContextPanel";
import {
  mapPartsContextFromReport,
  partsCatalogNeedsRecheck,
} from "../review/PartsContextPanel";
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

  it("mapPhotoEvidenceFromReport maps Images-pack hints without pairs", () => {
    const { evidence } = mapPhotoEvidenceFromReport({
      photoEvidence: {
        hasPhotoHints: true,
        hasPartsOrRepairs: true,
        duplicateFileHash: false,
        summary: "Page-markers×2, pages=2",
        hints: {
          hasBeforeLabel: false,
          hasAfterLabel: false,
          photoNumberCount: 0,
          pageMarkers: 2,
          totalPagesHint: 2,
          hintSummary: ["Page-markers×2", "pages=2"],
        },
      },
    });
    expect(evidence).not.toBeNull();
    expect(evidence!.hints.totalPagesHint).toBe(2);
    expect(
      photoEvidenceNeedsCoach(evidence, {
        enabled: true,
        provider: "heuristic",
        model: "v1",
        pairs: [],
        pageRoles: [{ page: 2, role: "form" }],
        summary: "no pairs",
        processingTimeMs: 1,
      })
    ).toBe(true);
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

  it("mapPartsContextFromReport maps capped/unavailable + evidence URLs", () => {
    const { catalogSignals, catalogSummary, lineResults } =
      mapPartsContextFromReport({
        partsCatalogSignals: {
          enabled: true,
          lineCount: 12,
          verifiedCount: 10,
          matchCount: 2,
          mismatchCount: 3,
          unavailableCount: 5,
          capped: true,
        },
        partsCatalogSummary:
          "Verified=10 | Match=2 | Mismatch=3 | Unavailable=5 | CappedAt=10",
        partsCatalogLineResults: [
          {
            partNumber: "WT158",
            description: "wheel",
            outcome: "unavailable",
            evidenceUrls: ["https://parts.example.com/wt158"],
          },
          { partNumber: "BAD", description: "x", outcome: "invented" },
        ],
      });
    expect(catalogSignals).toMatchObject({
      capped: true,
      unavailableCount: 5,
      mismatchCount: 3,
    });
    expect(catalogSummary).toContain("CappedAt=10");
    expect(lineResults).toEqual([
      {
        partNumber: "WT158",
        description: "wheel",
        outcome: "unavailable",
        evidenceUrls: ["https://parts.example.com/wt158"],
      },
    ]);
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

  it("partsCatalogNeedsRecheck is true for unavailable or mismatch only when enabled", () => {
    expect(partsCatalogNeedsRecheck(null)).toBe(false);
    expect(
      partsCatalogNeedsRecheck({
        enabled: false,
        lineCount: 1,
        verifiedCount: 0,
        matchCount: 0,
        mismatchCount: 1,
        unavailableCount: 0,
        capped: false,
      })
    ).toBe(false);
    expect(
      partsCatalogNeedsRecheck({
        enabled: true,
        lineCount: 1,
        verifiedCount: 1,
        matchCount: 0,
        mismatchCount: 0,
        unavailableCount: 1,
        capped: false,
      })
    ).toBe(true);
    expect(
      partsCatalogNeedsRecheck({
        enabled: true,
        lineCount: 1,
        verifiedCount: 1,
        matchCount: 0,
        mismatchCount: 1,
        unavailableCount: 0,
        capped: false,
      })
    ).toBe(true);
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
