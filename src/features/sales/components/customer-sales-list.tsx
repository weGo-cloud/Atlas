import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPriceKsh } from "@/features/inventory/lib/format";
import type { Sale } from "../domain/sale";
import { SaleBadge } from "./sale-badge";

function formatSaleDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" });
}

type CustomerSalesListProps = {
  sales: Sale[];
};

/** Mission 019, Section 14 — a customer's completed Sales, kept visually and structurally distinct from CustomerDealsList's active/cancelled Deals rather than merged into one list. */
function CustomerSalesList({ sales }: CustomerSalesListProps) {
  if (sales.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Completed sales</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <ul className="divide-y divide-border">
          {sales.map((sale) => (
            <li key={sale.id} className="flex items-start justify-between gap-4 py-3">
              <div className="min-w-0">
                <Link
                  href={`/app/sales/${sale.id}`}
                  className="text-sm font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {sale.vehicleLabel ?? "Sale"}
                </Link>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {formatPriceKsh(sale.saleAmount)} · {formatSaleDate(sale.soldAt)}
                </p>
              </div>
              <SaleBadge />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export { CustomerSalesList };
