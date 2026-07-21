/**
 * Phase 1.1 — documentProcessor is the sole job-sheet processing orchestrator.
 */

import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../../..");

function readRepoFile(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), "utf-8");
}

describe("documentProcessor orchestration contract", () => {
  it("exposes one orchestrator for primary and retry entrypoints", () => {
    const documentProcessor = readRepoFile(
      "server/services/documentProcessor.ts"
    );
    const router = readRepoFile("server/routers.ts");
    const deadLetterQueue = readRepoFile("server/utils/deadLetterQueue.ts");

    expect(documentProcessor).toContain(
      "export async function orchestrateJobSheetProcessing"
    );
    expect(router).toContain("orchestrateJobSheetProcessing");
    expect(router).not.toContain("processJobSheet(");
    expect(deadLetterQueue).toContain("orchestrateJobSheetProcessing");
    expect(deadLetterQueue).not.toContain("reprocessJobSheet(");
  });

  it("remints a fresh SAS from fileKey at orchestrate time", () => {
    const documentProcessor = readRepoFile(
      "server/services/documentProcessor.ts"
    );
    expect(documentProcessor).toContain("resolveDocumentUrlForProcessing");
    expect(documentProcessor).toContain("getStorageAdapter");
    expect(documentProcessor).toContain("fileKey");
  });

  it("keeps pipeline integration behind documentProcessor", () => {
    const documentProcessor = readRepoFile(
      "server/services/documentProcessor.ts"
    );
    const router = readRepoFile("server/routers.ts");
    const deadLetterQueue = readRepoFile("server/utils/deadLetterQueue.ts");

    expect(documentProcessor).toContain("processWithIntegration(");
    expect(router).not.toContain("processWithIntegration(");
    expect(deadLetterQueue).not.toContain("processWithIntegration(");
  });

  it("wires phase helper artifacts behind default-off feature flags", () => {
    const documentProcessor = readRepoFile(
      "server/services/documentProcessor.ts"
    );
    const router = readRepoFile("server/routers.ts");

    expect(documentProcessor).toContain("buildFlaggedProcessorArtifacts");
    expect(documentProcessor).toContain("isCalibrationEnabled()");
    expect(documentProcessor).toContain("isOpsAlertsEnabled()");
    expect(documentProcessor).toContain("isRiskRoutingEnabled()");
    expect(documentProcessor).toContain("isStageSloEnabled()");
    expect(documentProcessor).toContain("isTemplateCollisionEnabled()");
    expect(documentProcessor).toContain("isVlmVerificationEnabled()");
    expect(documentProcessor).toContain("verifySignatureInk");
    expect(documentProcessor).toContain("isGeminiMultimodalEnabled");
    expect(documentProcessor).toContain("feature artifact failed (non-fatal)");
    expect(documentProcessor).toContain("featureFlagArtifacts");
    expect(router).not.toContain("buildFlaggedProcessorArtifacts");
  });

  it("keeps raw OCR text out of persisted audit reports", () => {
    const documentProcessor = readRepoFile(
      "server/services/documentProcessor.ts"
    );
    const schema = readRepoFile("drizzle/schema.ts");
    const router = readRepoFile("server/routers.ts");

    // Each reportJson starts with compact OCR metadata, never the raw payload.
    expect(documentProcessor).not.toMatch(
      /reportJson:\s*\{[\s\S]{0,350}\n\s*extractedText\s*(?:,|:)/
    );
    expect(documentProcessor).toContain("persisted: false");
    expect(documentProcessor).toContain('source: "original_job_sheet"');
    expect(schema).toContain("excludes the full raw OCR text");
    expect(router).toContain("getFileUrl");
  });
});
