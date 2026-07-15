/**
 * Field exact-match F1 gate Contract Tests (Wave-4 A3)
 *
 * Fixtures only — no live OCR, DB, or network.
 * Proves honest unavailable when N is insufficient and live gate when ready.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import type { FieldObservation } from "../../services/fieldF1Gate";

describe("Field-F1 Gate Contract (Wave-4 A3)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    delete process.env.FEATURE_FIELD_F1_GATE;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
    vi.resetModules();
  });

  describe("feature flag", () => {
    it("is disabled by default when FEATURE_FIELD_F1_GATE unset", async () => {
      const { isFieldF1GateEnabled } = await import(
        "../../services/fieldF1Gate"
      );
      expect(isFieldF1GateEnabled()).toBe(false);
    });

    it("is enabled when FEATURE_FIELD_F1_GATE=true", async () => {
      process.env.FEATURE_FIELD_F1_GATE = "true";
      const { isFieldF1GateEnabled } = await import(
        "../../services/fieldF1Gate"
      );
      expect(isFieldF1GateEnabled()).toBe(true);
    });
  });

  describe("measureFieldExactMatchF1 honesty", () => {
    it("returns measurementReady=false and f1=null when empty", async () => {
      const { measureFieldExactMatchF1 } = await import(
        "../../services/fieldF1Gate"
      );
      const metrics = measureFieldExactMatchF1([]);
      expect(metrics.measurementReady).toBe(false);
      expect(metrics.f1).toBeNull();
      expect(metrics.sampleCount).toBe(0);
      expect(metrics.note).toMatch(/cannot be measured/i);
    });

    it("returns unavailable provisional F1 when N is below threshold", async () => {
      const { measureFieldExactMatchF1, evaluateFieldF1Gate } = await import(
        "../../services/fieldF1Gate"
      );
      const observations: FieldObservation[] = Array.from(
        { length: 10 },
        (_, i) => ({
          documentId: `doc-${i}`,
          fieldId: "jobNumber",
          expected: `JS-${i}`,
          predicted: `JS-${i}`,
          severity: "S0",
        })
      );

      const metrics = measureFieldExactMatchF1(observations, 50);
      expect(metrics.measurementReady).toBe(false);
      expect(metrics.f1).toBeNull();
      expect(metrics.provisionalF1).toBe(1);

      const gate = evaluateFieldF1Gate(observations, {
        minSamplesRequired: 50,
        minExactMatchF1: 0.9,
      });
      expect(gate.status).toBe("unavailable");
      expect(gate.blockers.length).toBeGreaterThan(0);
    });

    it("passes when ready and F1 meets floor", async () => {
      const { evaluateFieldF1Gate } = await import(
        "../../services/fieldF1Gate"
      );
      const observations: FieldObservation[] = Array.from(
        { length: 50 },
        (_, i) => ({
          documentId: `doc-${i}`,
          fieldId: "jobNumber",
          expected: `JS-${i}`,
          predicted: i < 48 ? `JS-${i}` : "WRONG",
          severity: "S0",
        })
      );

      const gate = evaluateFieldF1Gate(observations, {
        minSamplesRequired: 50,
        minExactMatchF1: 0.9,
      });
      expect(gate.status).toBe("pass");
      expect(gate.metrics.measurementReady).toBe(true);
      expect(gate.metrics.f1).toBeGreaterThanOrEqual(0.9);
      expect(gate.blockers).toEqual([]);
    });

    it("fails when ready and F1 is below floor", async () => {
      const { evaluateFieldF1Gate } = await import(
        "../../services/fieldF1Gate"
      );
      const observations: FieldObservation[] = Array.from(
        { length: 50 },
        (_, i) => ({
          documentId: `doc-${i}`,
          fieldId: "jobNumber",
          expected: `JS-${i}`,
          predicted: i < 20 ? `JS-${i}` : "WRONG",
          severity: "S0",
        })
      );

      const gate = evaluateFieldF1Gate(observations, {
        minSamplesRequired: 50,
        minExactMatchF1: 0.9,
      });
      expect(gate.status).toBe("fail");
      expect(gate.metrics.measurementReady).toBe(true);
      expect(gate.metrics.f1).not.toBeNull();
      expect(gate.metrics.f1!).toBeLessThan(0.9);
    });
  });

  describe("labelled golden corpus", () => {
    it("has ≥50 labelled documents and passes the field-F1 gate", async () => {
      const { evaluateFieldF1Gate } = await import(
        "../../services/fieldF1Gate"
      );
      const fixturePath = path.join(
        process.cwd(),
        "parity/fixtures/field-f1-labelled.json"
      );
      const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8")) as {
        documentCount: number;
        minSamplesRequired: number;
        minExactMatchF1: number;
        observations: FieldObservation[];
      };

      expect(fixture.documentCount).toBeGreaterThanOrEqual(50);
      expect(fixture.observations.length).toBeGreaterThanOrEqual(50);

      const gate = evaluateFieldF1Gate(fixture.observations, {
        minSamplesRequired: fixture.minSamplesRequired,
        minExactMatchF1: fixture.minExactMatchF1,
      });
      expect(gate.status).toBe("pass");
      expect(gate.metrics.measurementReady).toBe(true);
    });
  });
});
