import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPriceKsh } from "@/features/inventory/lib/format";
import type { SalesTrendPoint } from "../domain/metrics";

/**
 * A plain CSS bar chart, not a charting library — Section 7
 * explicitly rules out premature infrastructure, and this stack has
 * no charting dependency already installed (unlike, say, an artifact
 * environment with recharts available). The underlying
 * SalesTrendPoint[] shape stays generic (Section 8) so a future
 * mission can swap in a real charting library without touching the
 * service/repository layer.
 */
export function SalesTrendChart({ points }: { points: SalesTrendPoint[] }) {
  const maxValue = Math.max(...points.map((p) => p.grossValue), 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sales trend</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {points.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No sales in this period yet.</p>
        ) : (
          // The scroll wrapper keeps many periods inside the card (they scroll, never
          // spill); the top padding leaves room for the hover tooltip, which the
          // wrapper would otherwise clip.
          <div className="scroll-thin overflow-x-auto pt-9">
            <div className="flex items-end gap-1.5" style={{ height: 160, minWidth: `${points.length * 2.25}rem` }}>
              {points.map((point, index) => {
                const summary = `${point.periodLabel}: ${formatPriceKsh(point.grossValue)} (${point.salesCount})`;
                // Anchor each tooltip toward the chart's centre so it can't leave the card at either edge.
                const anchor = index < points.length / 2 ? "left-0" : "right-0";
                return (
                  <div
                    key={point.periodStart}
                    tabIndex={0}
                    aria-label={summary}
                    className="group relative flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <div
                      role="tooltip"
                      className={`absolute -top-9 z-10 hidden max-w-56 rounded-md border border-border bg-surface px-2 py-1 text-xs text-foreground shadow-md group-hover:block group-focus-visible:block ${anchor}`}
                    >
                      {summary}
                    </div>
                    <div
                      className="w-full rounded-t-sm bg-primary"
                      style={{ height: `${Math.max((point.grossValue / maxValue) * 100, point.grossValue > 0 ? 4 : 0)}%` }}
                    />
                    <span className="w-full truncate text-center text-[11px] text-subtle-foreground">{point.periodLabel}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
