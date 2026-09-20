import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCount } from "../lib/format";

export type StatusSegment = {
  key: string;
  label: string;
  count: number;
  colorClass: string;
};

/**
 * Generalizes dashboard's InventoryStatusOverview to any status
 * breakdown (leads by status, deals by status) instead of a
 * vehicle-status-specific component — Analytics needs the same
 * segmented-bar treatment for two more domains, and duplicating the
 * whole component per domain would just be the same layout with a
 * different color map.
 */
export function StatusBreakdownCard({
  title,
  segments,
  emptyLabel,
}: {
  title: string;
  segments: StatusSegment[];
  emptyLabel: string;
}) {
  const total = segments.reduce((sum, item) => sum + item.count, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {total === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{emptyLabel}</p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-2">
              {segments.map((segment) =>
                segment.count > 0 ? (
                  <div
                    key={segment.key}
                    className={segment.colorClass}
                    style={{ width: `${(segment.count / total) * 100}%` }}
                    title={`${segment.label}: ${segment.count}`}
                  />
                ) : null
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {segments.map((segment) => (
                <div key={segment.key} className="flex items-center gap-2">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${segment.colorClass}`} />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{segment.label}</p>
                    <p className="text-sm font-semibold tabular-nums text-foreground">
                      {formatCount(segment.count)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
