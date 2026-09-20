import { PRIORITY_MAP, priorityFor } from "../priority";
import type { Recommendation } from "../recommendation";
import type { RecommendationRule } from "../recommendation-rule";

/**
 * Mission 027 — interprets the `stale_vehicle_no_active_lead` signal,
 * Atlas's first cross-entity condition. Deliberately its own
 * recommendation type, not folded into `review_stale_vehicles`
 * (Section 10): "vehicle is stale" and "vehicle is stale AND has no
 * active lead" are different operational decisions with different
 * urgency, and collapsing them would lose that distinction. Both
 * still map to the same `INVENTORY_REVIEW` category (see
 * decision/domain/category.ts) — M024's consolidation only merges
 * decisions sharing both category AND an affected entity, so a
 * vehicle that qualifies for both rules correctly consolidates into
 * one decision rather than appearing twice, per the mission's own
 * Section 12 guidance to follow existing consolidation policy as-is.
 *
 * Language stays strictly operational (Section 10): no claim the
 * vehicle won't sell, no claim about the market, no demand or price
 * inference — only the two facts that fired the signal.
 */
export const reviewStaleVehiclesNoActiveLeadRule: RecommendationRule = {
  type: "review_stale_vehicles_no_active_lead",
  sourceSignalType: "stale_vehicle_no_active_lead",

  build(signal, generatedAt): Omit<Recommendation, "affectedEntities"> {
    const priority = priorityFor(PRIORITY_MAP.staleVehicleNoActiveLead, signal.severity);

    return {
      id: "review_stale_vehicles_no_active_lead",
      type: "review_stale_vehicles_no_active_lead",
      title: signal.title,
      summary:
        "These available vehicles have exceeded the inventory-attention threshold and currently have no active lead associated with them.",
      rationale:
        "There is no known commercial opportunity attached to these vehicles right now, on top of their extended time in inventory. Review their marketing, follow-up coverage, and inventory strategy.",
      priority,
      evidence: signal.evidence,
      suggestedAction: { label: "Review unengaged stale inventory", href: "/app/inventory" },
      sourceSignal: signal.type,
      timeRange: signal.timeRange,
      confidence: { kind: "deterministic" },
      generatedAt,
    };
  },

  async resolveEntities(_signal, resolver, now) {
    return resolver.resolveStaleVehiclesWithoutActiveLead(now);
  },
};
