import { PRIORITY_MAP, priorityFor } from "../priority";
import type { Recommendation } from "../recommendation";
import type { RecommendationRule } from "../recommendation-rule";

/**
 * Mission 022 — Section 7C ("Weak Lead/Pipeline Condition") — the
 * "unusually weak conversion" case. Deliberately has no
 * `resolveEntities`: a low lead→deal conversion rate is a property of
 * the *whole* lead population in range, not a small, meaningfully
 * "affected" subset — nearly every non-converted lead would qualify,
 * which isn't a bounded, actionable list (Section 4: "where a signal
 * cannot safely identify individual entities, retain aggregate
 * evidence instead of fabricating entity references").
 */
export const reviewWeakLeadConversionRule: RecommendationRule = {
  type: "review_weak_lead_conversion",
  sourceSignalType: "weak_lead_conversion",

  build(signal, generatedAt): Omit<Recommendation, "affectedEntities"> {
    const priority = priorityFor(PRIORITY_MAP.weakLeadConversion, signal.severity);

    return {
      id: "review_weak_lead_conversion",
      type: "review_weak_lead_conversion",
      title: signal.title,
      summary: "A smaller share of leads than usual are turning into deals in this period.",
      rationale:
        "Low lead-to-deal conversion usually points to qualification, response time, or follow-through issues earlier in the pipeline. Review recent leads to see where the process is breaking down.",
      priority,
      evidence: signal.evidence,
      suggestedAction: { label: "Review the lead pipeline", href: "/app/leads" },
      sourceSignal: signal.type,
      timeRange: signal.timeRange,
      confidence: { kind: "deterministic" },
      generatedAt,
    };
  },
};
