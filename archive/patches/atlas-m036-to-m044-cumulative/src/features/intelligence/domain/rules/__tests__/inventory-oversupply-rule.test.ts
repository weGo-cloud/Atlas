import { describe, expect, it } from "vitest";

import { contextFrom, LAST_30_RANGE, ALL_TIME_RANGE } from "../../__tests__/fixtures";
import { inventoryOversupplyRule } from "../inventory-oversupply-rule";

const NOW = "2026-09-02T12:00:00.000Z";

// LAST_30_RANGE spans 30 days.
function ctx(availableVehicles: number, totalSales: number, dateRange = LAST_30_RANGE) {
  return contextFrom({
    dateRange,
    inventory: {
      totalVehicles: availableVehicles,
      availableVehicles,
      reservedVehicles: 0,
      soldVehicles: 0,
      vehiclesByStatus: { available: availableVehicles, reserved: 0, sold: 0 },
      currentInventoryValue: 0,
      availableVehicleAgeDays: [],
      availableVehicleAgeDaysWithoutActiveLead: [],
    },
    sales: {
      totalSales,
      grossSalesValue: 0,
      averageSaleValue: null,
      highestValueSale: null,
    },
  });
}

describe("inventoryOversupplyRule", () => {
  it("does not trigger below the minimum available-vehicle sample", () => {
    // 4 available, 1 sale in 30 days -> would be high days-of-supply, but sample too small
    expect(inventoryOversupplyRule.evaluate(ctx(4, 1), NOW)).toBeNull();
  });

  it("does not trigger on an open-ended range (no known span)", () => {
    expect(inventoryOversupplyRule.evaluate(ctx(50, 1, ALL_TIME_RANGE), NOW)).toBeNull();
  });

  it("does not trigger when sales pace is zero (nothing to compute a ratio against)", () => {
    expect(inventoryOversupplyRule.evaluate(ctx(50, 0), NOW)).toBeNull();
  });

  it("does not trigger when days-of-supply is below the warning threshold", () => {
    // 10 available, 10 sales in 30 days -> 0.333/day -> ~30 days of supply
    expect(inventoryOversupplyRule.evaluate(ctx(10, 10), NOW)).toBeNull();
  });

  it("triggers WARNING at/above the warning days-of-supply", () => {
    // 30 available, 10 sales in 30 days -> 0.333/day -> 90 days of supply
    const signal = inventoryOversupplyRule.evaluate(ctx(30, 10), NOW);
    expect(signal?.severity).toBe("WARNING");
  });

  it("escalates to CRITICAL at/above the critical days-of-supply", () => {
    // 60 available, 10 sales in 30 days -> 0.333/day -> 180 days of supply
    const signal = inventoryOversupplyRule.evaluate(ctx(60, 10), NOW);
    expect(signal?.severity).toBe("CRITICAL");
  });

  it("is deterministic", () => {
    const context = ctx(60, 10);
    expect(inventoryOversupplyRule.evaluate(context, NOW)).toEqual(inventoryOversupplyRule.evaluate(context, NOW));
  });
});
