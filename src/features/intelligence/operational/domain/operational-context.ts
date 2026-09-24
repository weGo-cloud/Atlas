import type { ResolvedDateRange } from "../../../analytics/domain/date-range";
import type { IntelligenceResult } from "../../domain/insight";
import type { Signal } from "../../domain/signal";

/**
 * Mission 022 — Section 3. Same pattern as M021's own
 * IntelligenceContext wrapping AnalyticsOverview: a thin, typed
 * pass-through of the trusted M021 result, not a re-derivation of it.
 * `signals` is hoisted to the top level (instead of leaving callers
 * to reach into a nested `intelligenceResult.signals`) because every
 * recommendation rule reads it directly and by name.
 *
 * No `businessId` field, for the same reason IntelligenceContext has
 * none: this is always built from an already business-scoped
 * IntelligenceResult (IntelligenceService is constructed server-side
 * with a businessId — see intelligence/service/index.ts), so there is
 * no client-controlled business identity here to begin with.
 */
export type OperationalContext = {
  dateRange: ResolvedDateRange;
  signals: Signal[];
};

export function buildOperationalContext(intelligenceResult: IntelligenceResult): OperationalContext {
  return { dateRange: intelligenceResult.timeRange, signals: intelligenceResult.signals };
}
