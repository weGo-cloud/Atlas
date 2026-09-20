import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Vehicle } from "@/features/inventory/data/types";
import { formatAddedDate, formatPriceKsh } from "@/features/inventory/lib/format";
import { VehicleStatusBadge } from "@/features/inventory/components/status-badge";

function RecentInventory({ vehicles }: { vehicles: Vehicle[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recently added</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {vehicles.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No vehicles added yet.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {vehicles.map((vehicle) => (
              <li key={vehicle.id}>
                <Link
                  href={`/app/inventory/${vehicle.id}`}
                  className="flex items-center gap-3 py-3 transition-colors hover:bg-surface-2/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm px-1 -mx-1"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {vehicle.year} {vehicle.make} {vehicle.model}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Stock ID: {vehicle.stockId} · Added{" "}
                      {formatAddedDate(vehicle.addedAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-sm font-medium text-foreground">
                      {formatPriceKsh(vehicle.price)}
                    </span>
                    <VehicleStatusBadge status={vehicle.status} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export { RecentInventory };
