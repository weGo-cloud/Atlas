import type { ActivityRepository } from "../../../activities/repository/activity-repository";
import type { LeadRepository } from "../../../leads/repository/lead-repository";
import type { Prediction } from "../domain/prediction";
import { LEAD_CONVERSION_CONFIG } from "../lead-conversion/config";
import { buildLeadConversionFeatures } from "../lead-conversion/feature-builder";
import type { ModelArtifactStore } from "../lead-conversion/model-artifact";
import { buildLeadConversionPrediction } from "../lead-conversion/predict";

function daysBetween(fromIso: string, toIso: string): number {
  return (new Date(toIso).getTime() - new Date(fromIso).getTime()) / (24 * 60 * 60 * 1000);
}

function addDays(iso: string, days: number): string {
  return new Date(new Date(iso).getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Mission 023 — Section 6/19/25. Business scoping is entirely
 * inherited from the repositories this is constructed with (see
 * service/index.ts) — this class never sees or handles a businessId
 * itself, the same pattern as every other Intelligence service.
 * `ModelArtifactStore` is not business-scoped — a trained model is a
 * cross-business statistical artifact (it never contains any single
 * business's records once trained), but the *features it scores* are
 * always fetched through this instance's business-scoped repositories,
 * so one business's prediction is always computed only from that
 * business's own lead/activity data (Section 25).
 */
export class PredictionService {
  constructor(
    private readonly leadRepository: LeadRepository,
    private readonly activityRepository: ActivityRepository,
    private readonly artifactStore: ModelArtifactStore
  ) {}

  /** Section 27's "model status" — deliberately separate from scoring any one entity, so the UI can show whether predictive intelligence is available at all without needing a leadId. */
  async getLeadConversionModelStatus(): Promise<
    { active: false } | { active: true; modelVersion: string; trainedAt: string; trainingDataCutoff: string }
  > {
    const artifact = await this.artifactStore.getActive();
    if (!artifact) return { active: false };
    return {
      active: true,
      modelVersion: artifact.modelVersion,
      trainedAt: artifact.trainedAt,
      trainingDataCutoff: artifact.trainingDataCutoff,
    };
  }

  async predictLeadConversion(leadId: string, now: string = new Date().toISOString()): Promise<Prediction> {
    const base = { id: `lead-conversion:${leadId}:${now}`, type: "lead_conversion", entityType: "lead", entityId: leadId, generatedAt: now };

    const lead = await this.leadRepository.getLeadById(leadId);
    if (!lead) {
      return { ...base, status: "ERROR", reason: "Lead not found." };
    }

    const ageDays = daysBetween(lead.createdAt, now);
    if (ageDays < LEAD_CONVERSION_CONFIG.observationWindowDays) {
      return {
        ...base,
        status: "INSUFFICIENT_DATA",
        reason: `This lead is ${ageDays.toFixed(1)} days old — the model needs at least ${LEAD_CONVERSION_CONFIG.observationWindowDays} days of activity history before it can score a lead.`,
      };
    }
    if (ageDays >= LEAD_CONVERSION_CONFIG.predictionHorizonDays) {
      return {
        ...base,
        status: "UNSUPPORTED",
        reason: `This lead's ${LEAD_CONVERSION_CONFIG.predictionHorizonDays}-day prediction horizon has already passed — whether it converted is already knowable directly from its activity history, not something to predict.`,
      };
    }

    const artifact = await this.artifactStore.getActive();
    if (!artifact) {
      return { ...base, status: "MODEL_NOT_READY", reason: "No trained lead-conversion model is currently active." };
    }

    const observationCutoff = addDays(lead.createdAt, LEAD_CONVERSION_CONFIG.observationWindowDays);
    const activities = await this.activityRepository.getActivitiesForLeads([leadId], observationCutoff);
    const features = buildLeadConversionFeatures(lead, activities, observationCutoff);

    return buildLeadConversionPrediction(artifact, leadId, features, now);
  }
}
