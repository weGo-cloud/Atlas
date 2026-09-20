import { featureContributions, predictProbability } from "../ml/logistic-regression";
import type { Prediction, PredictionEvidenceFactor } from "../domain/prediction";
import { LEAD_CONVERSION_CONFIG } from "./config";
import { LEAD_CONVERSION_FEATURE_NAMES, type LeadConversionFeatures, featuresToVector } from "./feature-builder";
import type { LeadConversionModelArtifact } from "./model-artifact";

const CLASSIFICATION_THRESHOLD = 0.5;

const FEATURE_LABELS: Record<(typeof LEAD_CONVERSION_FEATURE_NAMES)[number], string> = {
  hasVehicleInterest: "Interested in a specific vehicle",
  activityCount: "Activity in the observation window",
  manualActivityCount: "Staff-logged interactions (calls/notes/meetings/emails)",
  statusChangeCount: "Pipeline status changes",
  reachedQualifiedOrBeyond: "Reached \"qualified\" or further",
  hadDealCreated: "A Deal was opened",
  followUpScheduledCount: "Follow-ups scheduled",
  followUpCompletedCount: "Follow-ups completed",
  daysSinceLastActivity: "Days since last activity",
};

/**
 * Mission 023 — Section 18. Evidence is exactly the model's own
 * per-feature contributions (see logistic-regression.ts's
 * `featureContributions`) sorted by magnitude — the top factors are
 * literally the features that moved this specific prediction the
 * most, not a separately-invented explanation layer.
 */
function buildEvidence(model: LeadConversionModelArtifact["model"], features: LeadConversionFeatures): PredictionEvidenceFactor[] {
  const vector = featuresToVector(features);
  const contributions = featureContributions(model, vector);

  return LEAD_CONVERSION_FEATURE_NAMES.map((name, i) => ({
    feature: name,
    label: FEATURE_LABELS[name],
    value: vector[i],
    contribution: contributions[i],
  })).sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
}

export function buildLeadConversionPrediction(
  artifact: LeadConversionModelArtifact,
  leadId: string,
  features: LeadConversionFeatures,
  generatedAt: string
): Prediction {
  const vector = featuresToVector(features);
  const probability = predictProbability(artifact.model, vector);

  return {
    id: `lead-conversion:${leadId}:${generatedAt}`,
    type: "lead_conversion",
    entityType: "lead",
    entityId: leadId,
    generatedAt,
    horizonDays: LEAD_CONVERSION_CONFIG.predictionHorizonDays,
    status: "AVAILABLE",
    probability,
    class: probability >= CLASSIFICATION_THRESHOLD ? "positive" : "negative",
    model: {
      modelVersion: artifact.modelVersion,
      featureVersion: artifact.featureVersion,
      trainedAt: artifact.trainedAt,
      trainingDataCutoff: artifact.trainingDataCutoff,
      algorithm: artifact.algorithm,
    },
    evidence: buildEvidence(artifact.model, features),
  };
}
