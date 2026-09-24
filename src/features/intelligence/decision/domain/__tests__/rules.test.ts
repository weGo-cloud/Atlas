import { describe, expect, it } from "vitest";

import { DECISION_RULES } from "../rules";
import { RECOMMENDATION_TYPE_TO_CATEGORY, DECISION_CATEGORIES } from "../category";
import { recommendation, leadEntity, dealEntity } from "./fixtures";
import type { RecommendationType } from "../../../operational/domain/recommendation";

const ALL_TYPES: RecommendationType[] = [
  "complete_deal_sale_records",
  "review_overdue_follow_ups",
  "review_stagnant_pipeline",
  "review_weak_lead_conversion",
  "review_sales_decline",
  "review_inventory_imbalance",
  "review_stale_vehicles",
  "review_stale_vehicles_no_active_lead",
];

describe("category mapping", () => {
  it("maps every recommendation type to one of the controlled decision categories", () => {
    for (const type of ALL_TYPES) {
      expect(DECISION_CATEGORIES).toContain(RECOMMENDATION_TYPE_TO_CATEGORY[type]);
    }
  });

  it("maps every type to a distinct category, except the three INVENTORY_REVIEW types which intentionally share it (Missions 026/027)", () => {
    const categories = ALL_TYPES.map((t) => RECOMMENDATION_TYPE_TO_CATEGORY[t]);
    // Two fewer distinct categories than types: review_inventory_imbalance,
    // review_stale_vehicles, and review_stale_vehicles_no_active_lead all
    // intentionally share INVENTORY_REVIEW (three types, one category).
    expect(new Set(categories).size).toBe(ALL_TYPES.length - 2);
    expect(RECOMMENDATION_TYPE_TO_CATEGORY.review_stale_vehicles).toBe(
      RECOMMENDATION_TYPE_TO_CATEGORY.review_inventory_imbalance
    );
    expect(RECOMMENDATION_TYPE_TO_CATEGORY.review_stale_vehicles_no_active_lead).toBe(
      RECOMMENDATION_TYPE_TO_CATEGORY.review_inventory_imbalance
    );
  });
});

describe("DECISION_RULES", () => {
  it("has exactly one rule per recommendation type", () => {
    expect(Object.keys(DECISION_RULES).sort()).toEqual([...ALL_TYPES].sort());
  });

  it("marks only lead-affecting recommendation types as predictive-eligible", () => {
    expect(DECISION_RULES.review_overdue_follow_ups.predictiveEligible).toBe(true);
    expect(DECISION_RULES.review_stagnant_pipeline.predictiveEligible).toBe(true);
    expect(DECISION_RULES.complete_deal_sale_records.predictiveEligible).toBe(false);
    expect(DECISION_RULES.review_weak_lead_conversion.predictiveEligible).toBe(false);
    expect(DECISION_RULES.review_sales_decline.predictiveEligible).toBe(false);
    expect(DECISION_RULES.review_inventory_imbalance.predictiveEligible).toBe(false);
    expect(DECISION_RULES.review_stale_vehicles.predictiveEligible).toBe(false);
    expect(DECISION_RULES.review_stale_vehicles_no_active_lead.predictiveEligible).toBe(false);
  });

  it("carries priority, evidence, affectedEntities, and suggestedAction through unchanged", () => {
    const r = recommendation("review_overdue_follow_ups", "HIGH", { affectedEntities: [leadEntity("lead_1")] });
    const draft = DECISION_RULES.review_overdue_follow_ups.build(r);
    expect(draft.priority).toBe("HIGH");
    expect(draft.evidence).toBe(r.evidence);
    expect(draft.affectedEntities).toBe(r.affectedEntities);
    expect(draft.suggestedAction).toBe(r.suggestedAction);
    expect(draft.sourceRecommendations).toEqual(["review_overdue_follow_ups"]);
  });

  it("assigns the correct category to each draft", () => {
    expect(DECISION_RULES.complete_deal_sale_records.build(recommendation("complete_deal_sale_records", "URGENT", { affectedEntities: [dealEntity("deal_1")] })).category).toBe("DATA_INTEGRITY");
    expect(DECISION_RULES.review_stagnant_pipeline.build(recommendation("review_stagnant_pipeline", "MEDIUM")).category).toBe("LEAD_PRIORITIZATION");
  });

  it("produces a stable id equal to the recommendation type", () => {
    const draft = DECISION_RULES.review_sales_decline.build(recommendation("review_sales_decline", "HIGH"));
    expect(draft.id).toBe("review_sales_decline");
  });
});
