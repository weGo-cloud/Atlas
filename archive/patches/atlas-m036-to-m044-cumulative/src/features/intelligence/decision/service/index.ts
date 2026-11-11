import { getOperationalIntelligenceService } from "../../operational/service";
import { getPredictionService } from "../../predictive/service";
import { DecisionIntelligenceService } from "./decision-intelligence-service";

/** Mission 024 — see analytics/service/index.ts for the factory-vs-singleton rationale. Both dependencies are constructed scoped to one business, so the result is inherently business-scoped end to end. */
export function getDecisionIntelligenceService(businessId: string): DecisionIntelligenceService {
  return new DecisionIntelligenceService(getOperationalIntelligenceService(businessId), getPredictionService(businessId));
}

export { DecisionIntelligenceService };
