/**
 * Review Workstation Contract Tests (PR-13)
 *
 * Asserts Hold Queue two-pane layout, keyboard hook, search control,
 * and captureFieldCorrection wiring — source/structure only (no live DB).
 */

import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs";
import path from "path";

describe("Review Workstation Contract (PR-13)", () => {
  const root = path.resolve(__dirname, "../../..");
  const holdQueuePath = path.join(root, "client/src/pages/HoldQueue.tsx");
  const panePath = path.join(
    root,
    "client/src/components/review/ReviewWorkstationPane.tsx"
  );
  const documentViewerPath = path.join(
    root,
    "client/src/components/DocumentViewer.tsx"
  );
  const keyboardPath = path.join(
    root,
    "client/src/hooks/useReviewQueueKeyboard.ts"
  );
  const routerPath = path.join(root, "server/routers/auditActionsRouter.ts");
  const servicePath = path.join(root, "server/services/auditActions/index.ts");
  const routersPath = path.join(root, "server/routers.ts");

  let holdQueue: string;
  let pane: string;
  let documentViewer: string;
  let keyboard: string;
  let router: string;
  let service: string;
  let routers: string;

  beforeAll(() => {
    holdQueue = fs.readFileSync(holdQueuePath, "utf-8");
    pane = fs.readFileSync(panePath, "utf-8");
    documentViewer = fs.readFileSync(documentViewerPath, "utf-8");
    keyboard = fs.readFileSync(keyboardPath, "utf-8");
    router = fs.readFileSync(routerPath, "utf-8");
    service = fs.readFileSync(servicePath, "utf-8");
    routers = fs.readFileSync(routersPath, "utf-8");
  });

  describe("HoldQueue workstation layout", () => {
    it("imports ReviewWorkstationPane and keyboard hook", () => {
      expect(holdQueue).toContain("ReviewWorkstationPane");
      expect(holdQueue).toContain("useReviewQueueKeyboard");
    });

    it("uses two-pane grid layout", () => {
      expect(holdQueue).toMatch(/lg:grid-cols-\[380px_1fr\]/);
    });

    it("has controlled search input", () => {
      expect(holdQueue).toContain("searchQuery");
      expect(holdQueue).toContain("setSearchQuery");
      expect(holdQueue).toMatch(/value=\{searchQuery\}/);
      expect(holdQueue).toMatch(/onChange=\{e => setSearchQuery/);
    });

    it("wires bulk approve with Promise.allSettled", () => {
      expect(holdQueue).toContain("handleBulkApprove");
      expect(holdQueue).toContain("Promise.allSettled");
      expect(holdQueue).toContain("auditActions.approveJobSheet");
    });

    it("does not register reviewQueueRouter", () => {
      expect(routers).not.toContain("reviewQueueRouter");
      expect(holdQueue).not.toContain("reviewQueue.");
    });
  });

  describe("keyboard hook", () => {
    it("handles j/k/a/r shortcuts", () => {
      expect(keyboard).toContain('key === "j"');
      expect(keyboard).toContain('key === "k"');
      expect(keyboard).toContain('key === "a"');
      expect(keyboard).toContain('key === "r"');
      expect(keyboard).toContain("onNext");
      expect(keyboard).toContain("onPrev");
      expect(keyboard).toContain("onApprove");
      expect(keyboard).toContain("onReject");
    });

    it("skips editable targets", () => {
      expect(keyboard).toContain("isEditableTarget");
      expect(keyboard).toContain("TEXTAREA");
    });
  });

  describe("ReviewWorkstationPane", () => {
    it("includes PDF sync + PR-10 actions + bulk findings approve", () => {
      expect(pane).toContain('from "@/lib/pdfFindingSync"');
      expect(pane).toContain("auditActions.flag");
      expect(pane).toContain("auditActions.override");
      expect(pane).toContain("auditActions.bulkApprove");
      expect(pane).toContain("captureFieldCorrection");
    });

    it("exposes Correct value UI", () => {
      expect(pane).toContain("Correct value");
      expect(pane).toContain("correctionDialog");
    });

    it("wires BeforeAfterComparePane confirm/override to auditActions", () => {
      expect(pane).toContain("resolvePhotoPairFindings");
      expect(pane).toContain("onConfirmPair={handleConfirmPair}");
      expect(pane).toContain("onOverridePair={handleOverridePair}");
      expect(pane).toContain("auditActions.approve");
      expect(pane).toContain(
        'applyBeforeAfterPairAction(pairIndex, "approve")'
      );
      expect(pane).toContain(
        'applyBeforeAfterPairAction(pairIndex, "override")'
      );
    });

    it("uses ClinicalContextStack and composite outcome strip", () => {
      expect(pane).toContain("ClinicalContextStack");
      expect(pane).toContain("Needs review");
      expect(pane).toContain("ErrorBoundary");
      expect(pane).toContain("CommentFindingsGroup");
      expect(pane).toContain("PartsFindingsGroup");
      expect(pane).toContain("AttrFindingsGroup");
      expect(pane).toContain("PhotoEvidenceFindingsGroup");
      expect(pane).toContain('defaultValue="issues"');
      expect(pane).toContain('value="context"');
      expect(pane).toContain("hasActionableClinicalContext");
    });

    it("keeps override on a keyboard path with optimistic action feel", () => {
      expect(pane).toContain("@/lib/reviewActionFeel");
      expect(pane).toContain("nextOpenFindingId");
      expect(pane).toContain("scrollFindingIntoView");
      expect(pane).toContain("optimisticPassedIds");
      expect(pane).toContain("onActionReasonKeyDown");
      expect(pane).toContain("autoFocus");
      expect(pane).toContain('aria-keyshortcuts="Meta+Enter Control+Enter"');
      expect(pane).toContain('title="Override (o)"');
      expect(pane).toContain("focusWorkstationPane");
    });
  });

  describe("captureFieldCorrection API", () => {
    it("service exports captureFieldCorrection", () => {
      expect(service).toContain("export async function captureFieldCorrection");
      expect(service).toContain("FIELD_CORRECTION");
      expect(service).toContain("updateFindingSnippet");
    });

    it("router registers captureFieldCorrection", () => {
      expect(router).toContain("captureFieldCorrection:");
      expect(router).toContain("fieldCorrectionSupported: true");
    });

    it("does not invent a new migration for corrections", () => {
      const drizzleDir = path.join(root, "drizzle");
      const sqlFiles = fs
        .readdirSync(drizzleDir)
        .filter(f => f.endsWith(".sql"));
      for (const f of sqlFiles) {
        const content = fs.readFileSync(path.join(drizzleDir, f), "utf-8");
        expect(content.toLowerCase()).not.toContain("field_correction");
      }
    });
  });
  describe("DocumentViewer PDF iframe open params", () => {
    it("does not use Chromium-invalid zoom=page-width or focus= hash params", () => {
      expect(documentViewer).not.toMatch(/zoom=\$\{[^}]*page-width/);
      expect(documentViewer).not.toContain("zoom=page-width");
      expect(documentViewer).not.toMatch(/&focus=\$\{focusNonce\}/);
      expect(documentViewer).toContain("hashParts");
    });
  });
});

describe("BeforeAfterComparePane pair resolution", () => {
  const root = path.resolve(__dirname, "../../..");
  const beforeAfterPath = path.join(
    root,
    "client/src/components/review/BeforeAfterComparePane.tsx"
  );
  const src = fs.readFileSync(beforeAfterPath, "utf-8");

  it("exports resolvePhotoPairFindings for PHOTO-C012/C013 mapping", () => {
    expect(src).toContain("export function resolvePhotoPairFindings");
    expect(src).toContain("PHOTO-C012");
    expect(src).toContain("PHOTO-C013");
  });

  it("accepts onConfirmPair and onOverridePair callbacks", () => {
    expect(src).toContain("onConfirmPair?: (pairIndex: number) => void");
    expect(src).toContain("onOverridePair?: (pairIndex: number) => void");
  });
});
