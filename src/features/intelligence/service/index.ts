import { getAnalyticsService } from "../../analytics/service";
import { IntelligenceService } from "./intelligence-service";

/** Mission 021 — see analytics/service/index.ts for the factory-vs-singleton rationale. Business scoping flows entirely from the AnalyticsService this is built on. */
export function getIntelligenceService(businessId: string): IntelligenceService {
  return new IntelligenceService(getAnalyticsService(businessId));
}

export { IntelligenceService };
