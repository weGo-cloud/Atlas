import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { SaleQuery } from "../domain/sale-query";
import { buildSalesQueryString } from "../lib/sales-query-params";

type SalesPaginationProps = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  query: SaleQuery;
};

function SalesPagination({ page, pageSize, total, totalPages, query }: SalesPaginationProps) {
  if (total === 0) return null;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
      <p className="text-xs text-muted-foreground">
        Showing <span className="font-medium text-foreground">{start}</span>
        {"–"}
        <span className="font-medium text-foreground">{end}</span> of{" "}
        <span className="font-medium text-foreground">{total}</span> sales
      </p>

      <div className="flex items-center gap-1.5">
        <Button asChild={page > 1} variant="outline" size="sm" disabled={page <= 1} className="gap-1">
          {page > 1 ? (
            <Link href={`/app/sales${buildSalesQueryString(query, { page: page - 1 })}`}>
              <ChevronLeft className="h-3.5 w-3.5" />
              Previous
            </Link>
          ) : (
            <span>
              <ChevronLeft className="h-3.5 w-3.5" />
              Previous
            </span>
          )}
        </Button>

        <span className="px-2 text-xs text-muted-foreground">
          Page {page} of {totalPages}
        </span>

        <Button asChild={page < totalPages} variant="outline" size="sm" disabled={page >= totalPages} className="gap-1">
          {page < totalPages ? (
            <Link href={`/app/sales${buildSalesQueryString(query, { page: page + 1 })}`}>
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          ) : (
            <span>
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </span>
          )}
        </Button>
      </div>
    </div>
  );
}

export { SalesPagination };
