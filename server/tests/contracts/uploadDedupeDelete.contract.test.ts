/**
 * PX-063/088: upload content-hash dedupe + orphan delete procedure.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const routersPath = path.resolve(import.meta.dirname, "../../routers.ts");

describe("upload dedupe + delete (PX-063/088)", () => {
  const src = readFileSync(routersPath, "utf8");

  it("dedupes uploads by content hash before creating orphan rows", () => {
    expect(src).toContain("findJobSheetByContentHash");
    expect(src).toContain("UPLOAD_JOB_SHEET_DEDUPED");
    expect(src).toContain("deduped: true");
  });

  it("exposes jobSheets.delete for pending/failed orphans", () => {
    expect(src).toContain("deleteJobSheetCascade");
    expect(src).toMatch(/delete:\s*qaLeadProcedure/);
    expect(src).toContain("Cannot delete a sheet that is currently processing");
  });

  it("Upload UI wires delete for stuck pending rows", () => {
    const uploadUi = readFileSync(
      path.resolve(import.meta.dirname, "../../../client/src/pages/Upload.tsx"),
      "utf8"
    );
    expect(uploadUi).toContain("jobSheets.delete");
    expect(uploadUi).toContain("Remove stuck / orphan upload");
    expect(uploadUi).toContain("matches an existing upload");
  });
});
