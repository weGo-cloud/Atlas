import { Card, CardContent } from "@/components/ui/card";
import { DATE_RANGE_PRESET_LABEL } from "../../analytics/domain/date-range";
import { formatCount } from "../../analytics/lib/format";
import type { Signal } from "../domain/signal";
import { SeverityBadge } from "./severity-badge";

const CARD_ACCENT: Record<Signal["severity"], string> = {
  INFO: "border-primary/25",
  WARNING: "border-warning/25",
  CRITICAL: "border-destructive/30",
};

/** Evidence values are metric counts/rates from AnalyticsOverview — always whole numbers or small decimals, never currency, so the shared count formatter (not formatPriceKsh) is the right fit here. */
function formatEvidenceValue(value: number): string {
  return Number.isInteger(value) ? formatCount(value) : String(value);
}

export function SignalCard({ signal }: { signal: Signal }) {
  return (
    <Card className={CARD_ACCENT[signal.severity]}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-foreground">{signal.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{signal.summary}</p>
          </div>
          <SeverityBadge severity={signal.severity} />
        </div>

        <div className="mt-4 flex flex-col divide-y divide-border rounded-sm border border-border bg-surface-2/40">
          {signal.evidence.map((item) => (
            <div key={item.metric} className="flex items-center justify-between px-3 py-2 text-sm">
              <span className="text-muted-foreground">{item.label}</span>
              <span className="font-mono font-semibold tabular-nums text-foreground">
                {formatEvidenceValue(item.observedValue)}
                {item.thresholdValue !== undefined ? (
                  <span className="ml-2 text-xs font-normal text-subtle-foreground">
                    threshold {formatEvidenceValue(item.thresholdValue)}
                  </span>
                ) : null}
              </span>
            </div>
          ))}
        </div>

        <p className="mt-3 text-xs text-subtle-foreground">
          {DATE_RANGE_PRESET_LABEL[signal.timeRange.preset]} · source: {signal.sourceMetric}
        </p>
      </CardContent>
    </Card>
  );
}
