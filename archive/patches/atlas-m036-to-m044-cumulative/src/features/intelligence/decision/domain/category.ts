import type { RecommendationType } from "../../operational/domain/recommendation";

/**
 * Mission 024 — a small controlled set, one per M022 RecommendationType
 * (see rules.ts for the 1:1 mapping table). Not invented ahead of
 * need: every category here corresponds to a recommendation Atlas
 * actually produces today; nothing speculative ("PRICING_REVIEW",
 * "FORECASTING", etc.) is included, per the mission's own instruction
 * not to create categories for theoretical future use.
 */
export const DECISION_CATEGORIES = [
  "LEAD_PRIORITIZATION",
  "FOLLOW_UP",
  "INVENTORY_REVIEW",
  "SALES_REVIEW",
  "DATA_INTEGRITY",
  "PIPELINE_REVIEW",
] as const;
export type DecisionCategory = (typeof DECISION_CATEGORIES)[number];

/**
 * The 1:1 mapping this file's own doc comment promises — kept here
 * (not duplicated in rules.ts) so there is exactly one place that
 * answers "what category does this recommendation become".
 *
 * - complete_deal_sale_records → DATA_INTEGRITY: a missing Sale
 *   record is a bookkeeping gap, not a sales or pipeline concern.
 * - review_overdue_follow_ups → FOLLOW_UP: time-sensitive, per-lead,
 *   about contacting people who are already waiting.
 * - review_stagnant_pipeline → LEAD_PRIORITIZATION: also per-lead,
 *   but about *which* leads to work first rather than a contact
 *   deadline — the natural home for M023's per-lead conversion
 *   predictions (Section "LEAD PRIORITIZATION").
 * - review_weak_lead_conversion → PIPELINE_REVIEW: a pipeline-wide
 *   rate, not resolvable to individual leads (M022 already keeps this
 *   aggregate-only) — a distinct category from LEAD_PRIORITIZATION
 *   specifically because it can't be turned into a per-lead ranking.
 * - review_stale_vehicles → INVENTORY_REVIEW: the entity-level
 *   counterpart to review_inventory_imbalance (Mission 026) — same
 *   category, since both are about inventory attention, but this one
 *   carries specific vehicle affected entities where the aggregate
 *   rule carries none. M024's consolidation only merges decisions
 *   sharing both category AND an affected entity, so the two never
 *   accidentally collapse into one (the aggregate decision has no
 *   entities to share).
 * - review_sales_decline → SALES_REVIEW.
 * - review_inventory_imbalance → INVENTORY_REVIEW.
 * - review_stale_vehicles_no_active_lead → INVENTORY_REVIEW (Mission
 *   027): the same category as review_stale_vehicles, since it's the
 *   same underlying vehicle-attention concern with one additional
 *   fact layered on. Sharing the category is intentional and safe —
 *   M024's consolidation only merges when BOTH category and an
 *   affected entity are shared, so a vehicle that fires both rules
 *   correctly consolidates into a single decision instead of showing
 *   up twice; a vehicle that fires only one still stands alone.
 */
export const RECOMMENDATION_TYPE_TO_CATEGORY: Record<RecommendationType, DecisionCategory> = {
  complete_deal_sale_records: "DATA_INTEGRITY",
  review_overdue_follow_ups: "FOLLOW_UP",
  review_stagnant_pipeline: "LEAD_PRIORITIZATION",
  review_weak_lead_conversion: "PIPELINE_REVIEW",
  review_sales_decline: "SALES_REVIEW",
  review_inventory_imbalance: "INVENTORY_REVIEW",
  review_stale_vehicles: "INVENTORY_REVIEW",
  review_stale_vehicles_no_active_lead: "INVENTORY_REVIEW",
};
