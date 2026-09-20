import { PageHeader } from "@/components/shared/page-header";
import { requireCurrentSession } from "@/features/auth/lib/current-session";
import { resolveDateRange } from "@/features/analytics/domain/date-range";
import {
  parseAnalyticsSearchParams,
  type AnalyticsSearchParams,
} from "@/features/analytics/lib/analytics-query-params";

import { IntelligenceDateRangeSelect } from "@/features/intelligence/components/intelligence-date-range-select";
import { IntelligenceEmptyState } from "@/features/intelligence/components/intelligence-empty-state";
import { SignalCard } from "@/features/intelligence/components/signal-card";
import { DecisionCard } from "@/features/intelligence/decision/components/decision-card";
import { DecisionSummaryStrip } from "@/features/intelligence/decision/components/decision-summary-strip";
import { getDecisionIntelligenceService } from "@/features/intelligence/decision/service";
import { OperationalSummaryStrip } from "@/features/intelligence/operational/components/operational-summary-strip";
import { RecommendationCard } from "@/features/intelligence/operational/components/recommendation-card";
import { PRIORITY_RANK } from "@/features/intelligence/operational/domain/priority";
import { PredictiveStatusCard } from "@/features/intelligence/predictive/components/predictive-status-card";
import { getPredictionService } from "@/features/intelligence/predictive/service";

export const metadata = { title: "AI Intelligence · Atlas" };

type IntelligencePageProps = {
  searchParams: Promise<AnalyticsSearchParams>;
};

/** Worst-first — mirrors PRIORITY_RANK/severity ordering used everywhere else in Intelligence, so the most urgent item is always what a reader sees first. */
const SEVERITY_DISPLAY_ORDER = { CRITICAL: 0, WARNING: 1, INFO: 2 } as const;

export default async function IntelligencePage({ searchParams }: IntelligencePageProps) {
  const { business } = await requireCurrentSession();
  // Decision Intelligence is built on top of Operational + Predictive Intelligence (M022/M023) —
  // one call here gets decisions AND the recommendations/signals they were built from (Section
  // "PERFORMANCE": avoid recomputing the operational result a second time just to display it).
  const decisionIntelligenceService = getDecisionIntelligenceService(business.id);
  const predictionService = getPredictionService(business.id);

  const resolvedSearchParams = await searchParams;
  const query = parseAnalyticsSearchParams(resolvedSearchParams);
  const range = resolveDateRange(query.preset, {
    customFrom: query.customFrom,
    customTo: query.customTo,
  });

  const [result, modelStatus] = await Promise.all([
    decisionIntelligenceService.getDecisionIntelligence(range),
    predictionService.getLeadConversionModelStatus(),
  ]);

  // Decisions already come back ranked by the engine (score, then affected-entity count, then id) —
  // displayed in that order, not re-sorted here.
  const sortedRecommendations = [...result.recommendations].sort(
    (a, b) => PRIORITY_RANK.indexOf(a.priority) - PRIORITY_RANK.indexOf(b.priority)
  );
  const sortedSignals = [...result.signals].sort(
    (a, b) => SEVERITY_DISPLAY_ORDER[a.severity] - SEVERITY_DISPLAY_ORDER[b.severity]
  );

  const recommendationByPriority: Record<(typeof PRIORITY_RANK)[number], number> = { URGENT: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const recommendation of sortedRecommendations) recommendationByPriority[recommendation.priority] += 1;
  const highestRecommendationPriority = PRIORITY_RANK.find((p) => recommendationByPriority[p] > 0) ?? null;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="AI Intelligence"
        description="Ranked, explainable decisions — with the recommendations, predictions, and signals behind them — surfaced from your inventory, CRM, deals, and sales data for the selected period."
        actions={<IntelligenceDateRangeSelect preset={query.preset} />}
      />

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">Decisions</h2>
          <p className="mt-1 text-sm text-muted-foreground">What Atlas thinks you should prioritize first.</p>
        </div>

        <DecisionSummaryStrip summary={result.summary} />

        {result.decisions.length === 0 ? (
          <IntelligenceEmptyState />
        ) : (
          <div className="flex flex-col gap-4">
            {result.decisions.map((decision) => (
              <DecisionCard key={decision.id} decision={decision} />
            ))}
          </div>
        )}
      </section>

      {sortedRecommendations.length > 0 ? (
        <section className="flex flex-col gap-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">Operational recommendations</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              The deterministic recommendations the decisions above were built from.
            </p>
          </div>
          <OperationalSummaryStrip
            summary={{
              totalRecommendations: sortedRecommendations.length,
              totalSignals: sortedSignals.length,
              byPriority: recommendationByPriority,
              highestPriority: highestRecommendationPriority,
            }}
          />
          <div className="flex flex-col gap-4">
            {sortedRecommendations.map((recommendation) => (
              <RecommendationCard key={recommendation.id} recommendation={recommendation} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">Predictive evidence</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Whether Atlas currently has enough historical data to power conversion predictions.
          </p>
        </div>
        <PredictiveStatusCard status={modelStatus} />
      </section>

      {sortedSignals.length > 0 ? (
        <section>
          <h2 className="text-sm font-medium text-muted-foreground">Underlying signals</h2>
          <p className="mt-1 text-xs text-subtle-foreground">
            The raw conditions each recommendation and decision above was generated from.
          </p>
          <div className="mt-3 flex flex-col gap-4">
            {sortedSignals.map((signal) => (
              <SignalCard key={signal.id} signal={signal} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
