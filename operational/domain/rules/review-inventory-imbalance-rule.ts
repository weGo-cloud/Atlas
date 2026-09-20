import { PRIORITY_MAP, priorityFor } from "../priority";
import type { Recommendation } from "../recommendation";
import type { RecommendationRule } from "../recommendation-rule";

/**
 * Mission 022 — Section 7E ("Inventory/Sales Imbalance"). Deliberately
 * makes no demand prediction and names no specific vehicle as
 * "unlikely to sell" (Section 7E is explicit that this belongs to a
 * future predictive mission, not M022). No `resolveEntities` — the
 * signal is a ratio over the whole available-inventory count, not a
 * bounded, individually-identifiable subset of vehicles.
 */
export const reviewInventoryImbalanceRule: RecommendationRule = {
  type: "review_inventory_imbalance",
  sourceSignalType: "inventory_oversupply",

  build(signal, generatedAt): Omit<Recommendation, "affectedEntities"> {
    const priority = priorityFor(PRIORITY_MAP.inventoryOversupply, signal.severity);

    return {
      id: "review_inventory_imbalance",
      type: "review_inventory_imbalance",
      title: signal.title,
      summary: "Available inventory is large relative to the recent sales pace.",
      rationale:
        "Current stock levels are high relative to how fast vehicles are selling in this period. Review inventory levels and pricing/marketing strategy for slower-moving stock.",
      priority,
      evidence: signal.evidence,
      suggestedAction: { label: "Review inventory", href: "/app/inventory" },
      sourceSignal: signal.type,
      timeRange: signal.timeRange,
      confidence: { kind: "deterministic" },
      generatedAt,
    };
  },
};
