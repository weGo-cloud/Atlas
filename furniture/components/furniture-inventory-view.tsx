import Link from "next/link";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  FURNITURE_CATEGORIES,
  FURNITURE_CATEGORY_LABEL,
  FURNITURE_CONDITIONS,
  FURNITURE_CONDITION_LABEL,
  FURNITURE_STATUSES,
  FURNITURE_STATUS_LABEL,
  type FurnitureProduct,
} from "../domain/furniture-product";
import type { FurnitureQuery, PaginatedFurnitureResult } from "../domain/furniture-product-query";
import { buildFurnitureQueryString, hasActiveFurnitureFilters } from "../lib/furniture-query-params";
import { formatAddedDate, formatFurniturePrice } from "../lib/format";
import { FurnitureStatusBadge } from "./status-badge";
import { FurnitureRowActions } from "./furniture-row-actions";

/**
 * Mission 030, Section 12/24/25 — a deliberately single-file
 * combination of what Vehicle's inventory list splits across
 * inventory-view.tsx + inventory-table.tsx + inventory-toolbar.tsx +
 * inventory-pagination.tsx (Section 29/"most important instruction":
 * optimize for a small, clean, working vertical, not file-count parity
 * with Auto). Same underlying pattern though: a plain GET form for
 * filters (no client JS required for the core browse/filter/paginate
 * loop), reusing Atlas's existing Button/Select/Input/Label
 * primitives (Section 25).
 */
export function FurnitureInventoryView({
  result,
  query,
  counts,
  categories,
  primaryPhotoUrlByProductId,
  canDeleteProduct,
}: {
  result: PaginatedFurnitureResult<FurnitureProduct>;
  query: FurnitureQuery;
  counts: Record<string, number>;
  categories: string[];
  primaryPhotoUrlByProductId: Record<string, string>;
  canDeleteProduct: boolean;
}) {
  const totalItems = counts.available + counts.reserved + counts.sold;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Furniture Inventory</h1>
          <p className="text-sm text-muted-foreground">
            {totalItems} product{totalItems === 1 ? "" : "s"} · {counts.available} available · {counts.reserved} reserved ·{" "}
            {counts.sold} sold
          </p>
        </div>
        <Button asChild>
          <Link href="/app/inventory/new">
            <Plus className="h-4 w-4" /> Add product
          </Link>
        </Button>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-lg border border-border p-4">
        <div className="flex min-w-[180px] flex-1 flex-col gap-1.5">
          <Label htmlFor="q">Search</Label>
          <Input id="q" name="q" defaultValue={query.search ?? ""} placeholder="Name or description" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="category">Category</Label>
          <Select id="category" name="category" defaultValue={query.category ?? "all"}>
            <option value="all">All categories</option>
            {(categories.length > 0 ? categories : FURNITURE_CATEGORIES).map((category) => (
              <option key={category} value={category}>
                {FURNITURE_CATEGORY_LABEL[category as keyof typeof FURNITURE_CATEGORY_LABEL] ?? category}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="condition">Condition</Label>
          <Select id="condition" name="condition" defaultValue={query.condition ?? "all"}>
            <option value="all">Any condition</option>
            {FURNITURE_CONDITIONS.map((condition) => (
              <option key={condition} value={condition}>
                {FURNITURE_CONDITION_LABEL[condition]}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="status">Availability</Label>
          <Select id="status" name="status" defaultValue={query.status ?? "all"}>
            <option value="all">Any availability</option>
            {FURNITURE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {FURNITURE_STATUS_LABEL[status]}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="minPrice">Min price</Label>
          <Input id="minPrice" name="minPrice" type="number" min={0} defaultValue={query.minPrice ?? ""} className="w-28" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="maxPrice">Max price</Label>
          <Input id="maxPrice" name="maxPrice" type="number" min={0} defaultValue={query.maxPrice ?? ""} className="w-28" />
        </div>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
        {hasActiveFurnitureFilters(query) ? (
          <Link href="/app/inventory" className="text-sm text-muted-foreground underline">
            Clear filters
          </Link>
        ) : null}
      </form>

      {result.items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No furniture products match these filters.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2/60">
                {["Product", "Category", "Price", "Condition", "Status", "Added", ""].map((header) => (
                  <th key={header} scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {header || <span className="sr-only">Actions</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.items.map((product) => (
                <tr key={product.id} className="border-b border-border last:border-0 hover:bg-surface-2/40">
                  <td className="px-4 py-3">
                    <Link href={`/app/inventory/${product.id}`} className="flex items-center gap-3 font-medium text-foreground hover:underline">
                      {primaryPhotoUrlByProductId[product.id] ? (
                        // eslint-disable-next-line @next/next/no-img-element -- served from our own route handler, not an optimizable static asset.
                        <img
                          src={primaryPhotoUrlByProductId[product.id]}
                          alt=""
                          className="h-10 w-10 rounded object-cover"
                        />
                      ) : (
                        <span className="h-10 w-10 rounded bg-surface-2" aria-hidden="true" />
                      )}
                      {product.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{FURNITURE_CATEGORY_LABEL[product.category]}</td>
                  <td className="px-4 py-3 text-foreground">{formatFurniturePrice(product.price, product.currency)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{FURNITURE_CONDITION_LABEL[product.condition]}</td>
                  <td className="px-4 py-3">
                    <FurnitureStatusBadge status={product.status} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{formatAddedDate(product.addedAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <FurnitureRowActions productId={product.id} name={product.name} canDelete={canDeleteProduct} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {result.totalPages > 1 ? (
        <nav className="flex items-center justify-center gap-2" aria-label="Pagination">
          {Array.from({ length: result.totalPages }, (_, i) => i + 1).map((pageNumber) => (
            <Link
              key={pageNumber}
              href={`/app/inventory${buildFurnitureQueryString(query, { page: pageNumber })}`}
              aria-current={pageNumber === result.page ? "page" : undefined}
              className={`rounded-md px-3 py-1.5 text-sm ${
                pageNumber === result.page ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-surface-2"
              }`}
            >
              {pageNumber}
            </Link>
          ))}
        </nav>
      ) : null}
    </div>
  );
}
