import type { Activity } from "../../../activities/domain/activity";

/**
 * Mission 023 — Section 8/9. Every one of these is computed only
 * from activity rows whose `createdAt <= observationCutoff` (enforced
 * inside `buildLeadConversionFeatures` itself, not left to the
 * caller to filter correctly) — see config.ts for why that cutoff is
 * `lead.createdAt + observationWindowDays`, never "now" or any other
 * value that could see beyond the window a live prediction would
 * actually have.
 *
 * Deliberately excluded, with reasons (Section 9's leakage audit):
 * - current lead.status — reflects TODAY's state, not the state as
 *   of the cutoff. For a lead created 90 days ago, "status" is
 *   whatever it eventually became, which is the label in disguise.
 *   `reachedQualifiedOrBeyond` below is the leak-safe replacement,
 *   built from status_change *events* filtered to the cutoff.
 * - current lead.nextFollowUpAt — same problem: it's overwritten in
 *   place, so historical leads only expose today's value, not the
 *   value that existed at the cutoff.
 * - anything about the eventual Deal/Sale beyond "was a Deal created
 *   by the cutoff" — Deal status progression maps directly onto the
 *   label being predicted.
 */
export const LEAD_CONVERSION_FEATURE_NAMES = [
  "hasVehicleInterest",
  "activityCount",
  "manualActivityCount",
  "statusChangeCount",
  "reachedQualifiedOrBeyond",
  "hadDealCreated",
  "followUpScheduledCount",
  "followUpCompletedCount",
  "daysSinceLastActivity",
] as const;

export type LeadConversionFeatures = {
  hasVehicleInterest: number;
  activityCount: number;
  manualActivityCount: number;
  statusChangeCount: number;
  reachedQualifiedOrBeyond: number;
  hadDealCreated: number;
  followUpScheduledCount: number;
  followUpCompletedCount: number;
  daysSinceLastActivity: number;
};

const MANUAL_TYPES = new Set(["note", "call", "meeting", "email"]);
/** Statuses at or beyond "qualified" in the pipeline — see leads/domain/lead.ts's LEAD_STATUSES ordering. Won/lost count as "beyond qualified" too (the lead was actively decided, not stuck). */
const BEYOND_QUALIFIED = new Set(["qualified", "negotiating", "won", "lost"]);

function daysBetween(fromIso: string, toIso: string): number {
  return (new Date(toIso).getTime() - new Date(fromIso).getTime()) / (24 * 60 * 60 * 1000);
}

export function buildLeadConversionFeatures(
  lead: { createdAt: string; vehicleLabel: string | null },
  activitiesForLead: Activity[],
  observationCutoff: string
): LeadConversionFeatures {
  // The leakage boundary lives here, not in the caller — no feature below can ever see an activity created after this filter.
  const inWindow = activitiesForLead.filter((a) => a.createdAt <= observationCutoff);

  let manualActivityCount = 0;
  let statusChangeCount = 0;
  let reachedQualifiedOrBeyond = 0;
  let hadDealCreated = 0;
  let followUpScheduledCount = 0;
  let followUpCompletedCount = 0;
  let lastActivityAt: string | null = null;

  for (const activity of inWindow) {
    if (MANUAL_TYPES.has(activity.type)) manualActivityCount += 1;
    if (activity.type === "status_change") {
      statusChangeCount += 1;
      const metadata = activity.metadata as { toStatus?: string } | null;
      if (metadata?.toStatus && BEYOND_QUALIFIED.has(metadata.toStatus)) reachedQualifiedOrBeyond = 1;
    }
    if (activity.type === "deal_created") hadDealCreated = 1;
    if (activity.type === "follow_up_scheduled") followUpScheduledCount += 1;
    if (activity.type === "follow_up_completed") followUpCompletedCount += 1;
    if (!lastActivityAt || activity.createdAt > lastActivityAt) lastActivityAt = activity.createdAt;
  }

  const daysSinceLastActivity = lastActivityAt
    ? daysBetween(lastActivityAt, observationCutoff)
    : daysBetween(lead.createdAt, observationCutoff);

  return {
    hasVehicleInterest: lead.vehicleLabel ? 1 : 0,
    activityCount: inWindow.length,
    manualActivityCount,
    statusChangeCount,
    reachedQualifiedOrBeyond,
    hadDealCreated,
    followUpScheduledCount,
    followUpCompletedCount,
    daysSinceLastActivity,
  };
}

export function featuresToVector(features: LeadConversionFeatures): number[] {
  return LEAD_CONVERSION_FEATURE_NAMES.map((name) => features[name]);
}
