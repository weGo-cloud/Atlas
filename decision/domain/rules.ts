import type { Priority } from "../../operational/domain/priority";
import type { Recommendation, RecommendationType, SuggestedAction } from "../../operational/domain/recommendation";
import type { SignalEvidence } from "../../domain/signal";
import type { AffectedEntity } from "../../operational/domain/affected-entity";
import { RECOMMENDATION_TYPE_TO_CATEGORY, type DecisionCategory } from "./category";

export type DraftDecision = {
  id: string;
  title: string;
  summary: string;
  rationale: string;
  category: DecisionCategory;
  priority: Priority;
  evidence: SignalEvidence[];
  sourceRecommendations: RecommendationType[];
  affectedEntities: AffectedEntity[];
  suggestedAction: SuggestedAction;
};

/**
 * Mission 024 — a single table rather than one file per rule
 * (deviating from M021/M022's one-rule-per-file convention on
 * purpose): every one of these six rules is the same shape — a
 * category assignment plus a short, predefined rationale template
 * that reframes the recommendation's own trusted title/summary as a
 * decision. There is no independent threshold logic to isolate the
 * way M021's rules had, so six near-identical files would only add
 * indirection without adding clarity.
 *
 * `predictiveEligible` marks exactly the two recommendation types
 * whose `affectedEntities` are leads that M023's lead-conversion
 * model can actually score — see decision-predictive.ts. Every other
 * recommendation is deliberately NOT eligible: `complete_deal_sale_records`
 * affects deals (no deal-level model exists — Section "INVENTORY
 * DECISIONS": "if not yet implemented, do not invent it" applies
 * equally here), and `review_weak_lead_conversion` /
 * `review_sales_decline` / `review_inventory_imbalance` are all
 * aggregate-only in M022 (no individual affected entities to score).
 */
export type DecisionRule = {
  sourceType: RecommendationType;
  predictiveEligible: boolean;
  build(recommendation: Recommendation): DraftDecision;
};

function baseDraft(recommendation: Recommendation, rationale: string): DraftDecision {
  return {
    id: recommendation.type,
    title: recommendation.title,
    summary: recommendation.summary,
    rationale,
    category: RECOMMENDATION_TYPE_TO_CATEGORY[recommendation.type],
    priority: recommendation.priority,
    evidence: recommendation.evidence,
    sourceRecommendations: [recommendation.type],
    affectedEntities: recommendation.affectedEntities,
    suggestedAction: recommendation.suggestedAction,
  };
}

export const DECISION_RULES: Record<RecommendationType, DecisionRule> = {
  complete_deal_sale_records: {
    sourceType: "complete_deal_sale_records",
    predictiveEligible: false,
    build: (r) =>
      baseDraft(
        r,
        `${r.rationale} This is a data-integrity gap, not a sales or pipeline concern — it belongs at the top of the review list regardless of how busy the rest of the pipeline is.`
      ),
  },
  review_overdue_follow_ups: {
    sourceType: "review_overdue_follow_ups",
    predictiveEligible: true,
    build: (r) => baseDraft(r, r.rationale),
  },
  review_stagnant_pipeline: {
    sourceType: "review_stagnant_pipeline",
    predictiveEligible: true,
    build: (r) => baseDraft(r, r.rationale),
  },
  review_weak_lead_conversion: {
    sourceType: "review_weak_lead_conversion",
    predictiveEligible: false,
    build: (r) => baseDraft(r, r.rationale),
  },
  review_sales_decline: {
    sourceType: "review_sales_decline",
    predictiveEligible: false,
    build: (r) => baseDraft(r, r.rationale),
  },
  review_inventory_imbalance: {
    sourceType: "review_inventory_imbalance",
    predictiveEligible: false,
    build: (r) => baseDraft(r, r.rationale),
  },
  review_stale_vehicles: {
    sourceType: "review_stale_vehicles",
    // No vehicle-level M023 model exists — Mission 026's own boundary (Section 6):
    // a deterministic vehicle signal is not a vehicle prediction, and none is fabricated here.
    predictiveEligible: false,
    build: (r) => baseDraft(r, r.rationale),
  },
  review_stale_vehicles_no_active_lead: {
    sourceType: "review_stale_vehicles_no_active_lead",
    // Same predictive boundary as review_stale_vehicles (Mission 027
    // Section 17/predictive boundary) — still no vehicle-level model,
    // and this compound condition is not dressed up as one either.
    predictiveEligible: false,
    build: (r) => baseDraft(r, r.rationale),
  },
};
