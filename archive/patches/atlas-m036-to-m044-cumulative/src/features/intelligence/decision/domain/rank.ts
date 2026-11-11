import type { Decision } from "./decision";

/**
 * Mission 024 — "DETERMINISM". A total order: every comparison either
 * decides the outcome or falls through to the next, ending in a
 * comparison (`id`) that is always unique, so two decisions are never
 * left in an arbitrary relative order.
 *
 * 1. score, descending (already encodes priority as its dominant term
 *    — see scoring.ts).
 * 2. affected-entity count, descending — a decision touching more
 *    records is the natural next tie-break when score is exactly
 *    equal.
 * 3. id, ascending — final, always-unique tie-break. The mission's
 *    suggested order also mentions "entity age" between urgency and
 *    id; that tier is deliberately omitted here — see this mission's
 *    report for why (fetching entity timestamps would mean new
 *    queries this layer otherwise never makes, for a tie-break case
 *    that in practice never occurs with today's six decision types).
 */
export function rankDecisions(decisions: Decision[]): Decision[] {
  return [...decisions].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const entityCountDiff = b.affectedEntities.length - a.affectedEntities.length;
    if (entityCountDiff !== 0) return entityCountDiff;
    return a.id.localeCompare(b.id);
  });
}
