import type { IntelligenceService } from "../../service/intelligence-service";
import type { ResolvedDateRange } from "../../../analytics/domain/date-range";
import { buildOperationalContext } from "../domain/operational-context";
import { evaluateRecommendations } from "../domain/engine";
import { composeOperationalResult, type OperationalIntelligenceResult } from "../domain/operational-result";
import { RECOMMENDATION_RULES } from "../domain/rules";
import type { OperationalEntityResolver } from "../entity-resolution/entity-resolver";

/**
 * Mission 022 — Section 2/10. The single orchestration entry point:
 *
 *   IntelligenceResult → OperationalContext → Recommendation[] → OperationalIntelligenceResult
 *
 * Depends on IntelligenceService (not AnalyticsService, not any
 * repository directly) for signals — Section 17's M020/M021/M022
 * boundary: M022 interprets M021's signals, it doesn't re-detect
 * them. The only repository-level access anywhere in this feature is
 * inside the injected OperationalEntityResolver. Business scoping is
 * entirely inherited from the IntelligenceService and resolver this
 * is constructed with (see index.ts) — this class never sees or
 * handles a businessId itself.
 */
export class OperationalIntelligenceService {
  constructor(
    private readonly intelligenceService: IntelligenceService,
    private readonly entityResolver: OperationalEntityResolver
  ) {}

  async getOperationalIntelligence(
    range: ResolvedDateRange,
    now: string = new Date().toISOString()
  ): Promise<OperationalIntelligenceResult> {
    const intelligenceResult = await this.intelligenceService.getIntelligence(range, now);
    const context = buildOperationalContext(intelligenceResult);
    const recommendations = await evaluateRecommendations(RECOMMENDATION_RULES, context, this.entityResolver, now);
    return composeOperationalResult(context.dateRange, context.signals, recommendations, now);
  }
}
