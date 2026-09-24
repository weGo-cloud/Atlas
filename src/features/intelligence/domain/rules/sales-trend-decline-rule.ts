import type { Rule } from "../engine";
import type { Signal } from "../signal";
import { INTELLIGENCE_THRESHOLDS } from "../thresholds";

/**
 * Mission 021 — Section 4, "Weak/declining sales trend". Reads M020's
 * salesTrend buckets. Compares the most recent bucket's gross value
 * against the average of the prior buckets: a ratio below
 * `warningDeclineRatio` fires WARNING, below `criticalDeclineRatio`
 * fires CRITICAL.
 *
 * Deliberately does NOT fire when there's insufficient history
 * (Section 4: "do not manufacture a signal if the available data is
 * insufficient") — fewer than `minBucketsForTrend` points, or a prior
 * average of zero (nothing to decline from; that's "no sales history
 * yet", a different condition than "sales are declining").
 */
export const salesTrendDeclineRule: Rule = {
  evaluate(context, triggeredAt): Signal | null {
    const { minBucketsForTrend, warningDeclineRatio, criticalDeclineRatio } = INTELLIGENCE_THRESHOLDS.salesTrend;
    const points = context.metrics.salesTrend;
    if (points.length < minBucketsForTrend) return null;

    const latest = points[points.length - 1];
    const priorPoints = points.slice(0, -1);
    const priorAverage = priorPoints.reduce((sum, p) => sum + p.grossValue, 0) / priorPoints.length;
    if (priorAverage <= 0) return null;

    const ratio = latest.grossValue / priorAverage;
    if (ratio >= warningDeclineRatio) return null;

    const severity = ratio < criticalDeclineRatio ? "CRITICAL" : "WARNING";

    return {
      id: "declining_sales_trend",
      type: "declining_sales_trend",
      severity,
      title: `Sales dropped in the most recent period (${latest.periodLabel})`,
      summary: `The most recent sales bucket (${latest.periodLabel}) is well below the average of the ${priorPoints.length} preceding bucket${
        priorPoints.length === 1 ? "" : "s"
      } in this range — a decline, not just ordinary variation.`,
      evidence: [
        {
          metric: "salesTrend.latest.grossValue",
          label: `Gross sales value — ${latest.periodLabel}`,
          observedValue: latest.grossValue,
          thresholdValue: Math.round(priorAverage * (severity === "CRITICAL" ? criticalDeclineRatio : warningDeclineRatio)),
          comparison: "lt",
        },
        {
          metric: "salesTrend.priorAverage",
          label: `Average gross sales value — prior ${priorPoints.length} bucket${priorPoints.length === 1 ? "" : "s"}`,
          observedValue: Math.round(priorAverage),
        },
      ],
      sourceMetric: "salesTrend",
      timeRange: context.dateRange,
      confidence: { kind: "deterministic" },
      triggeredAt,
    };
  },
};
