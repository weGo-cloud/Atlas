import type { Priority } from "../../operational/domain/priority";
import type { DecisionPredictiveEvidence } from "./decision";

/**
 * Mission 024 — "DECISION PRIORITIZATION" / "IMPORTANT QUALITY RULE".
 * Every number here has a stated purpose and a stated bound. There is
 * no hidden or unbounded term.
 *
 * score = PRIORITY_BASE_SCORE[priority] + predictiveBonus + multiEntityBonus
 *
 * The 100-point gap between priority tiers is deliberately much
 * larger than the maximum possible bonus (9 + 1 = 10) — this is the
 * whole conflict-resolution rule required by the "CONFLICT
 * RESOLUTION" section, made structural rather than case-by-case:
 *
 *   operational priority always decides which TIER a decision lands
 *   in; predictive probability and affected-entity count can only
 *   reorder decisions WITHIN a tier, never move one across a tier
 *   boundary.
 *
 * So "high operational urgency + low predictive probability" always
 * outranks "low operational urgency + high predictive probability" —
 * URGENT (400s) is never reachable by MEDIUM (200s) piling on bonus
 * points, because the maximum possible bonus (10) is far smaller than
 * the gap between tiers (100). This is a deliberate design decision,
 * not an incidental one, and it is what the mission means by
 * "prefer deterministic rules over opaque aggregation": the ranking
 * is fully explainable as "priority tier, then a small, bounded
 * nudge" rather than an opaque weighted sum where a probability could
 * silently outweigh an operational priority.
 */
export const PRIORITY_BASE_SCORE: Record<Priority, number> = {
  URGENT: 400,
  HIGH: 300,
  MEDIUM: 200,
  LOW: 100,
};

/**
 * Predictive bonus: `round(maxAvailableProbability * MAX_PREDICTIVE_BONUS)`,
 * bounded to [0, 9]. Only computed from predictions that came back
 * `AVAILABLE` — an empty/unavailable set contributes exactly 0, never
 * a fabricated "average" or a penalty (Section "PREDICTIVE EVIDENCE":
 * "unavailable prediction ≠ low probability" — 0 bonus here means
 * "no adjustment", not "low risk").
 */
export const MAX_PREDICTIVE_BONUS = 9;

/** +1 when a decision affects 2 or more entities, else +0 — a small, bounded, binary impact signal (more affected records = marginally higher priority), never scaled by an unbounded count. */
export const MULTI_ENTITY_BONUS = 1;

export function maxAvailableProbability(available: DecisionPredictiveEvidence[]): number | null {
  if (available.length === 0) return null;
  return Math.max(...available.map((p) => p.probability));
}

export function computeDecisionScore(
  priority: Priority,
  available: DecisionPredictiveEvidence[],
  affectedEntityCount: number
): number {
  const base = PRIORITY_BASE_SCORE[priority];

  const maxProbability = maxAvailableProbability(available);
  const predictiveBonus = maxProbability === null ? 0 : Math.round(maxProbability * MAX_PREDICTIVE_BONUS);

  const multiEntityBonus = affectedEntityCount >= 2 ? MULTI_ENTITY_BONUS : 0;

  return base + predictiveBonus + multiEntityBonus;
}
