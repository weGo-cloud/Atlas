import { AlertTriangle, CalendarClock, CalendarX2, ClipboardList } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { FollowUpMetrics, IntegrityMetrics } from "../domain/metrics";
import { formatCount } from "../lib/format";

/**
 * Follow-ups and the transaction-integrity metric share one card:
 * both are "what needs attention right now" operational signals, not
 * period-ranged performance metrics (Sections 3 and 5), so grouping
 * them apart from the ranged KPI grid reflects that distinction
 * rather than just being a layout convenience.
 */
export function OperationsCard({
  followUps,
  integrity,
}: {
  followUps: FollowUpMetrics;
  integrity: IntegrityMetrics;
}) {
  const rows = [
    {
      label: "Overdue follow-ups",
      value: followUps.overdueFollowUps,
      icon: CalendarX2,
      emphasis: followUps.overdueFollowUps > 0,
    },
    {
      label: "Due today",
      value: followUps.dueFollowUps,
      icon: CalendarClock,
      emphasis: false,
    },
    {
      label: "Upcoming follow-ups",
      value: followUps.upcomingFollowUps,
      icon: ClipboardList,
      emphasis: false,
    },
    {
      label: "Active leads without a follow-up",
      value: followUps.activeLeadsWithoutFollowUp,
      icon: ClipboardList,
      emphasis: false,
    },
    {
      label: "Completed Deals awaiting a Sale record",
      value: integrity.completedDealsAwaitingSale,
      icon: AlertTriangle,
      emphasis: integrity.completedDealsAwaitingSale > 0,
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Needs attention</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex flex-col divide-y divide-border">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
              <div className="flex items-center gap-2.5">
                <row.icon className="h-4 w-4 shrink-0 text-subtle-foreground" />
                <span className="text-sm text-muted-foreground">{row.label}</span>
              </div>
              <span
                className={
                  "font-mono text-sm font-semibold tabular-nums " +
                  (row.emphasis ? "text-warning" : "text-foreground")
                }
              >
                {formatCount(row.value)}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
