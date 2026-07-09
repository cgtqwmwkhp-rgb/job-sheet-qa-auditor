/**
 * Hold Queue Contract Tests
 *
 * Verifies that the Hold Queue page uses real API data (not mock data)
 * and properly displays review queue items.
 */

import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs";
import path from "path";

describe("Hold Queue Contract", () => {
  const holdQueuePath = path.resolve(
    __dirname,
    "../../../client/src/pages/HoldQueue.tsx"
  );
  let holdQueueContent: string;

  beforeAll(() => {
    holdQueueContent = fs.readFileSync(holdQueuePath, "utf-8");
  });

  describe("No Mock Data", () => {
    it("should NOT contain hardcoded mock data array", () => {
      // Old mock data had specific IDs like "JS-2024-023"
      expect(holdQueueContent).not.toContain("JS-2024-023");
      expect(holdQueueContent).not.toContain("JS-2024-021");
      expect(holdQueueContent).not.toContain("JS-2024-019");
      expect(holdQueueContent).not.toContain("JS-2024-015");
    });

    it("should NOT contain hardcoded technician names", () => {
      expect(holdQueueContent).not.toContain("'Sarah Smith'");
      expect(holdQueueContent).not.toContain("'Mike Johnson'");
      expect(holdQueueContent).not.toContain("'David Brown'");
      expect(holdQueueContent).not.toContain("'Emily Davis'");
    });

    it('should NOT contain "// Mock Data" comment', () => {
      expect(holdQueueContent).not.toContain("// Mock Data");
    });
  });

  describe("Real API Usage", () => {
    it("should import trpc", () => {
      expect(holdQueueContent).toContain("import { trpc }");
    });

    it("should use jobSheets.list query", () => {
      expect(holdQueueContent).toContain("trpc.jobSheets.list.useQuery");
    });

    it("should filter by review_queue status", () => {
      expect(holdQueueContent).toMatch(/status:\s*['"]review_queue['"]/);
    });
  });

  describe("UX States", () => {
    it("should have loading state with Loader2", () => {
      expect(holdQueueContent).toContain("Loader2");
      expect(holdQueueContent).toContain("isLoading");
    });

    it("should have error state", () => {
      expect(holdQueueContent).toContain("error");
      expect(holdQueueContent).toContain("Failed to load");
    });

    it("should have empty state when no items", () => {
      expect(holdQueueContent).toContain("Review Queue Empty");
      expect(holdQueueContent).toContain("holdItems.length === 0");
    });
  });

  describe("Navigation", () => {
    it("should link to audit details page", () => {
      expect(holdQueueContent).toContain("/audits?id=");
    });
  });

  describe("PR-13 workstation", () => {
    it("imports ReviewWorkstationPane and keyboard hook", () => {
      expect(holdQueueContent).toContain("ReviewWorkstationPane");
      expect(holdQueueContent).toContain("useReviewQueueKeyboard");
    });

    it("uses two-pane layout", () => {
      expect(holdQueueContent).toMatch(/lg:grid-cols-\[380px_1fr\]/);
    });

    it("has controlled search", () => {
      expect(holdQueueContent).toContain("searchQuery");
      expect(holdQueueContent).toMatch(/value=\{searchQuery\}/);
    });

    it("references captureFieldCorrection via workstation pane", () => {
      const panePath = path.resolve(
        __dirname,
        "../../../client/src/components/review/ReviewWorkstationPane.tsx"
      );
      const pane = fs.readFileSync(panePath, "utf-8");
      expect(pane).toContain("captureFieldCorrection");
    });
  });
});
