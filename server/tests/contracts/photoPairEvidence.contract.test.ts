/**
 * Photo pair compare + evidence coherence contracts.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  evaluatePhotoEvidenceConsistency,
  extractPhotoEvidenceHints,
} from "../../services/photoEvidence";
import {
  runHeuristicPairCompare,
  runPhotoPairCompare,
  FEATURE_PHOTO_PAIR_COMPARE,
} from "../../services/photoEvidence/pairCompare";
import { evaluateEvidenceCoherence } from "../../services/evidenceCoherence";
import { DEFAULT_AUDIT_POLICY } from "../../services/auditPolicy/defaults";
import { buildEvidenceRoiAnalytics } from "../../services/exceptionAnalytics/evidenceRoi";
import { buildDeterministicDeepNote } from "../../services/commentQuality/advisory";
import { evaluateCommentQuality } from "../../services/commentQuality";
import { readFileSync } from "fs";
import { resolve } from "path";

const WITH_HINTS = `
Job Summary Report
Repairs Required: Replace cracked hinge.
Parts Used: 1x hinge PN-1

Photo 1 Before
hinge cracked

Photo 2 After
hinge fitted

Page 2
Page 3
Technician Signature
`;

const NO_HINTS = `
Job Summary Report
Repairs Required: Replace cracked hinge.
Parts Used: 1x hinge PN-1
Technician Signature
`;

describe("photoEvidence hints", () => {
  it("emits PHOTO-C011 when Photo-N / before-after hints present", () => {
    const result = evaluatePhotoEvidenceConsistency(WITH_HINTS, {
      totalPages: 3,
    });
    expect(result.hasPhotoHints).toBe(true);
    expect(result.findings.some(f => f.ruleId === "PHOTO-C011")).toBe(true);
    expect(result.findings.some(f => f.ruleId === "PHOTO-C010")).toBe(false);
  });

  it("emits PHOTO-C010 when parts/repairs but no hints", () => {
    const result = evaluatePhotoEvidenceConsistency(NO_HINTS);
    expect(result.findings.some(f => f.ruleId === "PHOTO-C010")).toBe(true);
  });

  it("emits PHOTO-C015 on duplicate fileHash", () => {
    const result = evaluatePhotoEvidenceConsistency(NO_HINTS, {
      fileHash: "abc123",
      priorFileHashes: ["abc123"],
    });
    expect(result.findings.some(f => f.ruleId === "PHOTO-C015")).toBe(true);
  });

  it("extractPhotoEvidenceHints counts Photo-N", () => {
    const hints = extractPhotoEvidenceHints(WITH_HINTS, { totalPages: 3 });
    expect(hints.photoNumberCount).toBeGreaterThanOrEqual(1);
    expect(hints.hasBeforeLabel || hints.photoNumberCount > 0).toBe(true);
  });
});

describe("pairCompare", () => {
  const prev = process.env[FEATURE_PHOTO_PAIR_COMPARE];
  beforeEach(() => {
    process.env[FEATURE_PHOTO_PAIR_COMPARE] = "true";
  });
  afterEach(() => {
    if (prev === undefined) delete process.env[FEATURE_PHOTO_PAIR_COMPARE];
    else process.env[FEATURE_PHOTO_PAIR_COMPARE] = prev;
  });

  it("pairs before/after pages and can mock fail work_done", () => {
    const art = runHeuristicPairCompare({
      text: WITH_HINTS,
      totalPages: 3,
      mockMode: "fail_work",
    });
    expect(art.pairs.length).toBeGreaterThan(0);
    expect(art.pairs[0].axes.work_done).toBe("fail");
  });

  it("emits PHOTO-C012 from pair fail artifact", () => {
    const art = runHeuristicPairCompare({
      text: WITH_HINTS,
      totalPages: 3,
      mockMode: "fail_work",
    });
    const result = evaluatePhotoEvidenceConsistency(WITH_HINTS, {
      totalPages: 3,
      pairCompare: art,
    });
    expect(result.findings.some(f => f.ruleId === "PHOTO-C012")).toBe(true);
  });

  it("runPhotoPairCompare returns null when flag off", async () => {
    delete process.env[FEATURE_PHOTO_PAIR_COMPARE];
    const art = await runPhotoPairCompare({ text: WITH_HINTS, totalPages: 3 });
    expect(art).toBeNull();
  });
});

describe("evidenceCoherence", () => {
  it("emits EVIDENCE-C010 when narrative claims repair but photos fail", () => {
    const art = runHeuristicPairCompare({
      text: WITH_HINTS,
      totalPages: 3,
      mockMode: "fail_work",
    });
    const result = evaluateEvidenceCoherence({
      commentSnippet: "Hinge replaced and repaired, all works completed.",
      pairCompare: art,
      worksCompleteYes: true,
    });
    expect(result.contradicted).toBe(true);
    expect(result.findings.some(f => f.ruleId === "EVIDENCE-C010")).toBe(true);
  });
});

describe("Deep Note advisory", () => {
  it("builds deterministic advisory from comment quality", () => {
    const cq = evaluateCommentQuality(`
VOR: Yes
Is the asset safe to use?: No
Is a return visit required?: Yes
Were all works fully completed?: No
Engineer Comments: N/A
`);
    const note = buildDeterministicDeepNote(cq);
    expect(note.enabled).toBe(true);
    expect(note.recommendEscalate).toBe(true);
    expect(note.gaps.length).toBeGreaterThan(0);
  });
});

describe("evidence ROI analytics", () => {
  it("aggregates COMMENT/PHOTO majors into money signal", () => {
    const summary = buildEvidenceRoiAnalytics({
      findings: [
        {
          findingId: 1,
          jobSheetId: 10,
          ruleId: "COMMENT-C010",
          reasonCode: "INCOMPLETE_EVIDENCE",
          severity: "S1",
          fieldName: "Engineer Comments",
          resolutionStatus: "open",
          siteInfo: "A",
          occurredAt: new Date().toISOString(),
          resolvedAt: null,
        },
        {
          findingId: 2,
          jobSheetId: 11,
          ruleId: "PHOTO-C012",
          reasonCode: "INCOMPLETE_EVIDENCE",
          severity: "S1",
          fieldName: "Before/After",
          resolutionStatus: "overridden",
          siteInfo: "A",
          occurredAt: new Date().toISOString(),
          resolvedAt: new Date().toISOString(),
        },
      ],
    });
    expect(summary.commentMajorCount).toBe(1);
    expect(summary.photoMajorCount).toBe(1);
    expect(summary.cardsBlockedEstimate).toBe(2);
    expect(summary.moneySignal).toMatch(/blocked/i);
  });
});

describe("policy seeds for photo/evidence", () => {
  it("seeds PHOTO-C012 major and EVIDENCE-C010", () => {
    const rules = DEFAULT_AUDIT_POLICY.forms["job-summary-v1"].rules;
    expect(rules.find(r => r.ruleId === "PHOTO-C012")!.failClass).toBe(
      "major"
    );
    expect(rules.find(r => r.ruleId === "EVIDENCE-C010")!.failClass).toBe(
      "major"
    );
  });
});

describe("documentProcessor wiring photo/coherence", () => {
  it("wires pair compare and evidence coherence", () => {
    const src = readFileSync(
      resolve(__dirname, "../../services/documentProcessor.ts"),
      "utf8"
    );
    expect(src).toContain("runPhotoPairCompare");
    expect(src).toContain("evaluateEvidenceCoherence");
    expect(src).toContain("photoPairCompare");
  });
});
