import { describe, it, expect, afterEach } from "vitest";
import {
  evaluateHoldSla,
  isHoldSlaEnabled,
  DEFAULT_SLA_BY_SEVERITY,
} from "../../services/holdSla";

describe("holdSla", () => {
  const prev = process.env.FEATURE_HOLD_SLA;
  afterEach(() => {
    if (prev === undefined) delete process.env.FEATURE_HOLD_SLA;
    else process.env.FEATURE_HOLD_SLA = prev;
  });

  it("defaults flag off", () => {
    delete process.env.FEATURE_HOLD_SLA;
    expect(isHoldSlaEnabled()).toBe(false);
  });

  it("enables when FEATURE_HOLD_SLA=true", () => {
    process.env.FEATURE_HOLD_SLA = "true";
    expect(isHoldSlaEnabled()).toBe(true);
  });

  it("marks breached when age exceeds deadline", () => {
    const now = new Date("2026-07-09T12:00:00Z");
    const openedAt = new Date(now.getTime() - 5 * 60 * 60 * 1000);
    const status = evaluateHoldSla(
      { id: "h1", openedAt, severity: "S0" },
      { now }
    );
    expect(status.deadlineMs).toBe(DEFAULT_SLA_BY_SEVERITY.S0);
    expect(status.breached).toBe(true);
    expect(status.ageMs).toBe(5 * 60 * 60 * 1000);
  });

  it("not breached within SLA", () => {
    const now = new Date("2026-07-09T12:00:00Z");
    const openedAt = new Date(now.getTime() - 60 * 60 * 1000);
    const status = evaluateHoldSla(
      { id: "h2", openedAt, severity: "S1" },
      { now }
    );
    expect(status.breached).toBe(false);
  });

  it("uses unknown SLA when severity missing", () => {
    const now = new Date("2026-07-09T12:00:00Z");
    const openedAt = new Date(now.getTime() - 1000);
    const status = evaluateHoldSla({ id: "h3", openedAt }, { now });
    expect(status.deadlineMs).toBe(DEFAULT_SLA_BY_SEVERITY.unknown);
  });
});
