import type { AnalyticsService } from "../../analytics/service/analytics-service";
import type { ResolvedDateRange } from "../../analytics/domain/date-range";
import { buildIntelligenceContext } from "../domain/context";
import { evaluateSignals } from "../domain/engine";
import { composeIntelligenceResult, type IntelligenceResult } from "../domain/insight";
import { RULES } from "../domain/rules";

/**
 * Mission 021 — Section 11. The single orchestration entry point:
 *
 *   AnalyticsOverview → IntelligenceContext → Signal[] → IntelligenceResult
 *
 * Depends on AnalyticsService directly (not a repository) — Section 1
 * / Section 13 require Intelligence to consume the *trusted Analytics
 * result contract*, not recreate database aggregation, so there is
 * deliberately no IntelligenceRepository. Business scoping is
 * entirely inherited from the AnalyticsService instance this is
 * constructed with (see service/index.ts) — this class never sees or
 * handles a businessId itself, so there is nothing here that could
 * accept one as a client-controlled parameter.
 */
export class IntelligenceService {
  constructor(private readonly analyticsService: AnalyticsService) {}

  async getIntelligence(range: ResolvedDateRange, now: string = new Date().toISOString()): Promise<IntelligenceResult> {
    const overview = await this.analyticsService.getOverview(range, now);
    const context = buildIntelligenceContext(overview);
    const signals = evaluateSignals(RULES, context, now);
    return composeIntelligenceResult(context, signals, now);
  }
}
