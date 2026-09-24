import Link from "next/link";
import { ArrowRight, Package } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Vehicle } from "@/features/inventory/data/types";
import { VehicleCard } from "@/features/inventory/components/vehicle-card";
import { EmptyState } from "@/components/shared/empty-state";

type RecentInventoryProps = {
  vehicles: Vehicle[];
  /** Primary photo URL per vehicle id, batched by the page — vehicles without one show the placeholder. */
  primaryPhotoUrlByVehicleId?: Record<string, string>;
};

/**
 * Featured inventory: the newest vehicles as the same VehicleCard used on
 * the Inventory page. The trailing tile keeps the grid even (5 vehicles +
 * 1 tile fills 3×2) and doubles as the way to the full inventory.
 */
function RecentInventory({ vehicles, primaryPhotoUrlByVehicleId = {} }: RecentInventoryProps) {
  return (
    <section aria-labelledby="recent-inventory-heading" className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id="recent-inventory-heading" className="text-base font-semibold tracking-tight text-foreground">
            Recently added
          </h2>
          <p className="text-sm text-muted-foreground">The latest vehicles to reach your inventory.</p>
        </div>
        {vehicles.length > 0 ? (
          <Button asChild variant="ghost" size="sm" className="shrink-0 gap-1">
            <Link href="/app/inventory">
              View all
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        ) : null}
      </div>

      {vehicles.length === 0 ? (
        <EmptyState
          compact
          icon={Package}
          title="No vehicles added yet"
          description="Vehicles you add appear here as soon as they're saved."
          action={
            <Button asChild size="sm">
              <Link href="/app/inventory/new">Add vehicle</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {vehicles.map((vehicle) => (
            <VehicleCard
              key={vehicle.id}
              vehicle={vehicle}
              photoUrl={primaryPhotoUrlByVehicleId[vehicle.id]}
            />
          ))}
          <Link
            href="/app/inventory"
            className="group flex min-h-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border-strong bg-surface/60 p-6 text-center text-sm font-medium text-muted-foreground transition-colors hover:border-primary hover:bg-surface hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Package className="h-6 w-6" aria-hidden="true" strokeWidth={1.5} />
            View all inventory
          </Link>
        </div>
      )}
    </section>
  );
}

export { RecentInventory };
