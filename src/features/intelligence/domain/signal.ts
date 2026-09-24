import type { ResolvedDateRange } from "../../analytics/domain/date-range";

/**
 * Mission 021 — the structured Signal contract (Section 3).
 *
 * A small controlled severity set, exactly as specified — no
 * five-level scale invented for its own sake.
 */
export const SIGNAL_SEVERITIES = ["INFO", "WARNING", "CRITICAL"] as const;
export type SignalSeverity = (typeof SIGNAL_SEVERITIES)[number];

/**
 * Every signal type M021 knows how to produce. A union, not a bare
 * string, so a rule can't emit a typo'd type and every consumer gets
 * exhaustiveness checking for free. Extending this list is exactly
 * how a future mission adds a new rule.
 */
export const SIGNAL_TYPES = [
  "completed_deals_awaiting_sale",
  "overdue_follow_up_pressure",
  "declining_sales_trend",
  "inventory_oversupply",
  "weak_lead_conversion",
  "stagnant_pipeline",
  "vehicle_slow_movement",
  /**
   * Mission 027 — the first cross-entity signal: a stale available
   * vehicle (M026's own condition) compounded with the absence of any
   * active lead referencing it. Deliberately a distinct type from
   * `vehicle_slow_movement`, not a variant/flag on it — a different
   * (stronger) operational condition deserves its own signal, the
   * same reasoning `review_stale_vehicles` vs `review_stale_vehicles`-
   * to-be (see recommendation.ts) follows one layer up.
   */
  "stale_vehicle_no_active_lead",
] as const;
export type SignalType = (typeof SIGNAL_TYPES)[number];

/**
 * One measurable data point backing a signal (Section 5). A signal
 * can carry several — e.g. the observed decline AND the prior-period
 * baseline it was measured against — so "why did this fire" is
 * always answerable from the signal alone, without re-querying the
 * database.
 */
export type SignalEvidence = {
  /** Dot-free machine name of the metric, e.g. "integrity.completedDealsAwaitingSale" — traceable back to AnalyticsOverview. */
  metric: string;
  /** Human label for display, e.g. "Completed deals awaiting a Sale record". */
  label: string;
  observedValue: number;
  /** The threshold this value was compared against, when the evidence line is itself a threshold comparison. */
  thresholdValue?: number;
  comparison?: "gte" | "lte" | "gt" | "lt" | "eq";
};

/**
 * Section 7 — a deterministic rule firing is not a probability.
 * `kind: "deterministic"` never carries a percentage. The
 * `"predictive"` variant is reserved for a future M023 model; M021
 * never constructs one. Keeping both variants in the union now (not
 * added later) is what makes M023 additive instead of a breaking
 * change to every existing consumer of Signal.
 */
export type SignalConfidence = { kind: "deterministic" } | { kind: "predictive"; probability: number };

export type Signal = {
  /** Stable within one IntelligenceResult — currently just the SignalType, since M021's rules are business-level (fire at most once per evaluation), not per-entity. */
  id: SignalType;
  type: SignalType;
  severity: SignalSeverity;
  title: string;
  /** One or two sentences explaining what was observed and why it matters — a deterministic template, never generated prose (Section 6). */
  summary: string;
  evidence: SignalEvidence[];
  /** Which AnalyticsOverview domain this signal was derived from — "sales", "followUps", "integrity", "inventory", "funnel"/"crm". */
  sourceMetric: string;
  timeRange: ResolvedDateRange;
  confidence: SignalConfidence;
  /** ISO timestamp of the IntelligenceResult this signal belongs to — same value for every signal in one result, so a signal is self-describing even outside the result envelope. */
  triggeredAt: string;
};
