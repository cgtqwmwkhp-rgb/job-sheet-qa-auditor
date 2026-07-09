/**
 * Processing Progress Contract Tests (PR-11)
 *
 * Mocks-only: live store + percent/stage helpers + toast copy.
 * No live OCR/LLM or browser E2E.
 */

import { describe, it, expect, beforeEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  PIPELINE_STAGE_LABELS,
  buildStatusOnlyView,
  completionToastCopy,
  derivePercentComplete,
  isActiveJobSheetStatus,
  isTerminalJobSheetStatus,
  normalizeReportStages,
} from "../../../shared/processingProgress";
import {
  beginProcessingProgress,
  clearProcessingProgressStore,
  finishProcessingProgress,
  getLiveProcessingProgress,
  markStageComplete,
  markStageRunning,
  syncStagesFromProcessor,
} from "../../services/processingProgressStore";

describe("PR-11 processing progress helpers", () => {
  it("classifies active vs terminal job sheet statuses", () => {
    expect(isActiveJobSheetStatus("pending")).toBe(true);
    expect(isActiveJobSheetStatus("processing")).toBe(true);
    expect(isActiveJobSheetStatus("completed")).toBe(false);
    expect(isTerminalJobSheetStatus("completed")).toBe(true);
    expect(isTerminalJobSheetStatus("review_queue")).toBe(true);
    expect(isTerminalJobSheetStatus("failed")).toBe(true);
    expect(isTerminalJobSheetStatus("processing")).toBe(false);
  });

  it("normalizes report stages into canonical pipeline labels", () => {
    const stages = normalizeReportStages([
      {
        stage: "OCR Text Extraction",
        status: "success",
        durationMs: 120,
      },
      {
        stage: "AI Analysis",
        status: "success",
        durationMs: 400,
      },
    ]);
    expect(stages[0].stage).toBe("Upload");
    expect(stages[0].status).toBe("success");
    expect(stages.find(s => s.stage === "OCR Text Extraction")?.status).toBe(
      "success"
    );
    expect(stages.find(s => s.stage === "Template Selection")?.status).toBe(
      "pending"
    );
    expect(stages.find(s => s.stage === "AI Analysis")?.status).toBe("success");
  });

  it("derives percent complete from stage weights", () => {
    const stages = PIPELINE_STAGE_LABELS.map((stage, i) => ({
      stage,
      status:
        i < 2
          ? ("success" as const)
          : i === 2
            ? ("running" as const)
            : ("pending" as const),
    }));
    const pct = derivePercentComplete(stages, "processing");
    expect(pct).toBeGreaterThan(30);
    expect(pct).toBeLessThan(100);
    expect(derivePercentComplete(stages, "completed")).toBe(100);
  });

  it("builds status-only views for pending/processing", () => {
    const pending = buildStatusOnlyView(1, "pending");
    expect(pending.source).toBe("status_only");
    expect(pending.percentComplete).toBe(0);

    const processing = buildStatusOnlyView(2, "processing");
    expect(processing.currentStage).toBe("OCR Text Extraction");
    expect(processing.stages.some(s => s.status === "running")).toBe(true);
  });

  it("returns completion toast copy for terminal statuses", () => {
    expect(completionToastCopy("completed", "a.pdf").type).toBe("success");
    expect(completionToastCopy("review_queue", "a.pdf").type).toBe("warning");
    expect(completionToastCopy("failed", "a.pdf").type).toBe("error");
  });
});

describe("PR-11 live processing progress store", () => {
  beforeEach(() => {
    clearProcessingProgressStore();
  });

  it("tracks begin → stage sync → finish", () => {
    beginProcessingProgress(42);
    let view = getLiveProcessingProgress(42);
    expect(view?.status).toBe("processing");
    expect(view?.source).toBe("live");
    expect(view?.stages.find(s => s.stage === "Upload")?.status).toBe(
      "success"
    );

    markStageRunning(42, "OCR Text Extraction");
    syncStagesFromProcessor(
      42,
      [
        {
          stage: "OCR Text Extraction",
          status: "success",
          durationMs: 50,
        },
      ],
      "Template Selection"
    );
    view = getLiveProcessingProgress(42);
    expect(view?.currentStage).toBe("Template Selection");
    expect(
      view?.stages.find(s => s.stage === "OCR Text Extraction")?.status
    ).toBe("success");
    expect(
      view?.stages.find(s => s.stage === "Template Selection")?.status
    ).toBe("running");

    markStageComplete(42, "Template Selection", "success", 10);
    finishProcessingProgress(42, "completed", [
      {
        stage: "OCR Text Extraction",
        status: "success",
        durationMs: 50,
      },
      {
        stage: "Template Selection",
        status: "success",
        durationMs: 10,
      },
      {
        stage: "Ensemble Extraction",
        status: "skipped",
        durationMs: 0,
      },
      {
        stage: "AI Analysis",
        status: "success",
        durationMs: 100,
      },
      {
        stage: "Store Results",
        status: "success",
        durationMs: 5,
      },
    ]);
    view = getLiveProcessingProgress(42);
    expect(view?.status).toBe("completed");
    expect(view?.percentComplete).toBe(100);
  });
});

describe("PR-11 wiring contract (source presence)", () => {
  const root = process.cwd();

  it("exposes jobSheets.processStatus on the tRPC router", () => {
    const content = fs.readFileSync(
      path.join(root, "server/routers.ts"),
      "utf-8"
    );
    expect(content).toMatch(/processStatus:\s*protectedProcedure/);
    expect(content).toContain("resolveProcessStatus");
  });

  it("documentProcessor syncs live progress", () => {
    const content = fs.readFileSync(
      path.join(root, "server/services/documentProcessor.ts"),
      "utf-8"
    );
    expect(content).toContain("beginProcessingProgress");
    expect(content).toContain("syncStagesFromProcessor");
    expect(content).toContain("finishProcessingProgress");
    expect(content).toContain("recordStage");
  });

  it("Upload page polls and watches processing", () => {
    const content = fs.readFileSync(
      path.join(root, "client/src/pages/Upload.tsx"),
      "utf-8"
    );
    expect(content).toContain("watchJobSheetsProcessing");
    expect(content).toContain("ProcessingProgressPanel");
    expect(content).toContain("useJobSheetProcessStatus");
    expect(content).toContain("/audits?id=");
    expect(content).not.toContain("Mistral OCR → Gemini Analysis");
    expect(content).toContain("Gemini 3.1 Pro");
  });

  it("AuditResults shows live progress for in-flight deep links", () => {
    const content = fs.readFileSync(
      path.join(root, "client/src/pages/AuditResults.tsx"),
      "utf-8"
    );
    expect(content).toContain("isActiveJobSheetStatus");
    expect(content).toContain("ProcessingProgressPanel");
    expect(content).toContain("useJobSheetProcessStatus");
  });

  it("App mounts the processing watchdog", () => {
    const content = fs.readFileSync(
      path.join(root, "client/src/App.tsx"),
      "utf-8"
    );
    expect(content).toContain("useProcessingWatchdog");
    expect(content).toContain("ProcessingWatchdog");
  });
});
