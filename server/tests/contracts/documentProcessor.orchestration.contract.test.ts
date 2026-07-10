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
});
