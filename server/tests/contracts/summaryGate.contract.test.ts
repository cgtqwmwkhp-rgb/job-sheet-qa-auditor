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
});
