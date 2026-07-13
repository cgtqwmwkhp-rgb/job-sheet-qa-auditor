import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  ROI_LABEL_MEMORY_KEY,
  ensureSpecField,
  forgetRoiLabel,
  loadRememberedRoiLabels,
  rememberRoiLabel,
} from "../../../client/src/components/roiLabelMemory";

describe("roiLabelMemory", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
      clear: () => store.clear(),
    });
  });

  it("remembers labels across load cycles for the next template", () => {
    rememberRoiLabel({
      id: "makeModel",
      label: "Make/Model",
      color: "#0ea5e9",
      critical: false,
    });
    rememberRoiLabel({
      id: "siteAddress",
      label: "Site Address",
      color: "#14b8a6",
      critical: false,
    });

    const loaded = loadRememberedRoiLabels();
    expect(loaded.map(l => l.id)).toEqual(["siteAddress", "makeModel"]);
    expect(localStorage.getItem(ROI_LABEL_MEMORY_KEY)).toContain("makeModel");
  });

  it("upserts by id so field ids stay stable", () => {
    rememberRoiLabel({
      id: "serialNumber",
      label: "Serial",
      color: "#a855f7",
      critical: false,
    });
    rememberRoiLabel({
      id: "serialNumber",
      label: "Serial Number",
      color: "#a855f7",
      critical: true,
    });
    const loaded = loadRememberedRoiLabels();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].label).toBe("Serial Number");
    expect(loaded[0].critical).toBe(true);
  });

  it("injects a missing field into the current template specJson", () => {
    const next = ensureSpecField(
      JSON.stringify({ name: "T", version: "1", fields: [], rules: [] }),
      { field: "makeModel", label: "Make/Model", type: "string" }
    );
    expect(next).toBeTruthy();
    const parsed = JSON.parse(next!);
    expect(parsed.fields).toEqual([
      {
        field: "makeModel",
        label: "Make/Model",
        type: "string",
        required: false,
      },
    ]);
  });

  it("does not duplicate an existing field id", () => {
    const next = ensureSpecField(
      JSON.stringify({
        fields: [{ field: "makeModel", label: "Make/Model", type: "string" }],
      }),
      { field: "makeModel", label: "Make/Model" }
    );
    expect(next).toBeNull();
  });

  it("can forget a remembered label", () => {
    rememberRoiLabel({
      id: "x",
      label: "X",
      color: "#000",
      critical: false,
    });
    forgetRoiLabel("x");
    expect(loadRememberedRoiLabels()).toHaveLength(0);
  });
});
