import type { ResolvedDateRange } from "../../../analytics/domain/date-range";
import type { OperationalIntelligenceService } from "../../operational/service/operational-intelligence-service";
import type { DecisionPredictionSource } from "../domain/predictive-attachment";
import { buildDecisionContext } from "../domain/context";
import { evaluateDecisions } from "../domain/engine";
import { composeDecisionResult, type DecisionIntelligenceResult } from "../domain/result";

/**
 * Mission 024 — the single orchestration entry point:
 *
 *   OperationalIntelligenceResult → DecisionContext → Decision[] → DecisionIntelligenceResult
 *
 * Depends on OperationalIntelligenceService (M022) for recommendations
 * and a DecisionPredictionSource (in practice, M023's PredictionService)
 * for per-lead predictions — never a repository, never AnalyticsService
 * or IntelligenceService directly (Section "ARCHITECTURAL POSITION":
 * "do not bypass existing layers"). Business scoping is entirely
 * inherited from the two dependencies this is constructed with (see
 * index.ts) — this class never sees or handles a businessId itself.
 */
export class DecisionIntelligenceService {
  constructor(
    private readonly operationalIntelligenceService: OperationalIntelligenceService,
    private readonly predictionSource: DecisionPredictionSource
  ) {}

  async getDecisionIntelligence(
    range: ResolvedDateRange,
    now: string = new Date().toISOString()
  ): Promise<DecisionIntelligenceResult> {
    const operationalResult = await this.operationalIntelligenceService.getOperationalIntelligence(range, now);
    const context = buildDecisionContext(operationalResult);
    const decisions = await evaluateDecisions(context, this.predictionSource, now);
    return composeDecisionResult(context.dateRange, decisions, operationalResult.recommendations, operationalResult.signals, now);
  }
}
