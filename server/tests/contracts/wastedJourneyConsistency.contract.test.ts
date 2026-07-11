/**
 * Wasted Journey consistency judgment contract tests.
 */

import { describe, it, expect } from "vitest";
import {
  evaluateWastedJourneyConsistency,
  extractAssetNo,
  extractWastedJourneySignals,
  isWastedJourneyDocument,
  isWastedJourneyExcludedField,
} from "../../services/wastedJourneyConsistency";
import { injectPresentFieldFindings } from "../../services/findingHygiene";

const COHERENT_YES = `
Wasted Journey Sheet
Asset Details
Asset No: YH23WKA_1C
Date: 10/07/2026
Repair Issue: Wasted Journey
Wasted Journey Reason: Customer / Driver No-Show
Have you successfully contacted the Scheduling Team to advise them? Yes
Have you successfully contacted the original Booking Site Contact to confirm? Yes
Technican Name: aidan.binley
Signature: Signed
`;

const BOTH_NO = `
Wasted Journey Sheet
Asset Details
Asset No: YH23WKA_1C
Date: 10/07/2026
Repair Issue: Wasted Journey
Wasted Journey Reason: Customer / Driver No-Show
Have you successfully contacted the Scheduling Team to advise them? No
Have you successfully contacted the original Booking Site Contact to confirm? No
Technican Name: aidan.binley
Signature: Signed
`;

const MISSING_REASON = `
Wasted Journey Sheet
Asset No: YH23WKA_1C
Date: 10/07/2026
Repair Issue: Wasted Journey
Have you successfully contacted the Scheduling Team to advise them? Yes
Have you successfully contacted the original Booking Site Contact to confirm? Yes
Signature: Signed
`;

const BLANK_CONTACTS = `
Wasted Journey Sheet
Asset No: YH23WKA_1C
Date: 10/07/2026
Wasted Journey Reason: Customer / Driver No-Show
Have you successfully contacted the Scheduling Team to advise them?
Have you successfully contacted the original Booking Site Contact to confirm?
Signature: Signed
`;

describe("wastedJourneyConsistency", () => {
  it("detects wasted journey documents", () => {
    expect(isWastedJourneyDocument(COHERENT_YES)).toBe(true);
    expect(isWastedJourneyDocument("Job Summary Report\nVOR")).toBe(false);
  });

  it("extracts YH23WKA_1C and never Asset Details header", () => {
    expect(extractAssetNo(BOTH_NO)).toBe("YH23WKA_1C");
    expect(extractAssetNo("Asset Details\nMake/Model: Grouped")).toBeNull();
    const signals = extractWastedJourneySignals(BOTH_NO);
    expect(signals.assetId).toBe("YH23WKA_1C");
    expect(signals.hasAssetId).toBe(true);
  });

  it("excludes job number and serial from WJ requirements", () => {
    expect(isWastedJourneyExcludedField("jobNumber")).toBe(true);
    expect(isWastedJourneyExcludedField("Job Number")).toBe(true);
    expect(isWastedJourneyExcludedField("serial_no")).toBe(true);
    expect(isWastedJourneyExcludedField("serialNumber")).toBe(true);
    expect(isWastedJourneyExcludedField("assetId")).toBe(false);
  });

  it("PASS path: both contacts Yes", () => {
    const result = evaluateWastedJourneyConsistency(COHERENT_YES);
    expect(result.hasBlockingIssues).toBe(false);
    expect(result.findings.some(f => f.ruleId === "WJ-C021")).toBe(true);
    expect(result.findings.some(f => f.ruleId === "WJ-C031")).toBe(true);
    expect(result.findings.some(f => f.ruleId === "WJ-C051")).toBe(true);
  });

  it("Issues when contacts are No (must be Yes)", () => {
    const result = evaluateWastedJourneyConsistency(BOTH_NO);
    expect(result.hasBlockingIssues).toBe(true);
    expect(result.findings.some(f => f.ruleId === "WJ-C020")).toBe(true);
    expect(result.findings.some(f => f.ruleId === "WJ-C030")).toBe(true);
  });

  it("Issues when reason is blank", () => {
    const result = evaluateWastedJourneyConsistency(MISSING_REASON);
    expect(result.hasBlockingIssues).toBe(true);
    expect(result.findings.some(f => f.ruleId === "WJ-C010")).toBe(true);
  });

  it("Issues when contact questions are unanswered", () => {
    const result = evaluateWastedJourneyConsistency(BLANK_CONTACTS);
    expect(result.hasBlockingIssues).toBe(true);
    expect(result.findings.some(f => f.ruleId === "WJ-C020")).toBe(true);
    expect(result.findings.some(f => f.ruleId === "WJ-C030")).toBe(true);
  });

  it("skips non wasted-journey text", () => {
    const result = evaluateWastedJourneyConsistency(
      "Job Summary Report\nThis Vehicle is marked as VOR"
    );
    expect(result.findings).toHaveLength(0);
    expect(result.hasBlockingIssues).toBe(false);
  });
});

describe("asset Present injection vs Asset Details", () => {
  it("injects YH23WKA_1C not DETAILS", () => {
    const text = `
Wasted Journey Sheet
Asset Details
Asset No: YH23WKA_1C
Make/Model: Grouped Ancillaries
`;
    const injected = injectPresentFieldFindings([], text);
    const asset = injected.find(f => f.fieldName === "assetId");
    expect(asset?.normalisedSnippet).toBe("YH23WKA_1C");
    expect(asset?.normalisedSnippet).not.toBe("DETAILS");
  });
});
