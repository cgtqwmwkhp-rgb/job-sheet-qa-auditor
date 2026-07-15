/**
 * ECE measurement readiness Contract Tests (Wave-6 P5)
 */

import { describe, it, expect } from "vitest";
import {
  describeEceReadiness,
  ECE_MIN_SAMPLES,
} from "../../services/calibration";
import * as fs from "fs";
import * as path from "path";

describe("ECE Measurement Readiness Contract (Wave-6 P5)", () => {
  describe("describeEceReadiness", () => {
    it("returns disabled when calibration is off", () => {
      const result = describeEceReadiness({
        labelledCount: 500,
        calibrationEnabled: false,
      });
      expect(result.status).toBe("disabled");
      expect(result.ready).toBe(false);
      expect(result.minSamples).toBe(ECE_MIN_SAMPLES);
      expect(result.labelledCount).toBe(500);
    });

    it("returns insufficient below N≥200", () => {
      const result = describeEceReadiness({ labelledCount: 42 });
      expect(result.status).toBe("insufficient");
      expect(result.ready).toBe(false);
      expect(result.minSamples).toBe(200);
      expect(result.note).toContain("42/200");
    });

    it("returns ready at or above N≥200", () => {
      const result = describeEceReadiness({ labelledCount: 200 });
      expect(result.status).toBe("ready");
      expect(result.ready).toBe(true);
      expect(result.labelledCount).toBe(200);
    });
  });

  describe("calibration artifact wiring", () => {
    it("documentProcessor stamps eceReadiness on calibration artifact", () => {
      const processorPath = path.join(
        process.cwd(),
        "server/services/documentProcessor.ts"
      );
      const source = fs.readFileSync(processorPath, "utf-8");
      expect(source).toContain("describeEceReadiness");
      expect(source).toContain("eceReadiness");
    });
  });
});
