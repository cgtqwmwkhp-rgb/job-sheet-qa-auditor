import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import path from "path";
import { getDb } from "../../db";
import { webhookEvents } from "../../services/webhooks";
import {
  assertTemplateRegistryMysqlProdContract,
  isTemplateMysqlPersistenceEnabled,
  loadTemplateRegistrySnapshotFromMysql,
  persistSelectionTraceArtifactToMysql,
  persistTemplateToMysql,
} from "../../services/templateRegistry/mysqlPersistence";
import {
  applyRegistrySnapshot,
  getActiveVersion,
  getRegistryStats,
  getTemplateBySlug,
  resetRegistry,
} from "../../services/templateRegistry/registryService";
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
    resetRegistry();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetRegistry();
  });

  it("skips template writes when the flag is off", async () => {
    vi.stubEnv("APP_ENV", "development");
    vi.stubEnv("NODE_ENV", "test");
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

  it("defaults MySQL persistence ON in fail-closed prod (ignores false)", () => {
    vi.stubEnv("APP_ENV", "production");
    vi.stubEnv("TEMPLATE_REGISTRY_MYSQL_PERSISTENCE_ENABLED", "false");
    expect(isTemplateMysqlPersistenceEnabled()).toBe(true);
  });

  it("assertTemplateRegistryMysqlProdContract warns without DATABASE_URL in prod", () => {
    vi.stubEnv("APP_ENV", "production");
    vi.stubEnv("DATABASE_URL", "");
    const result = assertTemplateRegistryMysqlProdContract();
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/DATABASE_URL/);
  });

  it("assertTemplateRegistryMysqlProdContract passes with DATABASE_URL in prod", () => {
    vi.stubEnv("APP_ENV", "production");
    vi.stubEnv("DATABASE_URL", "mysql://user:pass@localhost:3306/app");
    expect(assertTemplateRegistryMysqlProdContract()).toEqual({ ok: true });
  });

  it("loads registry snapshot from MySQL for boot hydrate", async () => {
    vi.stubEnv("TEMPLATE_REGISTRY_MYSQL_PERSISTENCE_ENABLED", "true");

    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: vi.fn(async () => [
            {
              id: 42,
              templateId: "custom-activation-v1",
              name: "Custom Activation",
              client: "Acme",
              assetType: null,
              workType: null,
              status: "active",
              description: "Survives recycle",
              createdBy: 7,
              createdAt: new Date("2026-01-01T00:00:00.000Z"),
              updatedAt: new Date("2026-01-02T00:00:00.000Z"),
            },
          ]),
        })
        .mockReturnValueOnce({
          from: vi.fn(async () => [
            {
              id: 99,
              templateId: 42,
              version: "2.0.0",
              hashSha256: "abc123",
              specJson: {
                name: "Custom",
                version: "2.0.0",
                fields: [],
                rules: [],
              },
              selectionConfigJson: {
                requiredTokensAll: ["custom"],
                requiredTokensAny: [],
                optionalTokens: [],
              },
              roiJson: null,
              isActive: true,
              changeNotes: "custom",
              createdBy: 7,
              createdAt: new Date("2026-01-01T00:00:00.000Z"),
            },
          ]),
        }),
    };
    getDbMock.mockResolvedValue(db as any);

    const snapshot = await loadTemplateRegistrySnapshotFromMysql();
    expect(snapshot).not.toBeNull();
    expect(snapshot!.templates).toHaveLength(1);
    expect(snapshot!.versions).toHaveLength(1);
    expect(snapshot!.templates[0].templateId).toBe("custom-activation-v1");
    expect(snapshot!.versions[0].isActive).toBe(true);
  });

  it("applyRegistrySnapshot restores custom activations after pod recycle (no seed)", () => {
    applyRegistrySnapshot({
      templates: [
        {
          id: 42,
          templateId: "custom-activation-v1",
          name: "Custom Activation",
          client: "Acme",
          assetType: null,
          workType: null,
          status: "active",
          description: "Survives recycle",
          createdBy: 7,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-01-02T00:00:00.000Z"),
        },
      ],
      versions: [
        {
          id: 99,
          templateId: 42,
          version: "2.0.0",
          hashSha256: "abc123",
          specJson: {
            name: "Custom",
            version: "2.0.0",
            fields: [],
            rules: [],
          },
          selectionConfigJson: {
            requiredTokensAll: ["custom"],
            requiredTokensAny: [],
            optionalTokens: [],
          },
          roiJson: null,
          isActive: true,
          changeNotes: "custom",
          createdBy: 7,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      ],
    });

    const stats = getRegistryStats();
    expect(stats.templates).toBe(1);
    expect(stats.versions).toBe(1);

    const template = getTemplateBySlug("custom-activation-v1");
    expect(template?.id).toBe(42);
    expect(template?.status).toBe("active");

    const active = getActiveVersion(42);
    expect(active?.id).toBe(99);
    expect(active?.version).toBe("2.0.0");
  });

  it("server boot hydrates template registry from MySQL before gold seeds", () => {
    const indexPath = path.resolve(__dirname, "../../_core/index.ts");
    const index = fs.readFileSync(indexPath, "utf-8");
    expect(index).toContain("hydrateTemplateRegistryFromMysql");
    expect(index).toContain("assertTemplateRegistryMysqlProdContract");
    const hydrateCallIdx = index.indexOf(
      "await hydrateTemplateRegistryFromMysql()"
    );
    const seedCallIdx = index.indexOf("initializeJobSummaryTemplate()");
    expect(hydrateCallIdx).toBeGreaterThan(-1);
    expect(seedCallIdx).toBeGreaterThan(hydrateCallIdx);
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
