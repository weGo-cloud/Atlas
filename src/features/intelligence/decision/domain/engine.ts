import { computeDecisionScore } from "./scoring";
import { consolidateDecisions } from "./consolidate";
import { rankDecisions } from "./rank";
import { attachPredictiveEvidence, type DecisionPredictionSource } from "./predictive-attachment";
import { DECISION_RULES } from "./rules";
import type { DecisionContext } from "./context";
import type { Decision } from "./decision";

/**
 * Mission 024 — "PERFORMANCE": a sensible, documented cap on the
 * final decision list, independent of how many recommendation/entity
 * combinations theoretically exist. With today's six recommendation
 * types this never binds, but a future mission adding more
 * recommendation types (or per-entity decisions) inherits the bound
 * automatically rather than needing to remember to add one.
 */
export const MAX_DECISIONS = 20;

/**
 * Mission 024's full pipeline: draft (pure, one per recommendation,
 * via DECISION_RULES) → predictive attachment (the only IO, and only
 * for eligible drafts) → score (pure) → consolidate (pure) → rank
 * (pure) → bounded slice. Predictive attachment across the different
 * *decisions* runs in parallel (Section "PERFORMANCE": "batch
 * operations where appropriate") — each decision's own predictions
 * are independent of every other decision's.
 */
export async function evaluateDecisions(
  context: DecisionContext,
  predictionSource: DecisionPredictionSource,
  now: string
): Promise<Decision[]> {
  const decisions = await Promise.all(
    context.recommendations.map(async (recommendation) => {
      const rule = DECISION_RULES[recommendation.type];
      const draft = rule.build(recommendation);
      const predictive = await attachPredictiveEvidence(draft, rule.predictiveEligible, predictionSource, now);
      const score = computeDecisionScore(draft.priority, predictive.available, draft.affectedEntities.length);

      const decision: Decision = {
        ...draft,
        predictive,
        score,
        generatedAt: now,
        confidence: { kind: "deterministic" },
      };
      return decision;
    })
  );

  const consolidated = consolidateDecisions(decisions);
  const ranked = rankDecisions(consolidated);
  return ranked.slice(0, MAX_DECISIONS);
}
