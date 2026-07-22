/**
 * Form-family selection catalogs (PR4 / PX-105).
 * Ford / Gas / Generator / Trailer / UKPN / LOLER — selection-token packs.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  resetRegistry,
  resetFixtureStore,
  getTemplateBySlug,
  getTemplate,
  getActiveVersion,
  checkActivationPreconditions,
  initializeFormFamilySelectionCatalogs,
  FORM_FAMILY_CATALOG_SLUGS,
} from "../../services/templateRegistry";
import { selectTemplate } from "../../services/templateSelector";

describe("Form-family selection catalogs (PR4)", () => {
  beforeEach(() => {
    resetRegistry();
    resetFixtureStore();
  });

  it("seeds all six form-family catalogs and activates them", () => {
    const result = initializeFormFamilySelectionCatalogs();
    expect(result.seeded.length).toBe(FORM_FAMILY_CATALOG_SLUGS.length);

    for (const slug of FORM_FAMILY_CATALOG_SLUGS) {
      const t = getTemplateBySlug(slug);
      expect(t, slug).toBeTruthy();
      const active = getActiveVersion(t!.id);
      expect(active, slug).toBeTruthy();
      const expectedVersion =
        slug === "loler-examination-v1" ? "1.3.0" : "1.0.0";
      expect(active!.version).toBe(expectedVersion);

      const gates = checkActivationPreconditions(
        active!.specJson,
        active!.selectionConfigJson,
        active!.roiJson
      );
      expect(
        gates.allowed,
        `${slug}: ${JSON.stringify(gates.blockingIssues)}`
      ).toBe(true);
      expect(
        gates.blockingIssues.some(
          i => i.code.startsWith("OVERSIZED") || i.code === "SINGLE_PAGE_BLOB"
        )
      ).toBe(false);
    }
  });

  it("is idempotent on second boot when versions match expected", () => {
    initializeFormFamilySelectionCatalogs();
    const again = initializeFormFamilySelectionCatalogs();
    expect(again.seeded).toEqual([]);
    expect(again.skipped.length).toBe(FORM_FAMILY_CATALOG_SLUGS.length);
  });

  it("LOLER 1.3.0 selectionConfig has empty requiredTokensAll and winch/lifting in any-of", () => {
    initializeFormFamilySelectionCatalogs();
    const t = getTemplateBySlug("loler-examination-v1");
    const active = t ? getActiveVersion(t.id) : null;
    expect(active?.version).toBe("1.3.0");
    const sel = active?.selectionConfigJson as {
      requiredTokensAll?: string[];
      requiredTokensAny?: string[];
    };
    expect(sel.requiredTokensAll ?? []).toEqual([]);
    expect(sel.requiredTokensAny).toEqual(
      expect.arrayContaining(["loler", "thorough", "winch", "lifting"])
    );
  });

  it("selects Ford / Gas / Trailer / LOLER by distinctive tokens", () => {
    initializeFormFamilySelectionCatalogs();

    const cases: Array<{ text: string; slug: string }> = [
      {
        text: "Ford Transit service commercial vehicle job reference FORD-100 asset id AB12CDE date 15/01/2024 engineer sign off",
        slug: "ford-service-v1",
      },
      {
        text: "Gas boiler service safety certificate job reference GAS-111 asset id BLR-001 date 2024-01-15 engineer sign off",
        slug: "gas-boiler-v1",
      },
      {
        text: "PlantExpand General Trailer service job reference TRL-200 asset id DV23TRL date 15/01/2024 tyre tread",
        slug: "trailer-service-v1",
      },
      {
        text: "LOLER thorough examination lifting equipment job reference LOL-77 asset id CRANE-1 date 15/01/2024",
        slug: "loler-examination-v1",
      },
      {
        text: "UKPN network power DNO job reference UKPN-55 asset id SUB-01 date 15/01/2024 engineer sign off",
        slug: "ukpn-v1",
      },
      {
        text: "Generator service backup power genset job reference GEN-123 asset id GEN-001 date 2024-01-15 engineer sign off",
        slug: "generator-service-v1",
      },
    ];

    for (const c of cases) {
      const selected = selectTemplate(c.text);
      expect(selected.selected, c.slug).toBe(true);
      const t = selected.templateId ? getTemplate(selected.templateId) : null;
      expect(t?.templateId, c.slug).toBe(c.slug);
    }
  });

  it("PX-108: LOLER jobReference is not required and LOLER-R001 is disabled", () => {
    initializeFormFamilySelectionCatalogs();

    const t = getTemplateBySlug("loler-examination-v1");
    expect(t).toBeTruthy();
    const active = getActiveVersion(t!.id);
    expect(active).toBeTruthy();

    const jobReferenceField = active!.specJson.fields.find(
      f => f.field === "jobReference"
    );
    expect(jobReferenceField?.required).toBe(false);

    const rule = active!.specJson.rules.find(r => r.ruleId === "LOLER-R001");
    expect(rule?.enabled).toBe(false);
  });
});
