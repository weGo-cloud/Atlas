/**
 * Mission 022 — Section 8. Operational priority, kept as its own
 * scale, deliberately not a 1:1 reuse of M021's Signal `severity`.
 * Severity answers "how far past the threshold is this metric";
 * priority answers "how urgently should an operator act on it" —
 * those are different questions with different answers. A completed
 * deal missing its Sale record at WARNING severity (just 1 deal) is
 * still operationally HIGH priority, because every day it sits
 * unrecorded is a day of inaccurate transaction history; a WARNING-
 * severity overdue-follow-up signal is only MEDIUM, because a modest
 * follow-up backlog is routine daily work, not urgent.
 *
 * Each rule file documents its own severity→priority mapping and the
 * reasoning behind it — see PRIORITY_MAP below for the full table.
 */
export const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export type Priority = (typeof PRIORITIES)[number];

/** Worst-first, for sorting a recommendation list the same way IntelligenceResult sorts signals. */
export const PRIORITY_RANK: readonly Priority[] = ["URGENT", "HIGH", "MEDIUM", "LOW"];

/**
 * Section 8's severity→priority table, centralized so no rule file
 * hard-codes its own mapping inline. Every M021 rule only ever
 * produces WARNING or CRITICAL (never INFO — see thresholds.ts), so
 * only those two are mapped.
 *
 * - completedDealsAwaitingSale: an unrecorded transaction is a data-
 *   integrity gap regardless of count, so it starts at HIGH rather
 *   than the MEDIUM most other WARNING-severity signals get.
 * - decliningSalesTrend: revenue impact escalates faster than most
 *   other conditions — HIGH at WARNING, URGENT at CRITICAL (the same
 *   top tier as the integrity gap).
 * - overdueFollowUpPressure / stagnantPipeline / weakLeadConversion /
 *   inventoryOversupply / vehicleSlowMovement: routine pipeline/
 *   inventory management conditions — MEDIUM at WARNING, HIGH at
 *   CRITICAL.
 * - staleVehicleNoActiveLead (Mission 027): the same underlying
 *   inventory-age condition as vehicleSlowMovement, but compounded
 *   with "and Atlas currently has no active commercial opportunity
 *   attached to it" — genuinely more urgent than aging inventory
 *   alone (there's no lead-side workflow already in motion that might
 *   independently resolve it), so it starts a tier higher, the same
 *   HIGH/URGENT tier completedDealsAwaitingSale/decliningSalesTrend
 *   already use for their own "worse than routine" conditions. Still
 *   the existing four-value scale, still driven entirely by Signal's
 *   own severity — no new priority mechanism invented for this one
 *   rule (Section 6 of the mission).
 */
export const PRIORITY_MAP = {
  completedDealsAwaitingSale: { WARNING: "HIGH", CRITICAL: "URGENT" },
  overdueFollowUpPressure: { WARNING: "MEDIUM", CRITICAL: "HIGH" },
  decliningSalesTrend: { WARNING: "HIGH", CRITICAL: "URGENT" },
  inventoryOversupply: { WARNING: "MEDIUM", CRITICAL: "HIGH" },
  weakLeadConversion: { WARNING: "MEDIUM", CRITICAL: "HIGH" },
  stagnantPipeline: { WARNING: "MEDIUM", CRITICAL: "HIGH" },
  vehicleSlowMovement: { WARNING: "MEDIUM", CRITICAL: "HIGH" },
  staleVehicleNoActiveLead: { WARNING: "HIGH", CRITICAL: "URGENT" },
} as const satisfies Record<string, { WARNING: Priority; CRITICAL: Priority }>;

/**
 * Every current M021 rule only ever severities at WARNING or
 * CRITICAL (see intelligence/domain/thresholds.ts — every threshold
 * check is a floor, there is no INFO tier in use), so PRIORITY_MAP
 * only defines those two. This helper is the single place that
 * bridges Signal's three-value severity type to that two-key map,
 * with an explicit, documented fallback (LOW) if a future signal
 * ever does fire at INFO — never a silent `any`/non-null-assertion
 * at each of the six call sites.
 */
export function priorityFor(map: { WARNING: Priority; CRITICAL: Priority }, severity: "INFO" | "WARNING" | "CRITICAL"): Priority {
  if (severity === "WARNING") return map.WARNING;
  if (severity === "CRITICAL") return map.CRITICAL;
  return "LOW";
}
