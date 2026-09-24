import { PRIORITY_MAP, priorityFor } from "../priority";
import type { Recommendation } from "../recommendation";
import type { RecommendationRule } from "../recommendation-rule";

/** Mission 022 — Section 7C ("Weak Lead/Pipeline Condition") — the "excessive inactive pipeline" case. */
export const reviewStagnantPipelineRule: RecommendationRule = {
  type: "review_stagnant_pipeline",
  sourceSignalType: "stagnant_pipeline",

  build(signal, generatedAt): Omit<Recommendation, "affectedEntities"> {
    const priority = priorityFor(PRIORITY_MAP.stagnantPipeline, signal.severity);

    return {
      id: "review_stagnant_pipeline",
      type: "review_stagnant_pipeline",
      title: signal.title,
      summary: "Most leads created in this period are still active — neither won nor lost.",
      rationale:
        "A pipeline that mostly accumulates without resolving either way makes lead volume look busier than the business's actual throughput. Review these leads and move each toward a decision.",
      priority,
      evidence: signal.evidence,
      suggestedAction: { label: "Review inactive leads", href: "/app/leads" },
      sourceSignal: signal.type,
      timeRange: signal.timeRange,
      confidence: { kind: "deterministic" },
      generatedAt,
    };
  },

  async resolveEntities(signal, resolver) {
    return resolver.resolveStagnantPipelineLeads(signal.timeRange);
  },
};
