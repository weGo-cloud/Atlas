"use client";

import { useRouter } from "next/navigation";

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

  return (
    <div className="flex flex-col gap-6">
      <InventoryHeader />
      <InventorySummary counts={counts} />

      <InventoryToolbar query={query} makes={makes} />

      {result.items.length === 0 ? (
        <InventoryEmptyState
          onReset={() => router.push("/app/inventory")}
        />
      ) : (
        <>
          <InventoryTable
            vehicles={result.items}
            primaryPhotoUrlByVehicleId={primaryPhotoUrlByVehicleId}
            canDeleteVehicle={canDeleteVehicle}
          />
          <InventoryCardList
            vehicles={result.items}
            primaryPhotoUrlByVehicleId={primaryPhotoUrlByVehicleId}
            canDeleteVehicle={canDeleteVehicle}
          />
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
