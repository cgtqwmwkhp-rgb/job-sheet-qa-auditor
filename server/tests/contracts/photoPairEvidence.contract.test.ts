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
  parsePairAxesFromText,
  FEATURE_PHOTO_PAIR_COMPARE,
  PHOTO_PAIR_USE_VLM,
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
  const envKeys = [
    FEATURE_PHOTO_PAIR_COMPARE,
    PHOTO_PAIR_USE_VLM,
    "FEATURE_VLM_VERIFICATION",
    "VLM_PROVIDER",
    "ANTHROPIC_API_KEY",
  ] as const;
  const prev: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const k of envKeys) prev[k] = process.env[k];
    process.env[FEATURE_PHOTO_PAIR_COMPARE] = "true";
    delete process.env[PHOTO_PAIR_USE_VLM];
    delete process.env.FEATURE_VLM_VERIFICATION;
    delete process.env.VLM_PROVIDER;
  });
  afterEach(() => {
    for (const k of envKeys) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
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

  it("mockMode still works with FEATURE_PHOTO_PAIR_COMPARE=true", async () => {
    process.env.PHOTO_PAIR_USE_VLM = "true";
    process.env.VLM_PROVIDER = "mock";
    const art = await runPhotoPairCompare({
      text: WITH_HINTS,
      totalPages: 3,
      mockMode: "fail_work",
      documentPdfBase64: Buffer.from("%PDF-1.4 mock").toString("base64"),
    });
    expect(art).not.toBeNull();
    expect(art!.provider).toBe("mock");
    expect(art!.model).toBe("mock-fail_work");
    expect(art!.pairs[0].axes.work_done).toBe("fail");
  });

  it("VLM mock path returns axes artifact when PDF present", async () => {
    process.env.PHOTO_PAIR_USE_VLM = "true";
    process.env.VLM_PROVIDER = "mock";
    const art = await runPhotoPairCompare({
      text: WITH_HINTS,
      totalPages: 3,
      documentPdfBase64: Buffer.from("%PDF-1.4 mock").toString("base64"),
    });
    expect(art).not.toBeNull();
    expect(art!.provider).toBe("mock");
    expect(art!.model).toBe("mock-vlm-pair-v1");
    expect(art!.pairs.length).toBeGreaterThan(0);
    expect(art!.pairs[0].axes.work_done).toBe("pass");
    expect(art!.summary).toMatch(/VLM paired/i);
  });

  it("VLM path fail-soft returns heuristic artifact", async () => {
    process.env.PHOTO_PAIR_USE_VLM = "true";
    process.env.VLM_PROVIDER = "anthropic";
    delete process.env.ANTHROPIC_API_KEY;
    const art = await runPhotoPairCompare({
      text: WITH_HINTS,
      totalPages: 3,
      documentPdfBase64: Buffer.from("%PDF-1.4 mock").toString("base64"),
    });
    expect(art).not.toBeNull();
    expect(art!.provider).toBe("heuristic");
    expect(art!.model).toBe("heuristic-page-roles-v1");
    expect(art!.pairs.length).toBeGreaterThan(0);
  });

  it("parsePairAxesFromText reads nested axes JSON", () => {
    const parsed = parsePairAxesFromText(
      'prefix {"axes":{"work_done":"fail","repaired_properly":"pass","clean":"pass","residual_risk":"inconclusive"},"confidence":0.9,"reasoning":"x"}'
    );
    expect(parsed).not.toBeNull();
    expect(parsed!.axes.work_done).toBe("fail");
    expect(parsed!.confidence).toBe(0.9);
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
