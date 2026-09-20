import type { Rule } from "../engine";
import type { Signal } from "../signal";
import { INTELLIGENCE_THRESHOLDS } from "../thresholds";

/**
 * Mission 021 — Section 4, "Completed deals awaiting Sale records".
 * Reads M020's IntegrityMetrics directly (Section 4: "use the M020
 * metric rather than recreating transaction aggregation"). Not
 * date-ranged, same as the underlying metric — this is a "what needs
 * fixing right now" condition, not a historical count.
 */
export const completedDealsAwaitingSaleRule: Rule = {
  evaluate(context, triggeredAt): Signal | null {
    const observed = context.metrics.integrity.completedDealsAwaitingSale;
    const { warning, critical } = INTELLIGENCE_THRESHOLDS.completedDealsAwaitingSale;
    if (observed < warning) return null;

    const severity = observed >= critical ? "CRITICAL" : "WARNING";

    return {
      id: "completed_deals_awaiting_sale",
      type: "completed_deals_awaiting_sale",
      severity,
      title:
        observed === 1
          ? "1 completed deal has no Sale record"
          : `${observed} completed deals have no Sale record`,
      summary:
        "A Deal reached \"completed\" status but no corresponding Sale record exists yet. This is a gap in the transaction trail, not a sales problem — the vehicle is marked sold, but the sale itself was never recorded.",
      evidence: [
        {
          metric: "integrity.completedDealsAwaitingSale",
          label: "Completed deals awaiting a Sale record",
          observedValue: observed,
          thresholdValue: severity === "CRITICAL" ? critical : warning,
          comparison: "gte",
        },
      ],
      sourceMetric: "integrity",
      timeRange: context.dateRange,
      confidence: { kind: "deterministic" },
      triggeredAt,
    };
  },
};
