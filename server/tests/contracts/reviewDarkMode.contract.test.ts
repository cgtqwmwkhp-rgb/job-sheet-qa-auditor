/**
 * PX-066: issues / workstation chrome should use theme tokens, not light hex.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const files = [
  "../../../client/src/components/review/ReviewWorkstationPane.tsx",
  "../../../client/src/pages/HoldQueue.tsx",
  "../../../client/src/pages/AuditResults.tsx",
];

describe("review dark mode tokens (PX-066)", () => {
  for (const rel of files) {
    it(`${path.basename(rel)} avoids light-only hex chrome`, () => {
      const src = readFileSync(path.resolve(import.meta.dirname, rel), "utf8");
      expect(src).not.toContain("border-[#EBE8E8]");
      expect(src).not.toContain("text-[#333030]");
      expect(src).not.toContain("hover:bg-[#F5F4F4]");
      expect(src).toContain("bg-background");
      expect(src).toContain("border-border");
    });
  }
});
