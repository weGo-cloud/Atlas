import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPriceKsh } from "@/features/inventory/lib/format";
import type { Sale } from "../domain/sale";
import { SaleBadge } from "./sale-badge";
import { CreateSaleDialog } from "./create-sale-dialog";

type DealSaleSummaryProps = {
  dealId: string;
  dealStatus: string;
  dealAgreedPrice: number;
  sale: Sale | null;
  /** Server-derived — the create action re-enforces this regardless (Mission 019, Section 19). */
  canCreateSale: boolean;
};

/**
 * Mission 019, Section 16 — extends Deal detail with its associated
 * Sale, or a "Finalize Sale" action only when the deal actually
 * qualifies (completed, no sale yet) and the viewer has permission.
 * Nothing renders for a deal that isn't completed and has no sale —
 * there's nothing meaningful to show yet.
 */
function DealSaleSummary({ dealId, dealStatus, dealAgreedPrice, sale, canCreateSale }: DealSaleSummaryProps) {
  const eligibleForSale = dealStatus === "completed" && !sale;

  if (!sale && !eligibleForSale) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>Sale</CardTitle>
        {eligibleForSale && canCreateSale && (
          <CreateSaleDialog dealId={dealId} defaultSaleAmount={dealAgreedPrice} />
        )}
      </CardHeader>
      <CardContent className="pt-0">
        {sale ? (
          <Link
            href={`/app/sales/${sale.id}`}
            className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface px-3 py-2.5 transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <div className="flex items-center gap-2">
              <SaleBadge />
              <span className="text-sm font-medium text-foreground">{formatPriceKsh(sale.saleAmount)}</span>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-subtle-foreground" />
          </Link>
        ) : (
          <p className="text-sm text-muted-foreground">
            {canCreateSale
              ? "This deal is completed and ready to finalize as a sale."
              : "This deal is completed. An owner can finalize it as a sale."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export { DealSaleSummary };
