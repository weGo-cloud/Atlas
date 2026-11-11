import type { Rule } from "../engine";
import type { Signal } from "../signal";
import { INTELLIGENCE_THRESHOLDS } from "../thresholds";

/**
 * Mission 021 — Section 4, "Lead pipeline condition": two related but
 * distinct rules, both gated on a minimum lead sample so a handful of
 * leads can't produce a misleadingly extreme rate (Section 4: "only
 * implement rules whose inputs are already trustworthy").
 */

/** Unusually weak lead→deal conversion — leads aren't turning into deals at all. */
export const weakLeadConversionRule: Rule = {
  evaluate(context, triggeredAt): Signal | null {
    const { minLeads, warningRate, criticalRate } = INTELLIGENCE_THRESHOLDS.leadConversion;
    const { totalLeads, leadsWithDeals, leadToDealRate } = context.metrics.funnel;
    if (totalLeads < minLeads || leadToDealRate === null) return null;
    if (leadToDealRate >= warningRate) return null;

    const severity = leadToDealRate < criticalRate ? "CRITICAL" : "WARNING";

    return {
      id: "weak_lead_conversion",
      type: "weak_lead_conversion",
      severity,
      title: `Only ${Math.round(leadToDealRate * 100)}% of leads are converting to a deal`,
      summary:
        "Lead-to-deal conversion is well below what this volume of leads should typically produce. This usually points to qualification, response time, or follow-through issues earlier in the pipeline.",
      evidence: [
        {
          metric: "funnel.leadToDealRate",
          label: "Lead → deal conversion rate",
          observedValue: Math.round(leadToDealRate * 1000) / 1000,
          thresholdValue: severity === "CRITICAL" ? criticalRate : warningRate,
          comparison: "lt",
        },
        {
          metric: "funnel.totalLeads",
          label: "Total leads in range",
          observedValue: totalLeads,
        },
        {
          metric: "funnel.leadsWithDeals",
          label: "Leads that reached a deal",
          observedValue: leadsWithDeals,
        },
      ],
      sourceMetric: "funnel",
      timeRange: context.dateRange,
      confidence: { kind: "deterministic" },
      triggeredAt,
    };
  },
};

/** Excessive inactive pipeline — most leads are sitting in an open status rather than being decided (won/lost) either way. */
export const stagnantPipelineRule: Rule = {
  evaluate(context, triggeredAt): Signal | null {
    const { minLeads, warningActiveRatio, criticalActiveRatio } = INTELLIGENCE_THRESHOLDS.stagnantPipeline;
    const { totalLeads, activeLeads } = context.metrics.crm;
    if (totalLeads < minLeads) return null;

    const activeRatio = activeLeads / totalLeads;
    if (activeRatio < warningActiveRatio) return null;

    const severity = activeRatio >= criticalActiveRatio ? "CRITICAL" : "WARNING";

    return {
      id: "stagnant_pipeline",
      type: "stagnant_pipeline",
      severity,
      title: `${Math.round(activeRatio * 100)}% of leads in this period are still undecided`,
      summary:
        "Most leads created in this period haven't reached a decision (won or lost) yet. A pipeline that mostly accumulates without resolving either way makes lead volume look busier than the business's actual throughput.",
      evidence: [
        {
          metric: "crm.activeLeads",
          label: "Active (undecided) leads",
          observedValue: activeLeads,
        },
        {
          metric: "crm.totalLeads",
          label: "Total leads in range",
          observedValue: totalLeads,
        },
        {
          metric: "activeLeadRatio",
          label: "Share of leads still active",
          observedValue: Math.round(activeRatio * 1000) / 1000,
          thresholdValue: severity === "CRITICAL" ? criticalActiveRatio : warningActiveRatio,
          comparison: "gte",
        },
      ],
      sourceMetric: "crm",
      timeRange: context.dateRange,
      confidence: { kind: "deterministic" },
      triggeredAt,
    };
  },
};
