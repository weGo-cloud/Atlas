import { Card, CardContent } from "@/components/ui/card";
import { formatCount } from "../../../analytics/lib/format";
import type { DecisionSummary } from "../domain/result";
import type { Priority } from "../../operational/domain/priority";

const ROWS: { key: Priority; label: string; className: string }[] = [
  { key: "URGENT", label: "Urgent", className: "text-destructive" },
  { key: "HIGH", label: "High", className: "text-warning" },
  { key: "MEDIUM", label: "Medium", className: "text-primary" },
  { key: "LOW", label: "Low", className: "text-muted-foreground" },
];

export function DecisionSummaryStrip({ summary }: { summary: DecisionSummary }) {
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-6 p-5">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Decisions needing attention</p>
          <p className="mt-1 font-mono text-2xl font-semibold tracking-tight text-foreground">
            {formatCount(summary.totalDecisions)}
          </p>
          {summary.withPredictiveEvidence > 0 || summary.withUnavailablePredictiveEvidence > 0 ? (
            <p className="mt-0.5 text-xs text-subtle-foreground">
              {summary.withPredictiveEvidence} with predictive evidence
              {summary.withUnavailablePredictiveEvidence > 0
                ? `, ${summary.withUnavailablePredictiveEvidence} awaiting enough data`
                : ""}
            </p>
          ) : null}
        </div>
        <div className="flex flex-1 flex-wrap items-center gap-6">
          {ROWS.map((row) => (
            <div key={row.key} className="flex flex-col">
              <span className="text-xs text-subtle-foreground">{row.label}</span>
              <span className={`font-mono text-lg font-semibold tabular-nums ${row.className}`}>
                {formatCount(summary.byPriority[row.key])}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
