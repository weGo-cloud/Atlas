import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPriceKsh } from "@/features/inventory/lib/format";
import type { Deal } from "../domain/deal";
import { DealStatusBadge } from "./deal-status-badge";
import { CreateDealDialog } from "./create-deal-dialog";

type LeadDealSummaryProps = {
  leadId: string;
  /** The lead's active (non-terminal) deal, if any — Section 15: "prevent accidental duplicate creation" when one already exists. */
  activeDeal: Deal | null;
  /** Every deal this lead has ever had, most recent first — shown as history once there's more than the active one. */
  allDeals: Deal[];
  leadVehicle?: { id: string; label: string } | null;
};

/** Mission 018, Section 15 — extends Lead detail with its associated Deal, or a "Create deal" action when none is in progress. */
function LeadDealSummary({ leadId, activeDeal, allDeals, leadVehicle }: LeadDealSummaryProps) {
  const historicalDeals = allDeals.filter((deal) => deal.id !== activeDeal?.id);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>Deal</CardTitle>
        {!activeDeal && <CreateDealDialog leadId={leadId} leadVehicle={leadVehicle} />}
      </CardHeader>
      <CardContent className="flex flex-col gap-3 pt-0">
        {activeDeal ? (
          <Link
            href={`/app/deals/${activeDeal.id}`}
            className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface px-3 py-2.5 transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <div>
              <div className="flex items-center gap-2">
                <DealStatusBadge status={activeDeal.status} />
                <span className="text-sm font-medium text-foreground">
                  {formatPriceKsh(activeDeal.agreedPrice)}
                </span>
              </div>
              {activeDeal.vehicleLabel && (
                <p className="mt-1 text-xs text-muted-foreground">{activeDeal.vehicleLabel}</p>
              )}
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-subtle-foreground" />
          </Link>
        ) : (
          <p className="text-sm text-muted-foreground">
            No deal in progress for this lead yet.
          </p>
        )}

        {historicalDeals.length > 0 && (
          <div className="flex flex-col gap-1.5 border-t border-border pt-3">
            <p className="text-xs font-medium text-muted-foreground">Previous deals</p>
            <ul className="flex flex-col gap-1.5">
              {historicalDeals.map((deal) => (
                <li key={deal.id}>
                  <Link
                    href={`/app/deals/${deal.id}`}
                    className="flex items-center justify-between gap-3 text-sm text-muted-foreground hover:text-foreground hover:underline"
                  >
                    <span>{formatPriceKsh(deal.agreedPrice)}</span>
                    <DealStatusBadge status={deal.status} />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export { LeadDealSummary };
