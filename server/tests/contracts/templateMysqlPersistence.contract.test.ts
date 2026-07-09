import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "../../db";
import { webhookEvents } from "../../services/webhooks";
import {
  persistSelectionTraceArtifactToMysql,
  persistTemplateToMysql,
} from "../../services/templateRegistry/mysqlPersistence";
import type { SelectionTraceArtifact } from "../../services/templateRegistry/selectionTraceWriter";
import type { SelectionResult } from "../../services/templateRegistry/types";

vi.mock("../../db", () => ({
  getDb: vi.fn(),
}));

vi.mock("../../services/webhooks", () => ({
  webhookEvents: {
    specActivated: vi.fn(async () => []),
    templateStored: vi.fn(async () => []),
    selectionTraceStored: vi.fn(async () => []),
  },
}));

const getDbMock = vi.mocked(getDb);
const webhookEventsMock = vi.mocked(webhookEvents);

describe("Template Registry MySQL Persistence - Phase 1.5", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("skips template writes when the flag is off", async () => {
    const result = await persistTemplateToMysql({
      id: 1,
      templateId: "phase-15-template",
      name: "Phase 1.5 Template",
      client: null,
      assetType: null,
      workType: null,
      status: "draft",
      description: null,
      createdBy: 1,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    expect(result).toEqual({ status: "skipped", reason: "flag_disabled" });
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it("upserts templates and emits store webhooks when enabled", async () => {
    vi.stubEnv("TEMPLATE_REGISTRY_MYSQL_PERSISTENCE_ENABLED", "true");
    vi.stubEnv("PERSISTENCE_STORE_WEBHOOKS_ENABLED", "true");

    const onDuplicateKeyUpdate = vi.fn(async () => undefined);
    const insertValues = vi.fn(() => ({ onDuplicateKeyUpdate }));
    const limit = vi.fn(async () => [
      { id: 42, templateId: "phase-15-template" },
    ]);
    const db = {
      insert: vi.fn(() => ({ values: insertValues })),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({ limit })),
        })),
      })),
    };
    getDbMock.mockResolvedValue(db as any);

    const result = await persistTemplateToMysql({
      id: 1,
      templateId: "phase-15-template",
      name: "Phase 1.5 Template",
      client: "Acme",
      assetType: "boiler",
      workType: "service",
      status: "active",
      description: "Persisted template",
      createdBy: 7,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    });

    expect(result).toEqual({ status: "stored", id: 42 });
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        templateId: "phase-15-template",
        name: "Phase 1.5 Template",
        status: "active",
        createdBy: 7,
      })
    );
    expect(onDuplicateKeyUpdate).toHaveBeenCalledWith({
      set: expect.objectContaining({
        name: "Phase 1.5 Template",
        status: "active",
      }),
    });
    expect(webhookEventsMock.templateStored).toHaveBeenCalledWith(
      42,
      expect.objectContaining({
        templateId: "phase-15-template",
        operation: "upsert",
      })
    );
  });

  it("stores selection traces with scores and token payloads", async () => {
    vi.stubEnv("SELECTION_TRACE_MYSQL_PERSISTENCE_ENABLED", "true");
    vi.stubEnv("PERSISTENCE_STORE_WEBHOOKS_ENABLED", "true");

    const insertValues = vi.fn(async () => [{ insertId: 77 }]);
    const db = {
      insert: vi.fn(() => ({ values: insertValues })),
    };
    getDbMock.mockResolvedValue(db as any);

    const trace: SelectionTraceArtifact = {
      artifactVersion: "1.0.0",
      timestamp: "2026-01-01T00:00:00.000Z",
      jobSheetId: 123,
      inputSignals: {
        tokenCount: 3,
        tokenSample: ["job", "sheet", "service"],
        documentLength: 42,
      },
      outcome: {
        selected: true,
        templateId: 9,
        versionId: 10,
        templateSlug: "phase-15-template",
        confidenceBand: "HIGH",
        topScore: 97.5,
        runnerUpScore: 40,
        scoreDelta: 57.5,
        autoProcessingAllowed: true,
        blockReason: null,
      },
      candidates: [
        {
          templateId: 9,
          templateSlug: "phase-15-template",
          versionId: 10,
          score: 97.5,
          confidence: "HIGH",
          matchedTokenCount: 3,
          missingRequiredCount: 0,
        },
      ],
    };
    const result: SelectionResult = {
      selected: true,
      templateId: 9,
      versionId: 10,
      confidenceBand: "HIGH",
      topScore: 97.5,
      runnerUpScore: 40,
      scoreGap: 57.5,
      candidates: [
        {
          templateId: 9,
          versionId: 10,
          templateSlug: "phase-15-template",
          score: 97.5,
          matchedTokens: ["job", "sheet", "service"],
          missingRequired: [],
          confidence: "HIGH",
        },
      ],
      matchedTokens: ["job", "sheet", "service"],
      autoProcessingAllowed: true,
    };

    const persisted = await persistSelectionTraceArtifactToMysql(trace, result);

    expect(persisted).toEqual({ status: "stored", id: 77 });
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        jobSheetId: 123,
        templateId: 9,
        versionId: 10,
        confidenceBand: "HIGH",
        topScore: "97.50",
        runnerUpScore: "40.00",
        scoreGap: "57.50",
        autoProcessingAllowed: true,
        tokensJson: expect.objectContaining({
          matchedTokens: ["job", "sheet", "service"],
        }),
      })
    );
    expect(webhookEventsMock.selectionTraceStored).toHaveBeenCalledWith(
      77,
      expect.objectContaining({
        jobSheetId: 123,
        templateId: 9,
        confidenceBand: "HIGH",
      })
    );
  });
});
