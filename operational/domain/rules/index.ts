import type { RecommendationRule } from "../recommendation-rule";
import { completeDealSaleRecordsRule } from "./complete-deal-sale-records-rule";
import { reviewOverdueFollowUpsRule } from "./review-overdue-follow-ups-rule";
import { reviewStagnantPipelineRule } from "./review-stagnant-pipeline-rule";
import { reviewWeakLeadConversionRule } from "./review-weak-lead-conversion-rule";
import { reviewSalesDeclineRule } from "./review-sales-decline-rule";
import { reviewInventoryImbalanceRule } from "./review-inventory-imbalance-rule";
import { reviewStaleVehiclesRule } from "./review-stale-vehicles-rule";
import { reviewStaleVehiclesNoActiveLeadRule } from "./review-stale-vehicles-no-active-lead-rule";

/**
 * Mission 022 — every recommendation rule, one per M021 signal type
 * it interprets. Priority order here is also display order (worst
 * business-consequence first) before the summary composer's own
 * priority-based sort is applied in the UI.
 */
export const RECOMMENDATION_RULES: readonly RecommendationRule[] = [
  completeDealSaleRecordsRule,
  reviewOverdueFollowUpsRule,
  reviewSalesDeclineRule,
  reviewInventoryImbalanceRule,
  reviewStaleVehiclesRule,
  // Mission 027 — the compound condition, listed right after its
  // single-condition sibling.
  reviewStaleVehiclesNoActiveLeadRule,
  reviewWeakLeadConversionRule,
  reviewStagnantPipelineRule,
];

export {
  completeDealSaleRecordsRule,
  reviewOverdueFollowUpsRule,
  reviewStagnantPipelineRule,
  reviewWeakLeadConversionRule,
  reviewSalesDeclineRule,
  reviewInventoryImbalanceRule,
  reviewStaleVehiclesRule,
  reviewStaleVehiclesNoActiveLeadRule,
};
