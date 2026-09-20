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
          <div className="flex items-end gap-1.5" style={{ height: 160 }}>
            {points.map((point) => (
              <div
                key={point.periodStart}
                className="group relative flex flex-1 flex-col items-center justify-end gap-1.5"
              >
                <div
                  className="absolute -top-6 hidden whitespace-nowrap rounded-md border border-border bg-surface-2 px-2 py-1 text-xs text-foreground shadow-sm group-hover:block"
                >
                  {point.periodLabel}: {formatPriceKsh(point.grossValue)} ({point.salesCount})
                </div>
                <div
                  className="w-full rounded-t-sm bg-primary"
                  style={{ height: `${Math.max((point.grossValue / maxValue) * 100, point.grossValue > 0 ? 4 : 0)}%` }}
                />
                <span className="truncate text-[10px] text-subtle-foreground">{point.periodLabel}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
