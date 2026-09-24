import type { ResolvedDateRange } from "../../analytics/domain/date-range";
import type { IntelligenceContext } from "./context";
import { SIGNAL_SEVERITIES, type Signal, type SignalSeverity } from "./signal";

/**
 * Mission 021 — Section 6. One structured result above raw signals.
 * `summary` is deterministic aggregate metadata over `signals`
 * (counts), never generated prose — Section 6 explicitly rules out
 * LLM-generated summaries for M021.
 */
export type IntelligenceResultSummary = {
  totalSignals: number;
  bySeverity: Record<SignalSeverity, number>;
  /** null when there are no signals — "no severity" is a distinct state from "INFO", not a default. */
  highestSeverity: SignalSeverity | null;
};

export type IntelligenceResult = {
  generatedAt: string;
  timeRange: ResolvedDateRange;
  signals: Signal[];
  summary: IntelligenceResultSummary;
};

/** Declared worst-to-least-severe so the first match in this order is the highest severity present. */
const SEVERITY_RANK: readonly SignalSeverity[] = ["CRITICAL", "WARNING", "INFO"];

export function composeIntelligenceResult(
  context: IntelligenceContext,
  signals: Signal[],
  generatedAt: string
): IntelligenceResult {
  const bySeverity = Object.fromEntries(SIGNAL_SEVERITIES.map((s) => [s, 0])) as Record<SignalSeverity, number>;
  for (const signal of signals) bySeverity[signal.severity] += 1;

  const highestSeverity = SEVERITY_RANK.find((severity) => bySeverity[severity] > 0) ?? null;

  return {
    generatedAt,
    timeRange: context.dateRange,
    signals,
    summary: {
      totalSignals: signals.length,
      bySeverity,
      highestSeverity,
    },
  };
}
