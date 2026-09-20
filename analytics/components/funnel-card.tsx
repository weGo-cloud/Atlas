import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { FunnelMetrics } from "../domain/metrics";
import { formatCount, formatRate } from "../lib/format";

/**
 * Section 4's funnel, rendered as descending bars sized relative to
 * totalLeads. Deliberately keeps "Lead won" and "Vehicle sold" as
 * distinct stages rather than collapsing them (a won Lead's Deal may
 * still be mid-negotiation, and a completed Deal may still be
 * awaiting its Sale record — see the Integrity card).
 */
export function FunnelCard({ funnel }: { funnel: FunnelMetrics }) {
  const stages: { label: string; count: number; rate: number | null }[] = [
    { label: "Leads", count: funnel.totalLeads, rate: null },
    { label: "Leads with a Deal", count: funnel.leadsWithDeals, rate: funnel.leadToDealRate },
    {
      label: "Leads with a Completed Deal",
      count: funnel.leadsWithCompletedDeals,
      rate: funnel.leadToCompletedDealRate,
    },
    { label: "Leads with a Sale", count: funnel.leadsWithSales, rate: funnel.leadToSaleRate },
  ];

  const maxCount = Math.max(funnel.totalLeads, 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Lead-to-sale funnel</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {funnel.totalLeads === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No leads created in this period yet.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {stages.map((stage) => (
              <div key={stage.label} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-muted-foreground">{stage.label}</span>
                  <span className="font-mono font-semibold tabular-nums text-foreground">
                    {formatCount(stage.count)}
                    {stage.rate !== null ? (
                      <span className="ml-2 text-xs font-normal text-subtle-foreground">
                        {formatRate(stage.rate)}
                      </span>
                    ) : null}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${(stage.count / maxCount) * 100}%` }}
                  />
                </div>
              </div>
            ))}

            <div className="mt-2 flex items-baseline justify-between border-t border-border pt-3 text-sm">
              <span className="text-muted-foreground">Completed Deal → Sale</span>
              <span className="font-mono font-semibold tabular-nums text-foreground">
                {formatCount(funnel.completedDealsWithSaleInRange)} / {formatCount(funnel.completedDealsInRange)}
                <span className="ml-2 text-xs font-normal text-subtle-foreground">
                  {formatRate(funnel.dealToSaleRate)}
                </span>
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
