import type { Activity } from "../../../activities/domain/activity";

/**
 * Mission 023 — the label itself is time-bounded, not just the
 * features. "Did this lead reach a completed Deal?" is answered as
 * of `labelHorizon` (lead.createdAt + predictionHorizonDays), using
 * the same activity log the features use — a `deal_status_changed`
 * event with `toStatus: "completed"` and `createdAt <= labelHorizon`.
 * This deliberately does NOT ask "is the Deal completed *today*" —
 * a Deal that completes after the horizon is a true negative for
 * this label, exactly matching what a production prediction made at
 * the observation cutoff would have had to guess without ever
 * knowing about that later event (Section 9/10).
 */
export function computeLeadConversionLabel(activitiesForLead: Activity[], labelHorizon: string): 0 | 1 {
  const completedByHorizon = activitiesForLead.some((activity) => {
    if (activity.type !== "deal_status_changed") return false;
    if (activity.createdAt > labelHorizon) return false;
    const metadata = activity.metadata as { toStatus?: string } | null;
    return metadata?.toStatus === "completed";
  });
  return completedByHorizon ? 1 : 0;
}
