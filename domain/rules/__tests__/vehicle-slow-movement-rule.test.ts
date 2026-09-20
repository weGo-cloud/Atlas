import { describe, expect, it } from "vitest";

import { contextFrom } from "../../__tests__/fixtures";
import { vehicleSlowMovementRule } from "../vehicle-slow-movement-rule";

const NOW = "2026-09-02T12:00:00.000Z";

function ctx(availableVehicleAgeDays: number[]) {
  return contextFrom({
    inventory: {
      totalVehicles: availableVehicleAgeDays.length,
      availableVehicles: availableVehicleAgeDays.length,
      reservedVehicles: 0,
      soldVehicles: 0,
      vehiclesByStatus: { available: availableVehicleAgeDays.length, reserved: 0, sold: 0 },
      currentInventoryValue: 0,
      availableVehicleAgeDays,
      availableVehicleAgeDaysWithoutActiveLead: [],
    },
  });
}

describe("vehicleSlowMovementRule", () => {
  it("does not trigger when there are no available vehicles", () => {
    expect(vehicleSlowMovementRule.evaluate(ctx([]), NOW)).toBeNull();
  });

  it("does not trigger when every vehicle is below the warning threshold (60 days)", () => {
    expect(vehicleSlowMovementRule.evaluate(ctx([59, 10, 3]), NOW)).toBeNull();
  });

  it("triggers WARNING exactly at the warning threshold (60 days)", () => {
    const signal = vehicleSlowMovementRule.evaluate(ctx([60, 10]), NOW);
    expect(signal?.severity).toBe("WARNING");
    expect(signal?.type).toBe("vehicle_slow_movement");
  });

  it("stays WARNING just below the critical threshold (89 days)", () => {
    expect(vehicleSlowMovementRule.evaluate(ctx([89]), NOW)?.severity).toBe("WARNING");
  });

  it("escalates to CRITICAL exactly at the critical threshold (90 days)", () => {
    expect(vehicleSlowMovementRule.evaluate(ctx([90]), NOW)?.severity).toBe("CRITICAL");
  });

  it("is driven by the single oldest vehicle, not the average", () => {
    // One very old vehicle among several fresh ones still triggers CRITICAL.
    const signal = vehicleSlowMovementRule.evaluate(ctx([95, 5, 2, 1]), NOW);
    expect(signal?.severity).toBe("CRITICAL");
  });

  it("counts only vehicles at/above the warning threshold in the stale-count evidence", () => {
    const signal = vehicleSlowMovementRule.evaluate(ctx([95, 70, 10, 5]), NOW)!;
    const staleCountEvidence = signal.evidence.find((e) => e.metric === "inventory.staleAvailableVehicleCount");
    expect(staleCountEvidence?.observedValue).toBe(2);
  });

  it("carries the oldest age as the primary evidence value", () => {
    const signal = vehicleSlowMovementRule.evaluate(ctx([95, 10]), NOW)!;
    const ageEvidence = signal.evidence.find((e) => e.metric === "inventory.oldestAvailableVehicleAgeDays");
    expect(ageEvidence?.observedValue).toBe(95);
  });

  it("does not claim a prediction — confidence is always deterministic", () => {
    const signal = vehicleSlowMovementRule.evaluate(ctx([90]), NOW)!;
    expect(signal.confidence).toEqual({ kind: "deterministic" });
  });

  it("is deterministic", () => {
    const context = ctx([90, 20]);
    expect(vehicleSlowMovementRule.evaluate(context, NOW)).toEqual(vehicleSlowMovementRule.evaluate(context, NOW));
  });
});
