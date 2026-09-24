import Link from "next/link";

import { Table } from "@/components/ui/table";
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
    <Table className="min-w-[46rem]">
        <thead className="border-b border-border bg-surface-2">
          <tr>
            <th scope="col" className="whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Customer</th>
            <th scope="col" className="whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Vehicle</th>
            <th scope="col" className="whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Status</th>
            <th scope="col" className="whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Agreed price</th>
            <th scope="col" className="whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Created</th>
            <th scope="col" className="relative px-4 py-2.5"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {deals.map((deal) => {
            const customer = customersById.get(deal.customerId);
            const vehicle = deal.vehicleId ? vehiclesById.get(deal.vehicleId) : undefined;

            return (
              <tr key={deal.id} className="transition-colors hover:bg-surface-2/70">
                <td className="px-4 py-2.5 min-w-[10rem] max-w-[16rem]">
                  {customer ? (
                    <Link
                      href={`/app/customers/${customer.id}`}
                      className="font-medium text-foreground rounded-sm hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      {customer.name}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">Unknown customer</span>
                  )}
                </td>
                <td className="px-4 py-2.5 min-w-[9rem] max-w-[14rem] [&_a]:line-clamp-3 [&_a]:block">
                  {vehicle ? (
                    <Link
                      href={`/app/inventory/${vehicle.id}`}
                      className="text-foreground rounded-sm hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
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
      </Table>
  );
}

export { DealsTable };
