import { PRIORITY_RANK } from "../../operational/domain/priority";
import { computeDecisionScore } from "./scoring";
import type { Decision } from "./decision";

/**
 * Mission 024 — "DUPLICATE DECISIONS". Two decisions are consolidated
 * only when they share BOTH the same category AND at least one
 * affected entity — sharing just a category (e.g. two different
 * FOLLOW_UP-type recommendations, if a future mission adds a second
 * one) is not enough on its own; they must be about at least one of
 * the same underlying records, or merging would combine unrelated
 * concerns (the mission's own warning: "do not merge unrelated
 * recommendations merely because they share an entity" — the
 * category match is what rules that out in the other direction).
 *
 * With today's exactly-one-recommendation-per-category mapping (see
 * category.ts), this never actually merges anything — verified by
 * dedicated tests using synthetic fixtures rather than real M022
 * output, specifically so the mechanism is proven correct ahead of
 * a future recommendation type that might actually trigger it
 * (Section "FUTURE COMPATIBILITY").
 */
export function consolidateDecisions(decisions: Decision[]): Decision[] {
  const groups: Decision[][] = [];

  for (const decision of decisions) {
    const entityIds = new Set(decision.affectedEntities.map((e) => e.id));
    const matchingGroup = groups.find(
      (group) =>
        group[0].category === decision.category &&
        group.some((existing) => existing.affectedEntities.some((e) => entityIds.has(e.id)))
    );
    if (matchingGroup) matchingGroup.push(decision);
    else groups.push([decision]);
  }

  return groups.map((group) => (group.length === 1 ? group[0] : mergeGroup(group)));
}

function mergeGroup(group: Decision[]): Decision {
  // Deterministic pick order: highest priority first, then alphabetical by id, so the
  // "primary" source (whose title/summary/suggestedAction wins) never depends on input order.
  const sorted = [...group].sort((a, b) => {
    const priorityDiff = PRIORITY_RANK.indexOf(a.priority) - PRIORITY_RANK.indexOf(b.priority);
    if (priorityDiff !== 0) return priorityDiff;
    return a.id.localeCompare(b.id);
  });
  const primary = sorted[0];

  const affectedEntities = dedupeById(group.flatMap((d) => d.affectedEntities));
  const evidence = dedupeByMetric(group.flatMap((d) => d.evidence));
  const available = dedupeByEntityId(group.flatMap((d) => d.predictive.available));
  const unavailableCount = group.reduce((sum, d) => sum + d.predictive.unavailableCount, 0);
  const sourceRecommendations = [...new Set(group.flatMap((d) => d.sourceRecommendations))].sort();

  const score = computeDecisionScore(primary.priority, available, affectedEntities.length);

  return {
    id: sourceRecommendations.join("+"),
    title: primary.title,
    summary: primary.summary,
    category: primary.category,
    priority: primary.priority,
    score,
    rationale:
      group.length > 1
        ? `${primary.rationale} (Consolidated from ${group.length} related recommendations affecting the same record(s).)`
        : primary.rationale,
    evidence,
    predictive: { available, unavailableCount },
    sourceRecommendations,
    affectedEntities,
    suggestedAction: primary.suggestedAction,
    generatedAt: primary.generatedAt,
    confidence: primary.confidence,
  };
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Map<string, T>();
  for (const item of items) if (!seen.has(item.id)) seen.set(item.id, item);
  return [...seen.values()];
}

function dedupeByMetric<T extends { metric: string }>(items: T[]): T[] {
  const seen = new Map<string, T>();
  for (const item of items) if (!seen.has(item.metric)) seen.set(item.metric, item);
  return [...seen.values()];
}

function dedupeByEntityId<T extends { entityId: string }>(items: T[]): T[] {
  const seen = new Map<string, T>();
  for (const item of items) if (!seen.has(item.entityId)) seen.set(item.entityId, item);
  return [...seen.values()];
}
