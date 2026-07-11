/**
 * Wasted Journey consistency judgment contract tests.
 */

import { describe, it, expect } from "vitest";
import {
  evaluateWastedJourneyConsistency,
  extractWastedJourneySignals,
  isWastedJourneyDocument,
} from "../../services/wastedJourneyConsistency";

const COHERENT = `
Wasted Journey Sheet
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
Have you successfully contacted the original Booking Site Contact to confirm? No
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
    expect(isWastedJourneyDocument(COHERENT)).toBe(true);
    expect(isWastedJourneyDocument("Job Summary Report\nVOR")).toBe(false);
  });

  it("treats answered No as valid contact answers", () => {
    const signals = extractWastedJourneySignals(COHERENT);
    expect(signals.hasReason).toBe(true);
    expect(signals.schedulingAnswered).toBe(true);
    expect(signals.schedulingNo).toBe(true);
    expect(signals.siteContactAnswered).toBe(true);
    expect(signals.siteContactNo).toBe(true);
    expect(signals.hasSignOff).toBe(true);
  });

  it("PASS path: coherent wasted journey has no blocking Issues", () => {
    const result = evaluateWastedJourneyConsistency(COHERENT);
    expect(result.hasBlockingIssues).toBe(false);
    expect(result.findings.some(f => f.severity === "S3")).toBe(true);
    expect(result.findings.some(f => f.ruleId === "WJ-C011")).toBe(true);
    expect(result.findings.some(f => f.ruleId === "WJ-C021")).toBe(true);
    expect(result.findings.some(f => f.ruleId === "WJ-C031")).toBe(true);
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
