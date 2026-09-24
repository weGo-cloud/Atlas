import type { OperationalEntityResolver } from "../entity-resolution/entity-resolver";
import type { OperationalContext } from "./operational-context";
import type { Recommendation } from "./recommendation";
import type { RecommendationRule } from "./recommendation-rule";

/**
 * Mission 022 — Section 6/14/15. For each rule, finds its matching
 * signal (if the signal didn't fire this evaluation, the rule
 * produces nothing — Section 18: "no signal → no recommendation").
 * Entity resolution across the *different* applicable rules runs in
 * parallel (Section 14: "parallelize independent reads where
 * appropriate") — each rule's resolution is independent of every
 * other rule's. Ordering of the returned array always follows
 * `rules`' declaration order, never resolution completion order, so
 * results stay deterministic regardless of relative query latency.
 */
export async function evaluateRecommendations(
  rules: readonly RecommendationRule[],
  context: OperationalContext,
  resolver: OperationalEntityResolver,
  generatedAt: string
): Promise<Recommendation[]> {
  const applicable = rules
    .map((rule) => ({ rule, signal: context.signals.find((s) => s.type === rule.sourceSignalType) }))
    .filter((entry): entry is { rule: RecommendationRule; signal: NonNullable<typeof entry.signal> } =>
      Boolean(entry.signal)
    );

  return Promise.all(
    applicable.map(async ({ rule, signal }) => {
      const shell = rule.build(signal, generatedAt);
      const affectedEntities = rule.resolveEntities ? await rule.resolveEntities(signal, resolver, generatedAt) : [];
      return { ...shell, affectedEntities };
    })
  );
}
