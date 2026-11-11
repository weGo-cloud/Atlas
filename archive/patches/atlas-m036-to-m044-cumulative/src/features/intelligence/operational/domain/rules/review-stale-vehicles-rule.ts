import { PRIORITY_MAP, priorityFor } from "../priority";
import type { Recommendation } from "../recommendation";
import type { RecommendationRule } from "../recommendation-rule";

/**
 * Mission 026 — the entity-level counterpart to `review_inventory_imbalance`
 * (Section 8/9). Deliberately a separate recommendation type rather
 * than folded into `review_inventory_imbalance`, because the two
 * source signals answer different questions: `inventory_oversupply`
 * is a business-wide ratio with no individual vehicles to point at;
 * `vehicle_slow_movement` is specifically about which vehicles. Both
 * map to the same `INVENTORY_REVIEW` decision category (see
 * decision/domain/category.ts) without being merged into one
 * recommendation — M024's consolidation only merges decisions that
 * share both a category AND an affected entity, and the aggregate
 * recommendation has none, so the two coexist correctly.
 */
export const reviewStaleVehiclesRule: RecommendationRule = {
  type: "review_stale_vehicles",
  sourceSignalType: "vehicle_slow_movement",

  build(signal, generatedAt): Omit<Recommendation, "affectedEntities"> {
    const priority = priorityFor(PRIORITY_MAP.vehicleSlowMovement, signal.severity);

    return {
      id: "review_stale_vehicles",
      type: "review_stale_vehicles",
      title: signal.title,
      summary: "These vehicles have remained available well past the usual review point.",
      rationale:
        "Longer time in inventory typically means higher holding cost and depreciation risk. Review pricing, marketing, or other next steps for these vehicles.",
      priority,
      evidence: signal.evidence,
      suggestedAction: { label: "Review high-risk inventory", href: "/app/inventory" },
      sourceSignal: signal.type,
      timeRange: signal.timeRange,
      confidence: { kind: "deterministic" },
      generatedAt,
    };
  },

  async resolveEntities(_signal, resolver, now) {
    return resolver.resolveStaleVehicles(now);
  },
};
