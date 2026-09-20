import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPriceKsh } from "@/features/inventory/lib/format";
import type { Sale } from "../domain/sale";
import { SaleBadge } from "./sale-badge";

function formatSaleDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" });
}

type VehicleSaleSummaryProps = {
  sale: Sale;
};

/**
 * Mission 019, Section 15 — historical Sale information on the
 * Vehicle detail page, kept clearly distinct from the vehicle's own
 * (mutable) listing information: this card shows the frozen sale
 * amount and date, never the vehicle's current listing price. Only
 * rendered when a sale actually exists — a sold-but-unsale-recorded
 * vehicle (shouldn't normally happen) shows nothing here rather than
 * a misleading historical card.
 */
function VehicleSaleSummary({ sale }: VehicleSaleSummaryProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sale record</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <Link
          href={`/app/sales/${sale.id}`}
          className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface px-3 py-2.5 transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <div className="flex items-center gap-2">
            <SaleBadge />
            <div>
              <p className="text-sm font-medium text-foreground">{formatPriceKsh(sale.saleAmount)}</p>
              <p className="text-xs text-muted-foreground">Sold {formatSaleDate(sale.soldAt)}</p>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-subtle-foreground" />
        </Link>
      </CardContent>
    </Card>
  );
}

export { VehicleSaleSummary };
