import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPriceKsh } from "@/features/inventory/lib/format";
import type { Deal } from "../domain/deal";
import { DealStatusBadge } from "./deal-status-badge";

type VehicleDealSummaryProps = {
  activeDeal: Deal | null;
};

/**
 * Mission 018, Section 16 — surfaces the vehicle's current Deal
 * context without implying a completed sale. The vehicle's own
 * status badge (available/reserved/sold, shown elsewhere on this
 * page) is what actually communicates availability; this card only
 * adds the "which deal is that" link. Nothing renders when there's
 * no active deal — the vehicle's own status already covers "sold"
 * for a deal that's since completed and moved on.
 */
function VehicleDealSummary({ activeDeal }: VehicleDealSummaryProps) {
  if (!activeDeal) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Active deal</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <Link
          href={`/app/deals/${activeDeal.id}`}
          className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface px-3 py-2.5 transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <div className="flex items-center gap-2">
            <DealStatusBadge status={activeDeal.status} />
            <span className="text-sm font-medium text-foreground">
              {formatPriceKsh(activeDeal.agreedPrice)}
            </span>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-subtle-foreground" />
        </Link>
      </CardContent>
    </Card>
  );
}

export { VehicleDealSummary };
