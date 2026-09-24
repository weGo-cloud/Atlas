import type { ResolvedDateRange } from "../../../analytics/domain/date-range";
import type { OperationalIntelligenceResult } from "../../operational/domain/operational-result";
import type { Recommendation } from "../../operational/domain/recommendation";

/**
 * Mission 024 — the same thin-wrapper pattern M021's IntelligenceContext
 * and M022's OperationalContext both use: a typed pass-through of the
 * trusted upstream result, not a re-derivation of it. No `businessId`
 * field, for the same reason as its two predecessors — this is always
 * built from an already business-scoped OperationalIntelligenceResult.
 */
export type DecisionContext = {
  dateRange: ResolvedDateRange;
  recommendations: Recommendation[];
};

export function buildDecisionContext(operationalResult: OperationalIntelligenceResult): DecisionContext {
  return { dateRange: operationalResult.timeRange, recommendations: operationalResult.recommendations };
}
