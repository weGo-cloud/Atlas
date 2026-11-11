import type { Rule } from "../engine";
import type { Signal } from "../signal";
import { INTELLIGENCE_THRESHOLDS } from "../thresholds";

/**
 * Mission 026 — the deterministic vehicle-level counterpart to M021's
 * business-level `inventoryOversupplyRule`. Reads
 * `AnalyticsOverview.inventory.availableVehicleAgeDays` — a raw,
 * unfiltered array of ages M020 already computes (see
 * AnalyticsService.getInventoryMetrics) — and applies this rule's own
 * centralized threshold to it, the same "M020 provides facts, M021
 * applies thresholds" split every other rule in this file follows.
 *
 * Driven by the single *oldest* available vehicle's age: if the
 * oldest vehicle clears `warningAgeDays`, at least one vehicle
 * genuinely needs attention, regardless of how many others do too.
 * Escalates to CRITICAL only once the oldest vehicle clears
 * `criticalAgeDays` — vehicle *count* is carried as evidence, not
 * used to decide severity, so a business with one very old vehicle
 * and a business with five moderately-old ones are each judged on
 * their own worst case, not conflated.
 *
 * This is NOT a prediction. There is no model, no probability, no
 * claim that any specific vehicle "will not sell" — only a factual,
 * auditable statement of how long it has remained available
 * (Section 5/6 of this mission: a deterministic signal is not the
 * same thing as a vehicle-level prediction, and M023 has no such
 * prediction to reuse).
 */
export const vehicleSlowMovementRule: Rule = {
  evaluate(context, triggeredAt): Signal | null {
    const { warningAgeDays, criticalAgeDays } = INTELLIGENCE_THRESHOLDS.vehicleAttention;
    const ages = context.metrics.inventory.availableVehicleAgeDays;
    if (ages.length === 0) return null;

    const oldestAge = ages[0]; // already sorted oldest-first by the repository
    if (oldestAge < warningAgeDays) return null;

    const severity = oldestAge >= criticalAgeDays ? "CRITICAL" : "WARNING";
    const staleCount = ages.filter((age) => age >= warningAgeDays).length;

    return {
      id: "vehicle_slow_movement",
      type: "vehicle_slow_movement",
      severity,
      title:
        staleCount === 1
          ? "1 vehicle has been available for an extended period"
          : `${staleCount} vehicles have been available for an extended period`,
      summary:
        "These vehicles have remained available well past the usual review point. Longer time in inventory typically means higher holding cost and depreciation risk.",
      evidence: [
        {
          metric: "inventory.oldestAvailableVehicleAgeDays",
          label: "Oldest available vehicle — days in inventory",
          observedValue: Math.round(oldestAge),
          thresholdValue: severity === "CRITICAL" ? criticalAgeDays : warningAgeDays,
          comparison: "gte",
        },
        {
          metric: "inventory.staleAvailableVehicleCount",
          label: `Vehicles available ${warningAgeDays}+ days`,
          observedValue: staleCount,
        },
      ],
      sourceMetric: "inventory",
      timeRange: context.dateRange,
      confidence: { kind: "deterministic" },
      triggeredAt,
    };
  },
};
