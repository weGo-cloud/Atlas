import type { Rule } from "../engine";
import type { Signal } from "../signal";
import { INTELLIGENCE_THRESHOLDS } from "../thresholds";

/**
 * Mission 027 — Atlas's first cross-entity intelligence rule.
 *
 * Reads `AnalyticsOverview.inventory.availableVehicleAgeDaysWithoutActiveLead`
 * — a raw fact M020/M026's own repository split now computes via a
 * single LEFT JOIN against `leads` (see VehicleRepository's Mission
 * 027 doc) — and applies the *exact same* centralized
 * `INTELLIGENCE_THRESHOLDS.vehicleAttention` threshold M026's
 * `vehicleSlowMovementRule` already uses. No second threshold is
 * introduced (Section 5 of the mission is explicit about this): the
 * only thing that changes between the two rules is which subset of
 * available-vehicle ages they're evaluating.
 *
 * Same "oldest vehicle drives severity, count is evidence" shape as
 * `vehicleSlowMovementRule` for the same reason: one very old,
 * unengaged vehicle among several fresher ones is still exactly as
 * urgent, and averaging would dilute that.
 *
 * This is still not a prediction. No probability, no claim that the
 * vehicle won't sell or that the market has rejected it — only two
 * factual, auditable observations combined: how long the vehicle has
 * remained available, and that Atlas currently has no active
 * commercial opportunity attached to it (a `won`/`lost` lead does not
 * count as active interest — see leads/domain/lead.ts's
 * LEAD_ACTIVE_STATUSES, which this rule's evidence relies on
 * transitively via the repository join, never re-derives itself).
 */
export const staleVehicleNoActiveLeadRule: Rule = {
  evaluate(context, triggeredAt): Signal | null {
    const { warningAgeDays, criticalAgeDays } = INTELLIGENCE_THRESHOLDS.vehicleAttention;
    const ages = context.metrics.inventory.availableVehicleAgeDaysWithoutActiveLead;
    if (ages.length === 0) return null;

    const oldestAge = ages[0]; // already sorted oldest-first by the repository
    if (oldestAge < warningAgeDays) return null;

    const severity = oldestAge >= criticalAgeDays ? "CRITICAL" : "WARNING";
    const staleCount = ages.filter((age) => age >= warningAgeDays).length;

    return {
      id: "stale_vehicle_no_active_lead",
      type: "stale_vehicle_no_active_lead",
      severity,
      title:
        staleCount === 1
          ? "1 available vehicle is stale with no active lead interest"
          : `${staleCount} available vehicles are stale with no active lead interest`,
      summary:
        "These vehicles have remained available past the usual review point and currently have no active lead associated with them. This is a stronger signal than inventory age alone — there is no known commercial opportunity attached to them right now.",
      evidence: [
        {
          metric: "inventory.oldestStaleVehicleWithoutActiveLeadAgeDays",
          label: "Oldest available, unengaged vehicle — days in inventory",
          observedValue: Math.round(oldestAge),
          thresholdValue: severity === "CRITICAL" ? criticalAgeDays : warningAgeDays,
          comparison: "gte",
        },
        {
          metric: "inventory.staleVehicleWithoutActiveLeadCount",
          label: `Available vehicles ${warningAgeDays}+ days with no active lead`,
          observedValue: staleCount,
        },
        {
          metric: "inventory.staleVehicleWithoutActiveLeadActiveLeadCount",
          label: "Active leads referencing these vehicles",
          observedValue: 0,
          comparison: "eq",
        },
      ],
      sourceMetric: "inventory",
      timeRange: context.dateRange,
      confidence: { kind: "deterministic" },
      triggeredAt,
    };
  },
};
