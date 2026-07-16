/**
 * Multi-engine field voting + handwriting (Wave-4 B2) contract tests.
 *
 * Challenge bar: voted field exact-match F1 ≥ max(single-engine)+3pp on a
 * disagreement slice. Also verifies honest abstain and label-only signature kill.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  voteField,
  voteFields,
  exactMatchF1,
  singleEngineArgmax,
  normalizeVoteValue,
  isFieldVoteEnabled,
  FEATURE_FIELD_VOTE,
  voteHandwritingField,
  applyFieldVote,
  scrapeCriticalFieldsFromText,
  type EngineFieldCandidate,
} from "../../services/fieldVoting";
import { buildFieldCrossCheckVotes as buildFromResilient } from "../../services/ocrAdapter/resilientOcrAdapter";

describe("Field voting (Wave-4 B2)", () => {
  const prev = process.env[FEATURE_FIELD_VOTE];

  beforeEach(() => {
    process.env[FEATURE_FIELD_VOTE] = "true";
  });

  afterEach(() => {
    if (prev === undefined) delete process.env[FEATURE_FIELD_VOTE];
    else process.env[FEATURE_FIELD_VOTE] = prev;
  });

  describe("feature flag", () => {
    it("defaults off when unset", () => {
      delete process.env[FEATURE_FIELD_VOTE];
      expect(isFieldVoteEnabled()).toBe(false);
    });

    it("enables when true", () => {
      process.env[FEATURE_FIELD_VOTE] = "true";
      expect(isFieldVoteEnabled()).toBe(true);
    });
  });

  describe("voteField consensus / abstain", () => {
    it("majority agreement beats a high-confidence singleton wrong engine", () => {
      const vote = voteField("jobReference", [
        {
          engine: "primary",
          fieldId: "jobReference",
          value: "12345",
          confidence: 0.7,
        },
        {
          engine: "fallback",
          fieldId: "jobReference",
          value: "12345",
          confidence: 0.68,
        },
        {
          engine: "crop",
          fieldId: "jobReference",
          value: "99999",
          confidence: 0.95,
        },
      ]);
      expect(vote.abstained).toBe(false);
      expect(normalizeVoteValue("jobReference", vote.value)).toBe("12345");
      expect(vote.decision).toBe("majority");
      expect(vote.confidence).toBeGreaterThan(0.7);
    });

    it("honest abstain when engines disagree without majority or gap", () => {
      const vote = voteField("assetId", [
        {
          engine: "primary",
          fieldId: "assetId",
          value: "ASSET-A",
          confidence: 0.72,
        },
        {
          engine: "fallback",
          fieldId: "assetId",
          value: "ASSET-B",
          confidence: 0.71,
        },
      ]);
      expect(vote.abstained).toBe(true);
      expect(vote.value).toBeNull();
      expect(vote.reasonCode).toBe("ABSTAIN");
      expect(vote.fallbackValue).toBeTruthy();
      expect(vote.confidence).toBeLessThanOrEqual(0.55);
    });

    it("confidence-gap resolves when leader is clearly stronger", () => {
      const vote = voteField("date", [
        {
          engine: "primary",
          fieldId: "date",
          value: "08/07/2026",
          confidence: 0.92,
          evidenceStrength: "strong",
        },
        {
          engine: "fallback",
          fieldId: "date",
          value: "07/08/2026",
          confidence: 0.55,
        },
      ]);
      expect(vote.abstained).toBe(false);
      expect(vote.decision).toBe("confidence_gap");
      expect(normalizeVoteValue("date", vote.value)).toBe("08/07/2026");
    });

    it("single engine passes through without fake consensus boost", () => {
      const vote = voteField("jobReference", [
        {
          engine: "primary",
          fieldId: "jobReference",
          value: "55555",
          confidence: 0.8,
        },
      ]);
      expect(vote.decision).toBe("single");
      expect(vote.confidence).toBe(0.8);
      expect(vote.value).toBe("55555");
    });
  });

  describe("handwriting / signature honesty", () => {
    it("label-only Present without VLM abstains (kills theater)", () => {
      const vote = voteHandwritingField({
        fieldId: "engineerSignOff",
        ocrCandidates: [
          {
            engine: "ensemble",
            fieldId: "engineerSignOff",
            value: "Present",
            confidence: 0.4,
            evidenceStrength: "label_only",
            evidence: "Signature label found (label_only — no ink proof)",
          },
        ],
      });
      expect(vote.abstained).toBe(true);
      expect(vote.reasonCode).toBe("LABEL_ONLY_NO_INK");
      expect(vote.value).toBeNull();
    });

    it("VLM Present wins over OCR Absent with strong evidence", () => {
      const vote = voteHandwritingField({
        fieldId: "engineerSignOff",
        ocrCandidates: [
          {
            engine: "primary",
            fieldId: "engineerSignOff",
            value: "Absent",
            confidence: 0.5,
            evidenceStrength: "weak",
          },
        ],
        vlm: { present: true, confidence: 0.96 },
      });
      expect(vote.abstained).toBe(false);
      expect(vote.value).toBe("Present");
      expect(vote.confidence).toBeGreaterThanOrEqual(0.96);
      expect(vote.winningEngines).toContain("vlm");
    });

    it("VLM + crop consensus boosts Present confidence", () => {
      const vote = voteHandwritingField({
        fieldId: "customerSignature",
        ocrCandidates: [],
        vlm: { present: true, confidence: 0.9 },
        crop: { value: "Present", confidence: 0.85 },
      });
      expect(vote.abstained).toBe(false);
      expect(vote.value).toBe("Present");
      expect(vote.decision).toMatch(/consensus|majority/);
      expect(vote.confidence).toBeGreaterThan(0.9);
    });
  });

  describe("challenge bar: vote F1 ≥ max(engine)+3pp on disagreements", () => {
    /**
     * Synthetic disagreement corpus: three engines with different accuracy.
     * On each row at least two disagree; majority of correct engines wins.
     */
    it("voted exact-match F1 beats best single-engine by ≥3pp", () => {
      type Row = {
        label: string;
        engines: EngineFieldCandidate[];
      };

      // 100 disagreement rows: primary correct 55%, fallback 62%, crop 58%.
      // Majority of (primary+fallback+crop) recovers ~78%+ when two agree on truth.
      const rows: Row[] = [];
      for (let i = 0; i < 100; i++) {
        const truth = `J${10000 + i}`;
        const wrongA = `X${10000 + i}`;
        const wrongB = `Y${10000 + i}`;

        // Pattern: on most rows, two engines share the truth and one is wrong
        // with higher solo confidence — classic case where argmax loses.
        const mode = i % 5;
        let engines: EngineFieldCandidate[];
        if (mode === 0) {
          // primary+fallback correct; crop wrong but higher conf
          engines = [
            {
              engine: "primary",
              fieldId: "jobReference",
              value: truth,
              confidence: 0.7,
            },
            {
              engine: "fallback",
              fieldId: "jobReference",
              value: truth,
              confidence: 0.68,
            },
            {
              engine: "crop",
              fieldId: "jobReference",
              value: wrongA,
              confidence: 0.93,
            },
          ];
        } else if (mode === 1) {
          engines = [
            {
              engine: "primary",
              fieldId: "jobReference",
              value: wrongA,
              confidence: 0.91,
            },
            {
              engine: "fallback",
              fieldId: "jobReference",
              value: truth,
              confidence: 0.72,
            },
            {
              engine: "crop",
              fieldId: "jobReference",
              value: truth,
              confidence: 0.74,
            },
          ];
        } else if (mode === 2) {
          engines = [
            {
              engine: "primary",
              fieldId: "jobReference",
              value: truth,
              confidence: 0.71,
            },
            {
              engine: "fallback",
              fieldId: "jobReference",
              value: wrongB,
              confidence: 0.9,
            },
            {
              engine: "crop",
              fieldId: "jobReference",
              value: truth,
              confidence: 0.73,
            },
          ];
        } else if (mode === 3) {
          // Hard disagreement — vote abstains (null). Label present.
          engines = [
            {
              engine: "primary",
              fieldId: "jobReference",
              value: wrongA,
              confidence: 0.7,
            },
            {
              engine: "fallback",
              fieldId: "jobReference",
              value: wrongB,
              confidence: 0.71,
            },
            {
              engine: "crop",
              fieldId: "jobReference",
              value: truth,
              confidence: 0.72,
            },
          ];
        } else {
          engines = [
            {
              engine: "primary",
              fieldId: "jobReference",
              value: truth,
              confidence: 0.69,
            },
            {
              engine: "fallback",
              fieldId: "jobReference",
              value: truth,
              confidence: 0.7,
            },
            {
              engine: "crop",
              fieldId: "jobReference",
              value: wrongA,
              confidence: 0.88,
            },
          ];
        }
        rows.push({ label: truth, engines });
      }

      const labels = rows.map(r => r.label);
      const engineIds = ["primary", "fallback", "crop"] as const;

      const engineF1s = engineIds.map(id => {
        const preds = rows.map(r => {
          const hit = r.engines.find(e => e.engine === id);
          return hit?.value ?? null;
        });
        return exactMatchF1(preds, labels, "jobReference").f1;
      });
      const maxEngineF1 = Math.max(...engineF1s);

      const votePreds = rows.map(
        r => voteField("jobReference", r.engines).value
      );
      const voteF1 = exactMatchF1(votePreds, labels, "jobReference").f1;

      const argmaxPreds = singleEngineArgmax(rows.map(r => r.engines));
      const argmaxF1 = exactMatchF1(argmaxPreds, labels, "jobReference").f1;

      // Challenge bar: vote ≥ max(engine) + 3pp
      expect(voteF1).toBeGreaterThanOrEqual(maxEngineF1 + 0.03);
      // Also beats naive argmax-confidence (theater-prone)
      expect(voteF1).toBeGreaterThan(argmaxF1);
    });
  });

  describe("applyFieldVote + scrape", () => {
    it("scrapes job/asset from OCR markdown", () => {
      const fields = scrapeCriticalFieldsFromText(
        "Job Number: 12345\nAsset Number: ASSET-99\nDate of Service: 08/07/2026\nTechnician Signature"
      );
      expect(
        fields.some(f => f.fieldId === "jobReference" && f.value === "12345")
      ).toBe(true);
      expect(fields.some(f => f.fieldId === "assetId")).toBe(true);
      const sig = fields.find(f => f.fieldId === "engineerSignOff");
      expect(sig?.confidence).toBeLessThanOrEqual(0.45);
      expect(sig?.evidence).toMatch(/label_only/);
    });

    it("applyFieldVote merges majority and abstains signatures without VLM", () => {
      const result = applyFieldVote({
        force: true,
        primary: {
          jobReference: { value: "12345", confidence: 70 },
          engineerSignOff: { value: "Present", confidence: 40 },
        },
        fallback: {
          jobReference: { value: "12345", confidence: 68 },
        },
        crop: {
          jobReference: { value: "99999", confidence: 95 },
        },
      });
      expect(result.enabled).toBe(true);
      expect(result.votedFields.jobReference?.value).toBe("12345");
      expect(result.votedFields.engineerSignOff).toBeUndefined();
      expect(result.handwritingVotes.engineerSignOff?.abstained).toBe(true);
    });

    it("fuses ensemble jobNumber with crop jobReference before vote", () => {
      const result = applyFieldVote({
        force: true,
        ensemble: {
          jobNumber: { value: "JS-FUSE-1", confidence: 80 },
        },
        crop: {
          jobReference: { value: "JS-FUSE-1", confidence: 92 },
        },
        multimodalRoi: {
          jobReference: { value: "JS-FUSE-1", confidence: 88 },
        },
      });
      expect(result.votedFields.jobReference?.value).toBe("JS-FUSE-1");
      // Dual-emit keeps legacy key populated for downstream consumers
      expect(result.votedFields.jobNumber?.value).toBe("JS-FUSE-1");
    });

    it("uses Azure layout as a distinct OCR candidate, preserving conflict abstention", () => {
      const agreed = applyFieldVote({
        force: true,
        primary: {
          jobReference: { value: "AZ-249200", confidence: 75 },
        },
        azure: {
          jobReference: { value: "AZ-249200", confidence: 75 },
        },
      });
      expect(agreed.votedFields.jobReference?.value).toBe("AZ-249200");
      expect(agreed.batch?.fields.jobReference?.winningEngines).toContain(
        "azure"
      );

      const conflicted = applyFieldVote({
        force: true,
        primary: {
          assetId: { value: "ASSET-A", confidence: 72 },
        },
        azure: {
          assetId: { value: "ASSET-B", confidence: 71 },
        },
      });
      expect(conflicted.votedFields.assetId).toBeUndefined();
      expect(conflicted.batch?.fields.assetId?.abstained).toBe(true);
    });

    it("keeps provisioned custom JSR candidates separately attributable", () => {
      const result = applyFieldVote({
        force: true,
        primary: {
          jobReference: { value: "JSR-249200", confidence: 75 },
        },
        azureCustom: {
          jobNumber: { value: "JSR-249200", confidence: 91 },
        },
      });
      expect(result.votedFields.jobReference?.value).toBe("JSR-249200");
      expect(result.batch?.fields.jobReference?.winningEngines).toContain(
        "azure_custom"
      );
    });

    it("does not cross-map customerSignature into engineerSignOff via alias", async () => {
      const { aliasCanonicalExtractedFields } = await import(
        "../../services/ensembleExtraction"
      );
      const aliased = aliasCanonicalExtractedFields({
        customerSignature: { value: "Present", confidence: 90, pageNumber: 1 },
      });
      expect(aliased.customerSignature?.value).toBe("Present");
      expect(aliased.engineerSignOff).toBeUndefined();
    });
  });

  describe("resilient OCR field cross-check", () => {
    it("emits fieldVotes when both engines return pages", () => {
      const primary = [
        {
          pageNumber: 1,
          markdown: "Job Number: 12345\nAsset Number: ASSET-1",
        },
      ];
      const fallback = [
        {
          pageNumber: 1,
          markdown: "Job Number: 12345\nAsset Number: ASSET-2",
        },
      ];
      const { fieldVotes, fieldsAbstained } = buildFromResilient(
        primary,
        fallback
      );
      expect(fieldVotes.length).toBeGreaterThan(0);
      expect(fieldVotes.some(f => f.fieldId === "jobReference")).toBe(true);
      // asset disagreement → abstain
      expect(fieldsAbstained).toBeGreaterThanOrEqual(1);
      const job = fieldVotes.find(f => f.fieldId === "jobReference");
      expect(job?.agreement).toBe(true);
      expect(job?.valueHash).toBeTruthy();
    });
  });

  describe("voteFields batch", () => {
    it("summarizes consensus vs abstain counts", () => {
      const batch = voteFields({
        jobReference: [
          {
            engine: "primary",
            fieldId: "jobReference",
            value: "1",
            confidence: 0.8,
          },
          {
            engine: "fallback",
            fieldId: "jobReference",
            value: "1",
            confidence: 0.8,
          },
        ],
        assetId: [
          {
            engine: "primary",
            fieldId: "assetId",
            value: "A",
            confidence: 0.7,
          },
          {
            engine: "fallback",
            fieldId: "assetId",
            value: "B",
            confidence: 0.7,
          },
        ],
      });
      expect(
        batch.summary.consensus + batch.summary.majority
      ).toBeGreaterThanOrEqual(1);
      expect(batch.summary.abstained).toBeGreaterThanOrEqual(1);
    });
  });
});
