import type { DecisionCategory } from "../../decision/domain/category";
import type { AffectedEntityType } from "../../operational/domain/affected-entity";

/**
 * Mission 025 — Section 11: one table, not strings scattered across
 * `DecisionCard`/`ActionPreviewDialog`. `entity` labels are used when
 * the decision has a specific affected record (`navigate_entity`);
 * `workflow` labels are used for the aggregate-only fallback
 * (`navigate_workflow`). Every label follows Section 8's rule: a
 * "go review/open X" framing, never an execution verb.
 */
export const CATEGORY_ACTION_LABEL: Record<DecisionCategory, { entity: string; workflow: string }> = {
  LEAD_PRIORITIZATION: { entity: "Review Lead", workflow: "Review Pipeline" },
  FOLLOW_UP: { entity: "Review Lead", workflow: "Open Leads" },
  DATA_INTEGRITY: { entity: "Review Deal", workflow: "Open Deals" },
  INVENTORY_REVIEW: { entity: "Open Vehicle", workflow: "Open Inventory" },
  SALES_REVIEW: { entity: "Open Sale", workflow: "Open Sales Analysis" },
  PIPELINE_REVIEW: { entity: "Review Lead", workflow: "Review Pipeline" },
};

/** Fallback when a category's primary entity type doesn't match what's actually on the decision (future-proofing for an entity type a category hasn't seen yet) — keyed by the entity's own type rather than the category. */
export const ENTITY_TYPE_ACTION_LABEL: Record<AffectedEntityType, string> = {
  lead: "Review Lead",
  deal: "Review Deal",
  vehicle: "Open Vehicle",
};
