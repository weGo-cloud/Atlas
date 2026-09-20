import type { AnalyticsOverview } from "../../analytics/domain/metrics";
import type { ResolvedDateRange } from "../../analytics/domain/date-range";

/**
 * Mission 021 — Section 2.
 *
 * Deliberately a thin wrapper around `AnalyticsOverview`, not a
 * hand-redeclared copy of its eight metric groups. AnalyticsOverview
 * is already the stable, database-implementation-free contract M020
 * built specifically so a future Intelligence module could depend on
 * it (see metrics.ts's own doc comment) — redeclaring those fields
 * here would just be a second copy that silently drifts out of sync
 * the next time Analytics changes. `metrics` is what every rule
 * reads from; `dateRange` is hoisted to the top level because rules
 * reference it directly and often (evidence timeRange, trend-bucket
 * reasoning) and repeating `context.metrics.dateRange` everywhere
 * would be noise.
 *
 * businessId is deliberately NOT a field here: the context is always
 * constructed from an already business-scoped AnalyticsOverview
 * (AnalyticsService is constructed with businessId server-side), so
 * there is no client-controlled business identity for a rule to
 * accidentally trust (Section 2 — "must not expose businessId as a
 * client-controlled authority").
 */
export type IntelligenceContext = {
  dateRange: ResolvedDateRange;
  metrics: AnalyticsOverview;
};

export function buildIntelligenceContext(overview: AnalyticsOverview): IntelligenceContext {
  return { dateRange: overview.dateRange, metrics: overview };
}
