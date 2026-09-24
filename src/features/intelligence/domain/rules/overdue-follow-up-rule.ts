import type { Rule } from "../engine";
import type { Signal } from "../signal";
import { INTELLIGENCE_THRESHOLDS } from "../thresholds";

/**
 * Mission 021 — Section 4, "Overdue follow-up pressure". Reads M020's
 * FollowUpMetrics, which is itself unranged (a follow-up is overdue
 * relative to *now*, not to the selected reporting period) — this
 * rule inherits that same "right now" framing rather than filtering
 * it by the context's dateRange.
 */
export const overdueFollowUpRule: Rule = {
  evaluate(context, triggeredAt): Signal | null {
    const observed = context.metrics.followUps.overdueFollowUps;
    const { warning, critical } = INTELLIGENCE_THRESHOLDS.overdueFollowUps;
    if (observed < warning) return null;

    const severity = observed >= critical ? "CRITICAL" : "WARNING";

    return {
      id: "overdue_follow_up_pressure",
      type: "overdue_follow_up_pressure",
      severity,
      title:
        observed === 1
          ? "1 lead has an overdue follow-up"
          : `${observed} leads have an overdue follow-up`,
      summary:
        "These are active leads whose scheduled follow-up date has already passed. Overdue follow-ups tend to compound — the longer a lead waits, the more likely it goes cold.",
      evidence: [
        {
          metric: "followUps.overdueFollowUps",
          label: "Overdue follow-ups",
          observedValue: observed,
          thresholdValue: severity === "CRITICAL" ? critical : warning,
          comparison: "gte",
        },
        {
          metric: "followUps.activeLeadsWithoutFollowUp",
          label: "Active leads with no follow-up scheduled at all",
          observedValue: context.metrics.followUps.activeLeadsWithoutFollowUp,
        },
      ],
      sourceMetric: "followUps",
      timeRange: context.dateRange,
      confidence: { kind: "deterministic" },
      triggeredAt,
    };
  },
};
