import Link from "next/link";

import { Table } from "@/components/ui/table";
import { ChevronRight } from "lucide-react";

import type { Customer } from "@/features/customers/domain/customer";
import { formatPriceKsh } from "@/features/inventory/lib/format";
import type { Vehicle } from "@/features/inventory/data/types";
import type { Sale } from "../domain/sale";
import { SaleBadge } from "./sale-badge";

function formatSaleDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" });
}

type SalesTableProps = {
  sales: Sale[];
  customersById: Map<string, Customer>;
  vehiclesById: Map<string, Vehicle>;
};

function SalesTable({ sales, customersById, vehiclesById }: SalesTableProps) {
  return (
    <Table className="min-w-[46rem]">
        <thead className="border-b border-border bg-surface-2">
          <tr>
            <th scope="col" className="whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Customer</th>
            <th scope="col" className="whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Vehicle</th>
            <th scope="col" className="whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Status</th>
            <th scope="col" className="whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Sale amount</th>
            <th scope="col" className="whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Sold</th>
            <th scope="col" className="relative px-4 py-2.5"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {sales.map((sale) => {
            const customer = customersById.get(sale.customerId);
            const vehicle = sale.vehicleId ? vehiclesById.get(sale.vehicleId) : undefined;

            return (
              <tr key={sale.id} className="transition-colors hover:bg-surface-2/70">
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
                  ) : sale.vehicleLabel ? (
                    <span className="text-muted-foreground">
                      {sale.vehicleLabel} <span className="italic">(no longer in inventory)</span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <SaleBadge />
                </td>
                <td className="px-4 py-2.5 text-foreground">{formatPriceKsh(sale.saleAmount)}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{formatSaleDate(sale.soldAt)}</td>
                <td className="px-4 py-2.5 text-right">
                  <Link
                    href={`/app/sales/${sale.id}`}
                    aria-label="View sale"
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

export { SalesTable };
