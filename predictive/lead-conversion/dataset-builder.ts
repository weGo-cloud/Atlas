import type { ActivityRepository } from "../../../activities/repository/activity-repository";
import type { LeadRepository } from "../../../leads/repository/lead-repository";
import { LEAD_CONVERSION_CONFIG } from "./config";
import { buildLeadConversionFeatures, featuresToVector } from "./feature-builder";
import { computeLeadConversionLabel } from "./label-builder";

export type LeadConversionExample = {
  leadId: string;
  /** The lead's own createdAt — the sort key for temporal-split.ts, since that's the true chronological order of when each observation "would have happened". */
  observedAt: string;
  features: number[];
  label: 0 | 1;
};

function addDays(iso: string, days: number): string {
  return new Date(new Date(iso).getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Mission 023 — Section 3's "Historical Dataset" step. Business-
 * scoped through the repositories it's given (never handles
 * businessId itself). Training-only — never called from a request
 * handler (Section 23).
 *
 * Inclusion criteria (Section 4A): a lead is only included once its
 * full prediction horizon has already elapsed as of `now` — otherwise
 * its label would be right-censored (Section 4B's censoring concern,
 * applied here). This is the one place "now" matters at all; every
 * per-lead cutoff downstream is anchored on that lead's own
 * createdAt, not on `now`.
 */
export async function buildLeadConversionDataset(
  leadRepository: LeadRepository,
  activityRepository: ActivityRepository,
  now: string
): Promise<LeadConversionExample[]> {
  const maturityCutoff = addDays(now, -LEAD_CONVERSION_CONFIG.predictionHorizonDays);
  const matureLeads = await leadRepository.getLeadsCreatedBefore(maturityCutoff);
  if (matureLeads.length === 0) return [];

  const activities = await activityRepository.getActivitiesForLeads(
    matureLeads.map((l) => l.id),
    now
  );
  const activitiesByLead = new Map<string, typeof activities>();
  for (const activity of activities) {
    if (!activity.leadId) continue;
    const list = activitiesByLead.get(activity.leadId) ?? [];
    list.push(activity);
    activitiesByLead.set(activity.leadId, list);
  }

  return matureLeads.map((lead) => {
    const leadActivities = activitiesByLead.get(lead.id) ?? [];
    const observationCutoff = addDays(lead.createdAt, LEAD_CONVERSION_CONFIG.observationWindowDays);
    const labelHorizon = addDays(lead.createdAt, LEAD_CONVERSION_CONFIG.predictionHorizonDays);

    const features = buildLeadConversionFeatures(lead, leadActivities, observationCutoff);
    const label = computeLeadConversionLabel(leadActivities, labelHorizon);

    return {
      leadId: lead.id,
      observedAt: lead.createdAt,
      features: featuresToVector(features),
      label,
    };
  });
}
