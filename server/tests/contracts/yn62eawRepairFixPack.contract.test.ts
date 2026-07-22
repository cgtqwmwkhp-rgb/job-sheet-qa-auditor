/**
 * Repair Sheet Fix Pack — YN62EAW-shaped born-digital flatten
 * (prod JOB-20260722-OSAYUC / text-layer path).
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { evaluateDateCompliance } from "../../services/dateCompliance";
import { analyzeCommentNarrative } from "../../services/commentQuality";
import {
  extractNamedSection,
  normalizeJobSummarySectionText,
  sectionHasContent,
} from "../../services/jobSummaryConsistency";
import { extractTechnicianNameFromText } from "../../services/technicianAttribution";
import { evaluateEngineerAttribution } from "../../services/engineerAttributionFindings";
import { evaluatePhotoEvidenceConsistency } from "../../services/photoEvidence";
import {
  applyFindingHygiene,
  injectPresentFieldFindings,
  toPresentSignatureFinding,
} from "../../services/findingHygiene";
import { demoteSignatureSystemWhenImageQaUnavailable } from "../../services/selectionMarks/signOffHonesty";
import {
  hasJobReferenceLabel,
  isLetterheadPhoneFragment,
  sanitizeJobReferenceValue,
} from "../../services/letterheadNoise";
import type { Finding } from "../../services/analyzer";

const FLAT = readFileSync(
  resolve(
    __dirname,
    "../fixtures/ocr-captures/yn62eaw-repair-textlayer-flat.txt"
  ),
  "utf8"
);

describe("YN62EAW repair fix pack (text-layer flatten)", () => {
  const normalized = normalizeJobSummarySectionText(FLAT);

  it("normalizeJobSummarySectionText inserts section newlines", () => {
    expect(normalized.split("\n").length).toBeGreaterThan(
      FLAT.split("\n").length
    );
    expect(normalized).toMatch(/Engineer Comments/i);
    expect(normalized).toMatch(/Repairs Required/i);
  });

  it("DATE-C010 is excluded on repair Job Summary", () => {
    const result = evaluateDateCompliance({
      text: normalized,
      templateSlug: "job-summary-v1",
      expiryDate: "UKAS",
      now: new Date("2026-07-22T12:00:00.000Z"),
    });
    expect(result.signals.repairScope).toBe(true);
    expect(result.signals.inspectionScope).toBe(false);
    expect(result.findings.some(f => f.ruleId === "DATE-C010")).toBe(false);
  });

  it("ATTR extracts brandon.Towse from Technican layout", () => {
    expect(extractTechnicianNameFromText(FLAT)).toBe("brandon.Towse");
    expect(extractTechnicianNameFromText(normalized)).toBe("brandon.Towse");
    const attr = evaluateEngineerAttribution({
      report: { extractedFields: {}, extractedText: normalized },
      candidates: [],
    });
    expect(attr.attribution.extractedName).toBe("brandon.Towse");
    expect(attr.findings.some(f => f.ruleId === "ATTR-C010")).toBe(false);
  });

  it("captures thorough Engineer Comments on flattened text", () => {
    const analysis = analyzeCommentNarrative(normalized);
    expect(analysis.present).toBe(true);
    expect(analysis.wordCount).toBeGreaterThan(40);
    expect(analysis.rawSnippet.toLowerCase()).toContain("fuel leak");
  });

  it("photo evidence is not skipped for repair + Images page", () => {
    const repairs = sectionHasContent(
      extractNamedSection(normalized, "Repairs Required")
    );
    expect(repairs.present || /consumables\s+used\??\s*yes/i.test(FLAT)).toBe(
      true
    );
    const photo = evaluatePhotoEvidenceConsistency(normalized, {
      totalPages: 2,
    });
    expect(photo.hasPartsOrRepairs).toBe(true);
    expect(photo.summary).not.toMatch(/skipped/i);
  });

  it("Parts Still Required does not swallow Technican/Images bleed", () => {
    const body = extractNamedSection(normalized, "Parts Still Required");
    const content = sectionHasContent(body);
    expect(content.present).toBe(false);
    expect(body.toLowerCase()).not.toContain("images");
  });

  it("present field theater uses EXTRACTED without CORRECTED mismatch", () => {
    const injected = injectPresentFieldFindings([], normalized);
    const asset = injected.find(f => f.fieldName === "assetId");
    expect(asset?.reasonCode).toBe("EXTRACTED");
    expect(asset?.rawSnippet).toBe(asset?.normalisedSnippet);
    expect(asset?.normalisedSnippet).toMatch(/YN62EAW/i);
  });

  it("rejects letterhead phone-fragment as jobReference (JSR-R001)", () => {
    expect(hasJobReferenceLabel(FLAT)).toBe(false);
    expect(isLetterheadPhoneFragment("562102", FLAT)).toBe(true);
    expect(sanitizeJobReferenceValue("562102", FLAT)).toBeNull();

    const cleaned = applyFindingHygiene(
      [
        {
          ruleId: "JSR-R001",
          fieldName: "jobReference",
          severity: "S1",
          reasonCode: "MISSING_FIELD",
          rawSnippet: "562102",
          normalisedSnippet: "562102",
          confidence: 40,
          pageNumber: 1,
          whyItMatters: "Job reference required",
          suggestedFix: "Enter Job ID",
        },
      ],
      {
        documentText: FLAT,
        preExtractedFields: {
          jobReference: { value: "562102", confidence: 85, pageNumber: 1 },
        },
      }
    );
    expect(cleaned.some(f => f.ruleId === "JSR-R001")).toBe(false);
  });

  it("job-summary image_qa_unavailable signatures use INK_UNVERIFIED", () => {
    const sig: Finding = {
      ruleId: "JSR-R004",
      fieldName: "engineerSignOff",
      severity: "S1",
      reasonCode: "MISSING_FIELD",
      rawSnippet: "Absent",
      normalisedSnippet: "Absent",
      confidence: 40,
      pageNumber: 1,
      whyItMatters: "x",
      suggestedFix: "y",
    };
    const demoted = demoteSignatureSystemWhenImageQaUnavailable([sig], {
      skippedReason: "image_qa_unavailable",
      templateSlug: "job-summary-v1",
    });
    expect(demoted[0]?.honestyDemoted).toBe(true);
    expect(demoted[0]?.severity).toBe("S3");
    expect(demoted[0]?.reasonCode).toBe("INK_UNVERIFIED");

    const present = toPresentSignatureFinding(sig);
    expect(present.reasonCode).toBe("INK_UNVERIFIED");
    expect(present.rawSnippet).toBe(present.normalisedSnippet);
  });
});
