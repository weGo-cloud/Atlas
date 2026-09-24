import { DATE_RANGE_PRESET_LABEL } from "../../analytics/domain/date-range";
import { formatCount } from "../../analytics/lib/format";
import type { Signal } from "../domain/signal";
import { InsightCard, InsightEvidence, InsightHeader, InsightSection, type InsightTone } from "./insight";
import { SeverityBadge } from "./severity-badge";

const TONE: Record<Signal["severity"], InsightTone> = {
  INFO: "info",
  WARNING: "high",
  CRITICAL: "urgent",
};

/** Evidence values are metric counts/rates from AnalyticsOverview — always whole numbers or small decimals, never currency, so the shared count formatter (not formatPriceKsh) is the right fit here. */
function formatEvidenceValue(value: number): string {
  return Number.isInteger(value) ? formatCount(value) : String(value);
}

export function SignalCard({ signal }: { signal: Signal }) {
  return (
    <InsightCard tone={TONE[signal.severity]}>
      <InsightHeader
        title={signal.title}
        summary={signal.summary}
        aside={<SeverityBadge severity={signal.severity} />}
      />

      <InsightSection label="Evidence">
        <InsightEvidence
          rows={signal.evidence.map((item) => ({
            key: item.metric,
            label: item.label,
            value: (
              <>
                {formatEvidenceValue(item.observedValue)}
                {item.thresholdValue !== undefined ? (
                  <span className="ml-2 text-xs font-normal text-subtle-foreground">
                    threshold {formatEvidenceValue(item.thresholdValue)}
                  </span>
                ) : null}
              </>
            ),
          }))}
        />
        <p className="mt-3 text-xs text-subtle-foreground">
          {DATE_RANGE_PRESET_LABEL[signal.timeRange.preset]} · source: {signal.sourceMetric}
        </p>
      </InsightSection>
    </InsightCard>
  );
}
