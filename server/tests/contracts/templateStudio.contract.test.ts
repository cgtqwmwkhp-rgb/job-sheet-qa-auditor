/**
 * Template Studio contract tests — R1/R2/R3 foundation.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { templateRouter } from "../../routers/templateRouter";
import {
  resetRegistry,
  getTemplateVersion,
} from "../../services/templateRegistry";
import { resetPromoteStore } from "../../services/templateStudio/promoteStore";
import { resetStudioSampleStore } from "../../services/templateStudio/sampleStore";
import {
  resetDryRunStore,
  seedAcknowledgedDryRunForTests,
} from "../../services/templateStudio/dryRunAudit";
import { router } from "../../_core/trpc";
import type { User } from "../../../drizzle/schema";

const testRouter = router({
  templates: templateRouter,
});

function createMockUser(
  role: "user" | "admin" | "qa_lead" = "user",
  id = 1
): User {
  return {
    id,
    openId: `test-user-${id}`,
    name: `Test User ${id}`,
    email: `test${id}@example.com`,
    loginMethod: "test",
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
}

function createCaller(role: "user" | "admin" | "qa_lead" = "user", id = 1) {
  const ctx = {
    req: {} as any,
    res: {} as any,
    user: createMockUser(role, id),
  };
  return testRouter.createCaller(ctx);
}

describe("Template Studio contracts", () => {
  beforeEach(() => {
    resetRegistry();
    resetPromoteStore();
    resetStudioSampleStore();
    resetDryRunStore();
  });

  it("allows qa_lead to createDraft with starter critical fields", async () => {
    const caller = createCaller("qa_lead");
    const { template, version } = await caller.templates.studio.createDraft({
      name: "Studio Form",
      selectionTokens: ["generator", "service"],
    });

    expect(template.status).toBe("draft");
    expect(version.specJson.fields.map(f => f.field)).toEqual(
      expect.arrayContaining([
        "jobReference",
        "assetId",
        "date",
        "engineerSignOff",
      ])
    );
    expect(
      version.selectionConfigJson.requiredTokensAny.length
    ).toBeGreaterThan(0);
  });

  it("blocks viewer from studio mutations", async () => {
    const caller = createCaller("user");
    await expect(
      caller.templates.studio.createDraft({ name: "Nope" })
    ).rejects.toThrow();
  });

  it("saveDraft updates in place for inactive versions", async () => {
    const caller = createCaller("qa_lead");
    const { version } = await caller.templates.studio.createDraft({
      name: "Editable",
    });
    const saved = await caller.templates.studio.saveDraft({
      versionId: version.id,
      changeNotes: "tweaked",
      selectionConfigJson: {
        requiredTokensAll: [],
        requiredTokensAny: ["unique-token-xyz"],
        optionalTokens: [],
      },
    });
    expect(saved.createdNew).toBe(false);
    expect(saved.version.id).toBe(version.id);
    expect(saved.version.selectionConfigJson.requiredTokensAny).toContain(
      "unique-token-xyz"
    );
  });

  it("activationReport reflects gates; activateStaging succeeds for starter draft", async () => {
    const caller = createCaller("admin");
    const { template, version } = await caller.templates.studio.createDraft({
      name: "Activate Me",
      selectionTokens: ["plantexpand-unique-activate"],
    });
    await caller.templates.studio.scaffoldFixtures({
      versionId: version.id,
      sampleText:
        "Job Reference JOB-1 Asset ID A-1 Date 01/01/2026 Engineer Sign-Off Jane",
    });
    const reportBefore = await caller.templates.studio.activationReport({
      versionId: version.id,
    });
    expect(reportBefore.preconditions.allowed).toBe(true);
    expect(reportBefore.dryRun.blocking).toBe(true);
    expect(reportBefore.allowed).toBe(false);

    await expect(
      caller.templates.studio.activateStaging({ versionId: version.id })
    ).rejects.toThrow(/DRY_RUN/);

    await seedAcknowledgedDryRunForTests({
      versionId: version.id,
      hashSha256: version.hashSha256,
      templateId: template.id,
      userId: 1,
    });

    const report = await caller.templates.studio.activationReport({
      versionId: version.id,
    });
    expect(report.preconditions.allowed).toBe(true);
    expect(report.dryRun.allowed).toBe(true);
    expect(report.allowed).toBe(true);

    const activated = await caller.templates.studio.activateStaging({
      versionId: version.id,
    });
    expect(activated.version.isActive).toBe(true);
    expect(getTemplateVersion(version.id)?.isActive).toBe(true);
  });

  it("acknowledgeDryRun rejects stale hash after draft change", async () => {
    const caller = createCaller("qa_lead");
    const { template, version } = await caller.templates.studio.createDraft({
      name: "Stale Dry",
      selectionTokens: ["stale-dry-token"],
    });
    await seedAcknowledgedDryRunForTests({
      versionId: version.id,
      hashSha256: version.hashSha256,
      templateId: template.id,
    });
    const saved = await caller.templates.studio.saveDraft({
      versionId: version.id,
      changeNotes: "change hash",
      selectionConfigJson: {
        requiredTokensAll: [],
        requiredTokensAny: ["stale-dry-token", "changed"],
        optionalTokens: [],
      },
    });
    await expect(
      caller.templates.studio.acknowledgeDryRun({
        versionId: saved.version.id,
        hashSha256: version.hashSha256,
      })
    ).rejects.toThrow(/DRY_RUN_STALE|DRY_RUN_REQUIRED/);
  });

  it("blocks direct activation on production APP_ENV", async () => {
    vi.stubEnv("APP_ENV", "production");
    const caller = createCaller("admin");
    const { version } = await caller.templates.studio.createDraft({
      name: "Prod Block",
      selectionTokens: ["prod-block-token"],
    });
    await caller.templates.studio.scaffoldFixtures({ versionId: version.id });
    await expect(
      caller.templates.studio.activateStaging({ versionId: version.id })
    ).rejects.toThrow(/blocked on production/i);
    vi.unstubAllEnvs();
  });

  it("proposeFromSample returns artifact without sample (starter path)", async () => {
    const caller = createCaller("qa_lead");
    const { version } = await caller.templates.studio.createDraft({
      name: "Propose",
    });
    const result = await caller.templates.studio.proposeFromSample({
      versionId: version.id,
      applyAccepted: true,
    });
    expect(result.proposal.fields.length).toBeGreaterThan(0);
    expect(result.proposal.proposedSpec.fields.map(f => f.field)).toEqual(
      expect.arrayContaining(["jobReference", "assetId"])
    );
    expect(result.appliedVersion).toBeTruthy();
  });

  it("quickStartFromSample creates draft, attaches sample, and proposes", async () => {
    const caller = createCaller("qa_lead");
    // Minimal PDF header bytes — sample store validates magic bytes for PDF
    const pdfBase64 = Buffer.from(
      "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n",
      "utf8"
    ).toString("base64");
    const result = await caller.templates.studio.quickStartFromSample({
      fileName: "new-form.pdf",
      fileType: "application/pdf",
      fileBase64: pdfBase64,
      name: "Quick Start Form",
      selectionTokens: ["quickstart", "form"],
    });
    expect(result.template.name).toBe("Quick Start Form");
    expect(result.version.id).toBeGreaterThan(0);
    expect(result.proposal.proposedSpec.fields.map(f => f.field)).toEqual(
      expect.arrayContaining(["jobReference", "assetId"])
    );
    expect(result.sampleUrl).toContain(
      `/api/template-samples/${result.version.id}`
    );
    expect(result.meta.fileHash).toBeTruthy();
  });

  it("dual-control promote blocks self-approve", async () => {
    const author = createCaller("qa_lead", 10);
    const { template, version } = await author.templates.studio.createDraft({
      name: "Promote Me",
      selectionTokens: ["promote-unique-token"],
    });
    await author.templates.studio.scaffoldFixtures({ versionId: version.id });
    await seedAcknowledgedDryRunForTests({
      versionId: version.id,
      hashSha256: version.hashSha256,
      templateId: template.id,
      userId: 10,
    });
    await author.templates.studio.activateStaging({ versionId: version.id });
    const req = await author.templates.studio.requestPromote({
      versionId: version.id,
      smokeJobSheetIds: [42],
    });
    expect(req.status).toBe("pending");
    expect(req.pack.integrityHash).toBeTruthy();

    await expect(
      author.templates.studio.approvePromote({ promoteId: req.id })
    ).rejects.toThrow(/self-approve/i);

    const approver = createCaller("admin", 20);
    const approved = await approver.templates.studio.approvePromote({
      promoteId: req.id,
    });
    expect(approved.request?.status).toBe("approved");
    expect(approved.applied).toBeNull();
  });

  it("diffVersions reports field changes", async () => {
    const caller = createCaller("qa_lead");
    const { template, version } = await caller.templates.studio.createDraft({
      name: "Diff A",
    });
    const v2 = await caller.templates.uploadVersion({
      templateId: template.id,
      version: "0.2.0",
      specJson: {
        ...version.specJson,
        version: "0.2.0",
        fields: [
          ...version.specJson.fields,
          {
            field: "siteName",
            label: "Site Name",
            type: "string",
            required: false,
          },
        ],
      },
      selectionConfigJson: version.selectionConfigJson,
    });
    const diff = await caller.templates.studio.diffVersions({
      fromVersionId: version.id,
      toVersionId: v2.id,
    });
    expect(diff.summary.fieldChanges).toBeGreaterThan(0);
    expect(diff.entries.some(e => e.path.includes("siteName"))).toBe(true);
  });
});
