import type { AffectedEntity } from "../../operational/domain/affected-entity";
import type { DecisionCategory } from "../../decision/domain/category";

/**
 * Mission 025 — Section 3/4. Three states, closed set:
 *
 * - `navigate_entity`: the decision has a specific affected record —
 *   the action goes straight to that record's existing detail page.
 * - `navigate_workflow`: the decision is aggregate-only (no specific
 *   record) — the action goes to the existing list/workflow page the
 *   underlying M022 recommendation already pointed at.
 * - `not_supported`: neither exists. Section 4: "if an action cannot
 *   be safely mapped to an existing workflow... do not fabricate an
 *   execution capability." Every current M022 recommendation has a
 *   real destination, so this is a dormant-but-correct path today —
 *   the same honest posture M022's own aggregate-only rules and
 *   M024's consolidation already take with paths that don't fire
 *   against real data yet.
 */
export const ACTION_TYPES = ["navigate_entity", "navigate_workflow", "not_supported"] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

type ActionIntentBase = {
  /** Deterministic — derived from the originating decision's id, so it's stable across renders of the same decision. */
  id: string;
  /** Provenance — Section 3: "every action must be traceable to a specific decision." */
  decisionId: string;
  category: DecisionCategory;
  /** Button label — Section 8: never "Execute"/"Run"/"Apply"/"Fix"/"Do it". Always a "go look at/review X" framing. */
  label: string;
  /** One line describing what will happen when the user clicks — Section 8: "the user must understand that Atlas is taking them to the appropriate workflow, not silently performing the recommendation." */
  explanation: string;
  generatedAt: string;
};

/**
 * Deliberately navigation-only — there is no `execute()`, no mutation
 * field, nothing this type could be used to trigger server-side.
 * Section 5's human-in-the-loop guarantee is enforced by this type's
 * shape as much as by any runtime check: an ActionIntent is
 * something to show the user and a place to send their browser, full
 * stop. A discriminated union on `type` — not a flat object with
 * optional fields — so `href`/`primaryEntity` are only ever readable
 * once `type` has already been narrowed away from `not_supported`,
 * the same pattern M023's `Prediction` type uses for `probability`.
 */
export type ActionIntent =
  | (ActionIntentBase & {
      type: "navigate_entity";
      /** Existing Atlas route only — always sourced from the matching AffectedEntity.href, never constructed here. */
      href: string;
      primaryEntity: AffectedEntity;
      /** How many other affected records exist beyond `primaryEntity` — surfaced so the preview can say "and 2 more" rather than silently dropping them. */
      additionalEntityCount: number;
      requiresConfirmation: true;
    })
  | (ActionIntentBase & {
      type: "navigate_workflow";
      /** Existing Atlas route only — always sourced from the decision's own Recommendation.suggestedAction.href, never constructed here. */
      href: string;
      primaryEntity: null;
      additionalEntityCount: 0;
      requiresConfirmation: true;
    })
  | (ActionIntentBase & {
      type: "not_supported";
      href: null;
      primaryEntity: null;
      additionalEntityCount: 0;
      requiresConfirmation: false;
    });
