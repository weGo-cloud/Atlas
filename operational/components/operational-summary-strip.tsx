import { Card, CardContent } from "@/components/ui/card";
import { formatCount } from "../../../analytics/lib/format";
import type { OperationalSummary } from "../domain/operational-result";
import type { Priority } from "../domain/priority";

const ROWS: { key: Priority; label: string; className: string }[] = [
  { key: "URGENT", label: "Urgent", className: "text-destructive" },
  { key: "HIGH", label: "High", className: "text-warning" },
  { key: "MEDIUM", label: "Medium", className: "text-primary" },
  { key: "LOW", label: "Low", className: "text-muted-foreground" },
];

export function OperationalSummaryStrip({ summary }: { summary: OperationalSummary }) {
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-6 p-5">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Recommendations</p>
          <p className="mt-1 font-mono text-2xl font-semibold tracking-tight text-foreground">
            {formatCount(summary.totalRecommendations)}
          </p>
          <p className="mt-0.5 text-xs text-subtle-foreground">
            from {formatCount(summary.totalSignals)} detected signal{summary.totalSignals === 1 ? "" : "s"}
          </p>
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
