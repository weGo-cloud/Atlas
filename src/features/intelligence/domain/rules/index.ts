import type { Rule } from "../engine";
import { completedDealsAwaitingSaleRule } from "./completed-deals-awaiting-sale-rule";
import { overdueFollowUpRule } from "./overdue-follow-up-rule";
import { salesTrendDeclineRule } from "./sales-trend-decline-rule";
import { inventoryOversupplyRule } from "./inventory-oversupply-rule";
import { weakLeadConversionRule, stagnantPipelineRule } from "./lead-pipeline-rules";
import { vehicleSlowMovementRule } from "./vehicle-slow-movement-rule";
import { staleVehicleNoActiveLeadRule } from "./stale-vehicle-no-active-lead-rule";

/**
 * Mission 021 — every rule the signal engine runs. Adding a new rule
 * means adding it to this list (and to SIGNAL_TYPES in signal.ts) —
 * nowhere else in the engine needs to change.
 */
export const RULES: readonly Rule[] = [
  completedDealsAwaitingSaleRule,
  overdueFollowUpRule,
  salesTrendDeclineRule,
  inventoryOversupplyRule,
  weakLeadConversionRule,
  stagnantPipelineRule,
  vehicleSlowMovementRule,
  // Mission 027 — Atlas's first cross-entity rule.
  staleVehicleNoActiveLeadRule,
];

export {
  completedDealsAwaitingSaleRule,
  overdueFollowUpRule,
  salesTrendDeclineRule,
  inventoryOversupplyRule,
  weakLeadConversionRule,
  stagnantPipelineRule,
  vehicleSlowMovementRule,
  staleVehicleNoActiveLeadRule,
};
