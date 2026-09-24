"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LayoutGrid, Rows3 } from "lucide-react";

import { cn } from "@/lib/utils";

import type { Vehicle, VehicleStatus } from "../data/types";
import type { PaginatedResult, VehicleQuery } from "../domain/vehicle-query";
import { hasActiveInventoryFilters } from "../lib/inventory-query-params";
import { InventoryCardList } from "./inventory-card-list";
import { InventoryEmptyState } from "./inventory-empty-state";
import { InventoryHeader } from "./inventory-header";
import { InventoryPagination } from "./inventory-pagination";
import { InventorySummary } from "./inventory-summary";
import { InventoryTable } from "./inventory-table";
import { InventoryToolbar } from "./inventory-toolbar";

type InventoryViewProps = {
  /** Already filtered, sorted, and paginated server-side. */
  result: PaginatedResult<Vehicle>;
  /** The resolved query that produced `result` — hydrates the toolbar and pagination controls. */
  query: VehicleQuery;
  /** Status counts across the whole inventory, not just this page. */
  counts: Record<VehicleStatus, number>;
  makes: string[];
  /** Primary photo URL per vehicle id, batched server-side for just this page. */
  primaryPhotoUrlByVehicleId: Record<string, string>;
  /** Mission 013: whether the signed-in user may delete vehicles (owner only). UI reflection only — deleteVehicleAction is the real check. */
  canDeleteVehicle: boolean;
};

function InventoryView({
  result,
  query,
  counts,
  makes,
  primaryPhotoUrlByVehicleId,
  canDeleteVehicle,
}: InventoryViewProps) {
  const router = useRouter();
  // Presentation-only preference: cards are the default because inventory
  // is something you browse by look; the table is there for scanning columns.
  const [layout, setLayout] = useState<"cards" | "table">("cards");

  return (
    <div className="flex flex-col gap-6">
      <InventoryHeader />
      <InventorySummary counts={counts} />

      <InventoryToolbar query={query} makes={makes} />

      <div className="-mt-2 hidden items-center justify-between gap-3 md:flex">
        <p className="text-xs text-muted-foreground">
          {result.total} {result.total === 1 ? "vehicle" : "vehicles"}
        </p>
        <div
          role="group"
          aria-label="Inventory layout"
          className="inline-flex rounded-md border border-border-strong bg-surface p-0.5 shadow-xs"
        >
          {(
            [
              { value: "cards", label: "Cards", icon: LayoutGrid },
              { value: "table", label: "Table", icon: Rows3 },
            ] as const
          ).map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              aria-pressed={layout === value}
              onClick={() => setLayout(value)}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-sm px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                layout === value
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {result.items.length === 0 ? (
        <InventoryEmptyState
          onReset={() => router.push("/app/inventory")}
        />
      ) : (
        <>
          {layout === "table" ? (
            <>
              <InventoryTable
                vehicles={result.items}
                primaryPhotoUrlByVehicleId={primaryPhotoUrlByVehicleId}
                canDeleteVehicle={canDeleteVehicle}
              />
              {/* Below md the table is hidden, so phones and small tablets always get cards. */}
              <div className="md:hidden">
                <InventoryCardList
                  vehicles={result.items}
                  primaryPhotoUrlByVehicleId={primaryPhotoUrlByVehicleId}
                  canDeleteVehicle={canDeleteVehicle}
                />
              </div>
            </>
          ) : (
            <InventoryCardList
              vehicles={result.items}
              primaryPhotoUrlByVehicleId={primaryPhotoUrlByVehicleId}
              canDeleteVehicle={canDeleteVehicle}
            />
          )}
          <InventoryPagination
            page={result.page}
            pageSize={result.pageSize}
            total={result.total}
            totalPages={result.totalPages}
            query={query}
          />
        </>
      )}

      {result.items.length === 0 && !hasActiveInventoryFilters(query) && (
        <p className="text-center text-xs text-muted-foreground">
          Add your first vehicle to get started.
        </p>
      )}
    </div>
  );
}

export { InventoryView };
