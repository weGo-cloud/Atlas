import type { LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

/**
 * Mirrors dashboard's MetricCard, minus the delta/trend arrow — this
 * mission doesn't implement period-over-period comparison (it isn't
 * in scope), so there's no honest delta to show. A future mission can
 * add it back once a real prior-period comparison exists; showing a
 * fabricated one here would misrepresent real change.
 */
export function AnalyticsMetricCard({
  label,
  value,
  sublabel,
  icon: Icon,
}: {
  label: string;
  value: string;
  sublabel?: string;
  icon: LucideIcon;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <span className="text-sm font-medium text-muted-foreground">{label}</span>
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-surface-2">
            <Icon className="h-4 w-4 text-subtle-foreground" />
          </div>
        </div>
        <p className="mt-3 font-mono text-2xl font-semibold tracking-tight text-foreground">{value}</p>
        {sublabel ? <p className="mt-2 text-xs text-subtle-foreground">{sublabel}</p> : null}
      </CardContent>
    </Card>
  );
}
