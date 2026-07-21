/**
 * PX-101: AI summary must not claim "passes" when outcome is FAIL / REVIEW_QUEUE.
 */

import { describe, expect, it } from "vitest";
import { gateSummaryToResult } from "../../services/summaryGate";

describe("gateSummaryToResult (PX-101)", () => {
  it("leaves PASS summaries unchanged", () => {
    const summary = "This sheet passes all required checks.";
    expect(gateSummaryToResult(summary, "PASS")).toBe(summary);
  });

  it("prefixes FAIL and neutralizes pass claims", () => {
    const gated = gateSummaryToResult(
      "Overall the job sheet passes QA requirements.",
      "FAIL"
    );
    expect(gated.startsWith("Outcome: FAIL.")).toBe(true);
    expect(gated.toLowerCase()).not.toMatch(/\bpasses\b/);
    expect(gated.toLowerCase()).toContain("does not pass");
  });

  it("prefixes REVIEW_QUEUE and strips contradictory pass language", () => {
    const gated = gateSummaryToResult(
      "Audit passed with minor notes.",
      "REVIEW_QUEUE"
    );
    expect(gated.startsWith("Outcome: Needs review.")).toBe(true);
    expect(gated.toLowerCase()).not.toMatch(/\bpassed\b/);
  });

  it("handles empty summary on FAIL", () => {
    expect(gateSummaryToResult("", "FAIL")).toBe("Outcome: FAIL.");
  });

  it("strips 'fully compliant' claims on FAIL", () => {
    const gated = gateSummaryToResult(
      "The job sheet is fully compliant with site safety standards.",
      "FAIL"
    );
    expect(gated.startsWith("Outcome: FAIL.")).toBe(true);
    expect(gated.toLowerCase()).not.toMatch(/compliant/);
  });

  it("strips bare 'compliant' / 'compliance' claims on FAIL", () => {
    const gated = gateSummaryToResult(
      "Documentation is compliant and shows good compliance overall.",
      "FAIL"
    );
    expect(gated.toLowerCase()).not.toMatch(/compliant|compliance/);
  });

  it("strips 'meets requirements' / 'meets all requirements' on REVIEW_QUEUE", () => {
    const gated = gateSummaryToResult(
      "This sheet meets all requirements for sign-off.",
      "REVIEW_QUEUE"
    );
    expect(gated.startsWith("Outcome: Needs review.")).toBe(true);
    expect(gated.toLowerCase()).not.toMatch(/meets\s+(?:all\s+)?requirements?/);
  });

  describe("PX-110: grammar — copula + claim must not leave a dangling 'is'", () => {
    it('does not produce "is does not pass" when a copula precedes the claim', () => {
      const gated = gateSummaryToResult(
        "This document is compliant with all specified rules.",
        "FAIL"
      );
      expect(gated.toLowerCase()).not.toMatch(/\bis\s+does\s+not\s+pass\b/);
      expect(gated.toLowerCase()).toContain("does not pass");
      expect(gated).toBe(
        "Outcome: FAIL. This document does not pass with all specified rules."
      );
    });

    it('handles "was/are/were + claim" the same way', () => {
      expect(
        gateSummaryToResult("The checklist was compliant.", "FAIL")
      ).toBe("Outcome: FAIL. The checklist does not pass.");
      expect(
        gateSummaryToResult("These items are fully compliant.", "FAIL")
      ).toBe("Outcome: FAIL. These items does not pass.");
    });

    it("still reads naturally with no copula present", () => {
      const gated = gateSummaryToResult(
        "Overall the job sheet passes QA requirements.",
        "FAIL"
      );
      expect(gated).toBe(
        "Outcome: FAIL. Overall the job sheet does not pass QA requirements."
      );
    });
  });
});
