import { PRIORITY_MAP, priorityFor } from "../priority";
import type { Recommendation } from "../recommendation";
import type { RecommendationRule } from "../recommendation-rule";

/** Mission 022 — Section 7A ("Overdue Follow-ups"). */
export const reviewOverdueFollowUpsRule: RecommendationRule = {
  type: "review_overdue_follow_ups",
  sourceSignalType: "overdue_follow_up_pressure",

  build(signal, generatedAt): Omit<Recommendation, "affectedEntities"> {
    const priority = priorityFor(PRIORITY_MAP.overdueFollowUpPressure, signal.severity);

    return {
      id: "review_overdue_follow_ups",
      type: "review_overdue_follow_ups",
      title: signal.title,
      summary: "These leads have a scheduled follow-up date that has already passed.",
      rationale:
        "An overdue follow-up is a lead you already decided needed contact by a specific date. The longer it sits overdue, the more likely the opportunity goes cold.",
      priority,
      evidence: signal.evidence,
      suggestedAction: { label: "Review and complete overdue follow-ups", href: "/app/leads" },
      sourceSignal: signal.type,
      timeRange: signal.timeRange,
      confidence: { kind: "deterministic" },
      generatedAt,
    };
  },

  async resolveEntities(_signal, resolver, now) {
    return resolver.resolveOverdueFollowUpLeads(now);
  },
};
