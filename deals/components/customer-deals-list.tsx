import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPriceKsh } from "@/features/inventory/lib/format";
import type { Vehicle } from "@/features/inventory/data/types";
import type { Deal } from "../domain/deal";
import { DealStatusBadge } from "./deal-status-badge";

function formatDealDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" });
}

type CustomerDealsListProps = {
  deals: Deal[];
  vehiclesById: Map<string, Vehicle>;
};

/** Mission 018, Section 14 — extends Customer detail with the customer's Deals (active and historical). Read-only here; creation happens from the originating Lead. */
function CustomerDealsList({ deals, vehiclesById }: CustomerDealsListProps) {
  if (deals.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Deals</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <ul className="divide-y divide-border">
          {deals.map((deal) => {
            const vehicle = deal.vehicleId ? vehiclesById.get(deal.vehicleId) : undefined;
            return (
              <li key={deal.id} className="flex items-start justify-between gap-4 py-3">
                <div className="min-w-0">
                  <Link
                    href={`/app/deals/${deal.id}`}
                    className="text-sm font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    {vehicle
                      ? `${vehicle.year} ${vehicle.make} ${vehicle.model}`
                      : deal.vehicleLabel
                        ? `${deal.vehicleLabel} (no longer in inventory)`
                        : "Deal"}
                  </Link>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatPriceKsh(deal.agreedPrice)} · Created {formatDealDate(deal.createdAt)}
                  </p>
                </div>
                <DealStatusBadge status={deal.status} />
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

export { CustomerDealsList };
