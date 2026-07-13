import { describe, it, expect } from "vitest";
import { getRoiDrawGuidance } from "../../../client/src/components/roiDrawGuidance";

describe("roiDrawGuidance", () => {
  it("tells authors to box label+value for jobReference", () => {
    const g = getRoiDrawGuidance("jobReference");
    expect(g.howToDraw.toLowerCase()).toMatch(/label/);
    expect(g.howToDraw.toLowerCase()).toMatch(/value/);
    expect(g.lookFor.toLowerCase()).toMatch(/job/);
  });

  it("requires full tickbox grid in one ROI", () => {
    const g = getRoiDrawGuidance("tickboxBlock");
    expect(g.howToDraw.toLowerCase()).toMatch(/whole grid/);
    expect(g.howToDraw.toLowerCase()).toMatch(/never one roi per column/);
  });

  it("uses measurement guidance for torque-like custom fields", () => {
    const g = getRoiDrawGuidance("wheelNutTorque", {
      label: "Wheel Nut Torque (NM)",
      fieldType: "number",
    });
    expect(g.howToDraw.toLowerCase()).toMatch(/number together/);
    expect(g.howToDraw.toLowerCase()).toMatch(/measurement check/);
  });
});
