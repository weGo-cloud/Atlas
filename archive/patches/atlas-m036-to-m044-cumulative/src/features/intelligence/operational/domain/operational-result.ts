import type { ResolvedDateRange } from "../../../analytics/domain/date-range";
import type { Signal } from "../../domain/signal";
import { PRIORITIES, PRIORITY_RANK, type Priority } from "./priority";
import type { Recommendation } from "./recommendation";

/**
 * Mission 022 — Section 10. Deliberately structured the same way as
 * M021's IntelligenceResult (generatedAt/timeRange/items/summary) so
 * a future M023/M024 consumer already knows the shape. `signals` is
 * carried through unchanged from M021 — Section 11 ("allow the user
 * to understand the underlying M021 signal") needs the raw signal
 * available alongside the recommendations it produced, not just a
 * reference by id.
 */
export type OperationalSummary = {
  totalSignals: number;
  totalRecommendations: number;
  byPriority: Record<Priority, number>;
  highestPriority: Priority | null;
};

export type OperationalIntelligenceResult = {
  generatedAt: string;
  timeRange: ResolvedDateRange;
  recommendations: Recommendation[];
  signals: Signal[];
  summary: OperationalSummary;
};

export function composeOperationalResult(
  dateRange: ResolvedDateRange,
  signals: Signal[],
  recommendations: Recommendation[],
  generatedAt: string
): OperationalIntelligenceResult {
  const byPriority = Object.fromEntries(PRIORITIES.map((p) => [p, 0])) as Record<Priority, number>;
  for (const recommendation of recommendations) byPriority[recommendation.priority] += 1;

  const highestPriority = PRIORITY_RANK.find((priority) => byPriority[priority] > 0) ?? null;

  return {
    generatedAt,
    timeRange: dateRange,
    recommendations,
    signals,
    summary: {
      totalSignals: signals.length,
      totalRecommendations: recommendations.length,
      byPriority,
      highestPriority,
    },
  };
}
