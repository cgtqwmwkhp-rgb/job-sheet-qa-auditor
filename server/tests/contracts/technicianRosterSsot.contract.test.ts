/**
 * PX-067/090: technician roster excludes attribution phantoms.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";

describe("technician roster SSOT (PX-067/090)", () => {
  const routers = readFileSync(
    path.resolve(import.meta.dirname, "../../routers.ts"),
    "utf8"
  );

  it("listTechnicians filters loginMethod attribution phantoms", () => {
    expect(routers).toContain('loginMethod !== "attribution"');
    expect(routers).toContain("listTechnicians");
  });

  it("attribution gap picker uses real roster only", () => {
    expect(routers).toContain(
      "match against real roster first; phantoms stay out of picker"
    );
    expect(routers).toContain(
      "real roster first so phantoms never shadow AAD technicians"
    );
  });
});
