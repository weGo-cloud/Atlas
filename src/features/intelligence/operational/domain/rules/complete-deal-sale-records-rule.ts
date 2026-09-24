import { PRIORITY_MAP, priorityFor } from "../priority";
import type { Recommendation } from "../recommendation";
import type { RecommendationRule } from "../recommendation-rule";

/**
 * Mission 022 — Section 7A/7B ("Completed Deal Without Sale"). The
 * highest-priority M022 rule (see priority.ts's PRIORITY_MAP
 * rationale) — an unrecorded transaction is a data-integrity gap the
 * moment it exists, regardless of how many there are. Deliberately
 * only ever *recommends* review; it never creates the Sale itself
 * (Section 7: "Do not automatically create the Sale").
 */
export const completeDealSaleRecordsRule: RecommendationRule = {
  type: "complete_deal_sale_records",
  sourceSignalType: "completed_deals_awaiting_sale",

  build(signal, generatedAt): Omit<Recommendation, "affectedEntities"> {
    const priority = priorityFor(PRIORITY_MAP.completedDealsAwaitingSale, signal.severity);

    return {
      id: "complete_deal_sale_records",
      type: "complete_deal_sale_records",
      title: signal.title,
      summary: "One or more completed deals don't have a matching Sale record yet.",
      rationale:
        "A Deal reached \"completed\" status but Atlas has no Sale record for it — the transaction trail is incomplete. This doesn't affect the vehicle's status, only your transaction history, but it should be recorded promptly.",
      priority,
      evidence: signal.evidence,
      suggestedAction: { label: "Review the affected deal(s) and record the Sale", href: "/app/deals" },
      sourceSignal: signal.type,
      timeRange: signal.timeRange,
      confidence: { kind: "deterministic" },
      generatedAt,
    };
  },

  async resolveEntities(_signal, resolver) {
    return resolver.resolveDealsAwaitingSale();
  },
};
