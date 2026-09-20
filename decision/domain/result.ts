import type { ResolvedDateRange } from "../../../analytics/domain/date-range";
import type { Recommendation } from "../../operational/domain/recommendation";
import type { Signal } from "../../domain/signal";
import { PRIORITIES, type Priority } from "../../operational/domain/priority";
import type { Decision } from "./decision";

/**
 * Mission 024 — "DECISION SUMMARY". Every count here is read directly
 * off the actual `decisions` array the caller passes in — none is a
 * separately-tracked or estimated number, so the summary can never
 * drift out of sync with the decisions it describes.
 */
export type DecisionSummary = {
  totalDecisions: number;
  byPriority: Record<Priority, number>;
  /** Decisions with at least one AVAILABLE predictive-evidence entry. */
  withPredictiveEvidence: number;
  /** Decisions where predictive evidence was attempted but came back unavailable for at least one affected entity — tracked separately so "predictive evidence unavailable" is visible rather than silently absent. */
  withUnavailablePredictiveEvidence: number;
};

/**
 * `recommendations` and `signals` are carried through unchanged from
 * the M022 OperationalIntelligenceResult this was built from — the
 * same passthrough pattern OperationalIntelligenceResult itself uses
 * for M021's `signals` (Section "UI": the page needs all four levels
 * — decisions, recommendations, predictive status, signals — and
 * Section "PERFORMANCE" rules out computing the operational result
 * twice to get them).
 */
export type DecisionIntelligenceResult = {
  generatedAt: string;
  timeRange: ResolvedDateRange;
  decisions: Decision[];
  recommendations: Recommendation[];
  signals: Signal[];
  summary: DecisionSummary;
};

export function composeDecisionResult(
  dateRange: ResolvedDateRange,
  decisions: Decision[],
  recommendations: Recommendation[],
  signals: Signal[],
  generatedAt: string
): DecisionIntelligenceResult {
  const byPriority = Object.fromEntries(PRIORITIES.map((p) => [p, 0])) as Record<Priority, number>;
  for (const decision of decisions) byPriority[decision.priority] += 1;

  const withPredictiveEvidence = decisions.filter((d) => d.predictive.available.length > 0).length;
  const withUnavailablePredictiveEvidence = decisions.filter((d) => d.predictive.unavailableCount > 0).length;

  return {
    generatedAt,
    timeRange: dateRange,
    decisions,
    recommendations,
    signals,
    summary: {
      totalDecisions: decisions.length,
      byPriority,
      withPredictiveEvidence,
      withUnavailablePredictiveEvidence,
    },
  };
}
