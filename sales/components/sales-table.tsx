import Link from "next/link";
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
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="border-b border-border bg-surface-2/50 text-left text-xs font-medium text-muted-foreground">
          <tr>
            <th className="px-4 py-2.5">Customer</th>
            <th className="px-4 py-2.5">Vehicle</th>
            <th className="px-4 py-2.5">Status</th>
            <th className="px-4 py-2.5">Sale amount</th>
            <th className="px-4 py-2.5">Sold</th>
            <th className="px-4 py-2.5" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {sales.map((sale) => {
            const customer = customersById.get(sale.customerId);
            const vehicle = sale.vehicleId ? vehiclesById.get(sale.vehicleId) : undefined;

            return (
              <tr key={sale.id} className="transition-colors hover:bg-surface-2/40">
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
      </table>
    </div>
  );
}

export { SalesTable };
