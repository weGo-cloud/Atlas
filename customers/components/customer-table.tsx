import Link from "next/link";

import { Button } from "@/components/ui/button";
import type { Customer } from "../domain/customer";
import type { PaginatedResult } from "../domain/customer-query";

function buildCustomersQueryString(search: string, page: number): string {
  const params = new URLSearchParams();
  if (search) params.set("q", search);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

function CustomerTable({
  result,
  search,
}: {
  result: PaginatedResult<Customer>;
  search: string;
}) {
  if (result.items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border px-6 py-16 text-center">
        <p className="text-sm font-medium text-foreground">No customers found</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {search
            ? "Try a different search term."
            : "Add your first customer to get started."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-surface-2/50 text-left text-xs font-medium text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5">Name</th>
              <th className="px-4 py-2.5">Phone</th>
              <th className="px-4 py-2.5">Email</th>
              <th className="px-4 py-2.5">Added</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {result.items.map((customer) => (
              <tr key={customer.id} className="transition-colors hover:bg-surface-2/40">
                <td className="px-4 py-2.5">
                  <Link
                    href={`/app/customers/${customer.id}`}
                    className="font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    {customer.name}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">
                  {customer.phone ?? "—"}
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">
                  {customer.email ?? "—"}
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">
                  {new Date(customer.createdAt).toLocaleDateString("en-KE", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {result.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Page {result.page} of {result.totalPages} · {result.total} customers
          </p>
          <div className="flex gap-1.5">
            <Button
              asChild={result.page > 1}
              variant="outline"
              size="sm"
              disabled={result.page <= 1}
            >
              {result.page > 1 ? (
                <Link href={`/app/customers${buildCustomersQueryString(search, result.page - 1)}`}>
                  Previous
                </Link>
              ) : (
                <span>Previous</span>
              )}
            </Button>
            <Button
              asChild={result.page < result.totalPages}
              variant="outline"
              size="sm"
              disabled={result.page >= result.totalPages}
            >
              {result.page < result.totalPages ? (
                <Link href={`/app/customers${buildCustomersQueryString(search, result.page + 1)}`}>
                  Next
                </Link>
              ) : (
                <span>Next</span>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export { CustomerTable };
