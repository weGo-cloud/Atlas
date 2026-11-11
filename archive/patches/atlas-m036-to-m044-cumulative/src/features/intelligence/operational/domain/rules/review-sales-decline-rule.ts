import { PRIORITY_MAP, priorityFor } from "../priority";
import type { Recommendation } from "../recommendation";
import type { RecommendationRule } from "../recommendation-rule";

/**
 * Mission 022 — Section 7D ("Sales Decline / Weak Sales Trend").
 * Deliberately makes no causal claim — the rationale states only
 * that sales declined and suggests reviewing pipeline/follow-up
 * activity, never asserting *why* (Section 7D's explicit example of
 * what NOT to say: "Sales are declining because staff are not
 * following up" without evidence proving that link). No
 * `resolveEntities` — a trend decline is a property of the sales
 * bucket series as a whole, not a bounded set of individual records.
 */
export const reviewSalesDeclineRule: RecommendationRule = {
  type: "review_sales_decline",
  sourceSignalType: "declining_sales_trend",

  build(signal, generatedAt): Omit<Recommendation, "affectedEntities"> {
    const priority = priorityFor(PRIORITY_MAP.decliningSalesTrend, signal.severity);

    return {
      id: "review_sales_decline",
      type: "review_sales_decline",
      title: signal.title,
      summary: "Sales have declined during the observed period compared to the preceding periods.",
      rationale:
        "Sales have declined during the observed period. Review current sales performance, the affected period, and pipeline/follow-up activity to understand what changed.",
      priority,
      evidence: signal.evidence,
      suggestedAction: { label: "Review sales performance", href: "/app/analytics" },
      sourceSignal: signal.type,
      timeRange: signal.timeRange,
      confidence: { kind: "deterministic" },
      generatedAt,
    };
  },
};
