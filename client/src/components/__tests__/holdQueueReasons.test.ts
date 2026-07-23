import { describe, it, expect } from "vitest";
import { labelForReasonCode } from "../review/holdQueueReasons";

describe("labelForReasonCode", () => {
  it("maps known reason codes to human labels", () => {
    expect(labelForReasonCode("MISSING_FIELD")).toBe("Missing Field");
    expect(labelForReasonCode("INCOMPLETE_EVIDENCE")).toBe(
      "Incomplete Evidence"
    );
    expect(labelForReasonCode("INK_UNVERIFIED")).toBe("Ink Unverified");
    expect(labelForReasonCode("SOME_NEW_CODE")).toBe("Some New Code");
  });
});
