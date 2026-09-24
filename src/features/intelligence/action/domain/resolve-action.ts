import type { Decision } from "../../decision/domain/decision";
import { CATEGORY_ACTION_LABEL, ENTITY_TYPE_ACTION_LABEL } from "./category-action-labels";
import type { ActionIntent } from "./action-intent";

/**
 * Mission 025 — Section 11. Pure and O(1): reads only fields already
 * present on the `Decision` it's given (`affectedEntities`,
 * `suggestedAction`) — no repository, no service call, no recompute
 * of M022/M023/M024 (Section 15). Same input, same output, always;
 * no clock read except the `now` parameter the caller supplies.
 *
 * Resolution order:
 * 1. A specific affected record exists → `navigate_entity`, targeting
 *    the first entity (M022's entity resolver already returns them
 *    deterministically ordered — most-overdue-first / most-recently-
 *    updated-first — so "first" is a meaningful, stable choice, not
 *    an arbitrary one).
 * 2. No affected record, but the underlying recommendation has a
 *    workflow destination → `navigate_workflow`.
 * 3. Neither → `not_supported` (Section 4 — never fabricated).
 */
export function resolveAction(decision: Decision, now: string): ActionIntent {
  const base = {
    id: `action:${decision.id}`,
    decisionId: decision.id,
    category: decision.category,
    generatedAt: now,
  };

  const labels = CATEGORY_ACTION_LABEL[decision.category];

  if (decision.affectedEntities.length > 0) {
    const [primaryEntity, ...rest] = decision.affectedEntities;
    const label = ENTITY_TYPE_ACTION_LABEL[primaryEntity.type] ?? labels.entity;

    return {
      ...base,
      type: "navigate_entity",
      label,
      explanation: `Atlas will take you to ${primaryEntity.label} to review this.`,
      href: primaryEntity.href,
      primaryEntity,
      additionalEntityCount: rest.length,
      requiresConfirmation: true,
    };
  }

  if (decision.suggestedAction.href) {
    return {
      ...base,
      type: "navigate_workflow",
      label: labels.workflow,
      explanation: `Atlas will take you to the relevant workflow to review this.`,
      href: decision.suggestedAction.href,
      primaryEntity: null,
      additionalEntityCount: 0,
      requiresConfirmation: true,
    };
  }

  return {
    ...base,
    type: "not_supported",
    label: "Not available",
    explanation: "Atlas doesn't have a workflow it can safely open for this decision yet.",
    href: null,
    primaryEntity: null,
    additionalEntityCount: 0,
    requiresConfirmation: false,
  };
}
