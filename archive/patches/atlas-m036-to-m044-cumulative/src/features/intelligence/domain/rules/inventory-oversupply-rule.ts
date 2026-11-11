import { rangeSpanDays } from "../../../analytics/domain/date-range";
import type { Rule } from "../engine";
import type { Signal } from "../signal";
import { INTELLIGENCE_THRESHOLDS } from "../thresholds";

/**
 * Mission 021 — Section 4, "Inventory/sales imbalance". "Days of
 * supply" = available vehicles ÷ (sales in range ÷ span days) — how
 * long current stock would last at the observed sales pace. Only
 * evaluated when the range has a known, sufficiently long span (an
 * open-ended range has no denominator; a very short one makes the
 * daily rate too noisy) and inventory is large enough that the ratio
 * is meaningful (Section 4: "do not create speculative signals").
 */
export const inventoryOversupplyRule: Rule = {
  evaluate(context, triggeredAt): Signal | null {
    const { minAvailableVehicles, minSpanDays, warningDaysOfSupply, criticalDaysOfSupply } =
      INTELLIGENCE_THRESHOLDS.inventoryOversupply;

    const available = context.metrics.inventory.availableVehicles;
    if (available < minAvailableVehicles) return null;

    const spanDays = rangeSpanDays(context.dateRange);
    if (spanDays === null || spanDays < minSpanDays) return null;

    const salesInRange = context.metrics.sales.totalSales;
    const salesPerDay = salesInRange / spanDays;
    if (salesPerDay <= 0) return null;

    const daysOfSupply = available / salesPerDay;
    if (daysOfSupply < warningDaysOfSupply) return null;

    const severity = daysOfSupply >= criticalDaysOfSupply ? "CRITICAL" : "WARNING";

    return {
      id: "inventory_oversupply",
      type: "inventory_oversupply",
      severity,
      title: `Current inventory would take about ${Math.round(daysOfSupply)} days to sell at the recent pace`,
      summary:
        "Available inventory is large relative to how fast vehicles are actually selling in this period. Left unaddressed, this ties up capital in stock that's moving slower than the business is used to.",
      evidence: [
        {
          metric: "inventory.availableVehicles",
          label: "Available vehicles",
          observedValue: available,
        },
        {
          metric: "sales.totalSales",
          label: "Sales in selected period",
          observedValue: salesInRange,
        },
        {
          metric: "daysOfSupply",
          label: "Estimated days of supply",
          observedValue: Math.round(daysOfSupply),
          thresholdValue: severity === "CRITICAL" ? criticalDaysOfSupply : warningDaysOfSupply,
          comparison: "gte",
        },
      ],
      sourceMetric: "inventory",
      timeRange: context.dateRange,
      confidence: { kind: "deterministic" },
      triggeredAt,
    };
  },
};
