import { describe, expect, it } from "vitest";

import { contextFrom } from "../../__tests__/fixtures";
import { staleVehicleNoActiveLeadRule } from "../stale-vehicle-no-active-lead-rule";

const NOW = "2026-09-02T12:00:00.000Z";

function ctx(availableVehicleAgeDaysWithoutActiveLead: number[]) {
  return contextFrom({
    inventory: {
      totalVehicles: availableVehicleAgeDaysWithoutActiveLead.length,
      availableVehicles: availableVehicleAgeDaysWithoutActiveLead.length,
      reservedVehicles: 0,
      soldVehicles: 0,
      vehiclesByStatus: {
        available: availableVehicleAgeDaysWithoutActiveLead.length,
        reserved: 0,
        sold: 0,
      },
      currentInventoryValue: 0,
      availableVehicleAgeDays: availableVehicleAgeDaysWithoutActiveLead,
      availableVehicleAgeDaysWithoutActiveLead,
    },
  });
}

describe("staleVehicleNoActiveLeadRule", () => {
  it("does not trigger when there are no unengaged available vehicles", () => {
    expect(staleVehicleNoActiveLeadRule.evaluate(ctx([]), NOW)).toBeNull();
  });

  it("does not trigger when every unengaged vehicle is below the warning threshold (60 days)", () => {
    expect(staleVehicleNoActiveLeadRule.evaluate(ctx([59, 10, 3]), NOW)).toBeNull();
  });

  it("triggers WARNING exactly at the warning threshold (60 days)", () => {
    const signal = staleVehicleNoActiveLeadRule.evaluate(ctx([60, 10]), NOW);
    expect(signal?.severity).toBe("WARNING");
    expect(signal?.type).toBe("stale_vehicle_no_active_lead");
  });

  it("stays WARNING just below the critical threshold (89 days)", () => {
    expect(staleVehicleNoActiveLeadRule.evaluate(ctx([89]), NOW)?.severity).toBe("WARNING");
  });

  it("escalates to CRITICAL exactly at the critical threshold (90 days)", () => {
    expect(staleVehicleNoActiveLeadRule.evaluate(ctx([90]), NOW)?.severity).toBe("CRITICAL");
  });

  it("is driven by the single oldest unengaged vehicle, not the average", () => {
    const signal = staleVehicleNoActiveLeadRule.evaluate(ctx([95, 5, 2, 1]), NOW);
    expect(signal?.severity).toBe("CRITICAL");
  });

  it("counts only vehicles at/above the warning threshold in the stale-count evidence", () => {
    const signal = staleVehicleNoActiveLeadRule.evaluate(ctx([95, 70, 10, 5]), NOW)!;
    const staleCountEvidence = signal.evidence.find(
      (e) => e.metric === "inventory.staleVehicleWithoutActiveLeadCount"
    );
    expect(staleCountEvidence?.observedValue).toBe(2);
  });

  it("carries the oldest age as the primary evidence value", () => {
    const signal = staleVehicleNoActiveLeadRule.evaluate(ctx([95, 10]), NOW)!;
    const ageEvidence = signal.evidence.find(
      (e) => e.metric === "inventory.oldestStaleVehicleWithoutActiveLeadAgeDays"
    );
    expect(ageEvidence?.observedValue).toBe(95);
  });

  it("always carries an active-lead-count evidence line of exactly 0", () => {
    const signal = staleVehicleNoActiveLeadRule.evaluate(ctx([90]), NOW)!;
    const activeLeadEvidence = signal.evidence.find(
      (e) => e.metric === "inventory.staleVehicleWithoutActiveLeadActiveLeadCount"
    );
    expect(activeLeadEvidence?.observedValue).toBe(0);
  });

  it("does not claim a prediction — confidence is always deterministic", () => {
    const signal = staleVehicleNoActiveLeadRule.evaluate(ctx([90]), NOW)!;
    expect(signal.confidence).toEqual({ kind: "deterministic" });
  });

  it("makes no market-value, demand, or sale-probability claim in its summary", () => {
    const signal = staleVehicleNoActiveLeadRule.evaluate(ctx([90]), NOW)!;
    const summary = signal.summary.toLowerCase();
    expect(summary).not.toContain("will not sell");
    expect(summary).not.toContain("market value");
    expect(summary).not.toContain("demand");
  });

  it("is deterministic", () => {
    const context = ctx([90, 20]);
    expect(staleVehicleNoActiveLeadRule.evaluate(context, NOW)).toEqual(
      staleVehicleNoActiveLeadRule.evaluate(context, NOW)
    );
  });
});
