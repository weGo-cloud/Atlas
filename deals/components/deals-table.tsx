import Link from "next/link";
import { ChevronRight } from "lucide-react";

import type { Customer } from "@/features/customers/domain/customer";
import { formatPriceKsh } from "@/features/inventory/lib/format";
import type { Vehicle } from "@/features/inventory/data/types";
import type { Deal } from "../domain/deal";
import { DealStatusBadge } from "./deal-status-badge";

function formatDealDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" });
}

type DealsTableProps = {
  deals: Deal[];
  customersById: Map<string, Customer>;
  vehiclesById: Map<string, Vehicle>;
};

function DealsTable({ deals, customersById, vehiclesById }: DealsTableProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="border-b border-border bg-surface-2/50 text-left text-xs font-medium text-muted-foreground">
          <tr>
            <th className="px-4 py-2.5">Customer</th>
            <th className="px-4 py-2.5">Vehicle</th>
            <th className="px-4 py-2.5">Status</th>
            <th className="px-4 py-2.5">Agreed price</th>
            <th className="px-4 py-2.5">Created</th>
            <th className="px-4 py-2.5" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {deals.map((deal) => {
            const customer = customersById.get(deal.customerId);
            const vehicle = deal.vehicleId ? vehiclesById.get(deal.vehicleId) : undefined;

            return (
              <tr key={deal.id} className="transition-colors hover:bg-surface-2/40">
                <td className="px-4 py-2.5">
                  {customer ? (
                    <Link
                      href={`/app/customers/${customer.id}`}
                      className="font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      {customer.name}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">Unknown customer</span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  {vehicle ? (
                    <Link
                      href={`/app/inventory/${vehicle.id}`}
                      className="text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      {vehicle.year} {vehicle.make} {vehicle.model}
                    </Link>
                  ) : deal.vehicleLabel ? (
                    <span className="text-muted-foreground">
                      {deal.vehicleLabel} <span className="italic">(no longer in inventory)</span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <DealStatusBadge status={deal.status} />
                </td>
                <td className="px-4 py-2.5 text-foreground">{formatPriceKsh(deal.agreedPrice)}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{formatDealDate(deal.createdAt)}</td>
                <td className="px-4 py-2.5 text-right">
                  <Link
                    href={`/app/deals/${deal.id}`}
                    aria-label="View deal"
                    className="inline-flex text-subtle-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export { DealsTable };
