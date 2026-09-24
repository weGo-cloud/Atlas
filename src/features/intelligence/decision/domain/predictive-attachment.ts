import type { Prediction } from "../../predictive/domain/prediction";
import type { DecisionPredictiveEvidence, DecisionPredictiveSummary } from "./decision";
import type { DraftDecision } from "./rules";

/**
 * Mission 024 — a minimal interface (not the concrete
 * PredictionService) so this module — and its tests — never need a
 * real database or artifact store. Any object with this one method
 * works, including a fake that returns canned Predictions.
 */
export interface DecisionPredictionSource {
  predictLeadConversion(leadId: string, now: string): Promise<Prediction>;
}

/**
 * Section "PREDICTIVE EVIDENCE": only a `status: "AVAILABLE"`
 * prediction ever becomes a `DecisionPredictiveEvidence`. Every other
 * status (`INSUFFICIENT_DATA`, `MODEL_NOT_READY`, `UNSUPPORTED`,
 * `ERROR`) is counted in `unavailableCount` and nowhere else — never
 * treated as a probability, never treated as "risk", never averaged
 * into anything. This is the one place that boundary is enforced, so
 * every caller downstream (scoring, UI) can trust it's already true.
 */
export async function attachPredictiveEvidence(
  draft: DraftDecision,
  predictiveEligible: boolean,
  source: DecisionPredictionSource,
  now: string
): Promise<DecisionPredictiveSummary> {
  if (!predictiveEligible) return { available: [], unavailableCount: 0 };

  const leadEntities = draft.affectedEntities.filter((entity) => entity.type === "lead");
  if (leadEntities.length === 0) return { available: [], unavailableCount: 0 };

  const predictions = await Promise.all(leadEntities.map((entity) => source.predictLeadConversion(entity.id, now)));

  const available: DecisionPredictiveEvidence[] = [];
  let unavailableCount = 0;

  predictions.forEach((prediction, index) => {
    if (prediction.status === "AVAILABLE") {
      const entity = leadEntities[index];
      available.push({
        entityId: entity.id,
        entityType: "lead",
        entityLabel: entity.label,
        probability: prediction.probability,
        class: prediction.class,
        modelVersion: prediction.model.modelVersion,
      });
    } else {
      unavailableCount += 1;
    }
  });

  return { available, unavailableCount };
}
