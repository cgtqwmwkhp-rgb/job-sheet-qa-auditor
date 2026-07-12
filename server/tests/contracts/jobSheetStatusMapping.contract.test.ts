/**
 * FAIL documentation outcomes must store as failed — never completed.
 */

import { describe, expect, it } from "vitest";
import { mapAnalyzerOverallToJobSheetStatus } from "../../services/processStatus";

describe("mapAnalyzerOverallToJobSheetStatus", () => {
  it("maps PASS → completed", () => {
    expect(mapAnalyzerOverallToJobSheetStatus("PASS")).toBe("completed");
  });

  it("maps REVIEW_QUEUE → review_queue", () => {
    expect(mapAnalyzerOverallToJobSheetStatus("REVIEW_QUEUE")).toBe(
      "review_queue"
    );
  });

  it("maps FAIL → failed (not completed)", () => {
    expect(mapAnalyzerOverallToJobSheetStatus("FAIL")).toBe("failed");
  });

  it("maps unknown analyzer results to failed", () => {
    expect(mapAnalyzerOverallToJobSheetStatus("")).toBe("failed");
    expect(mapAnalyzerOverallToJobSheetStatus("UNKNOWN")).toBe("failed");
  });
});
