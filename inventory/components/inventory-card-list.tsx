import { Card, CardContent } from "@/components/ui/card";
import type { Vehicle } from "../data/types";
import { formatPriceKsh } from "../lib/format";
import { InventoryRowActions } from "./inventory-row-actions";
import { VehicleIdentity } from "./vehicle-identity";
import { VehicleStatusBadge } from "./status-badge";

type InventoryCardListProps = {
  vehicles: Vehicle[];
  primaryPhotoUrlByVehicleId: Record<string, string>;
  canDeleteVehicle: boolean;
};

function InventoryCardList({
  vehicles,
  primaryPhotoUrlByVehicleId,
  canDeleteVehicle,
}: InventoryCardListProps) {
  return (
    <div className="flex flex-col gap-3 md:hidden">
      {vehicles.map((vehicle) => (
        <Card key={vehicle.id}>
          <CardContent className="flex items-center justify-between gap-3 p-4">
            <VehicleIdentity
              make={vehicle.make}
              model={vehicle.model}
              year={vehicle.year}
              href={`/app/inventory/${vehicle.id}`}
              photoUrl={primaryPhotoUrlByVehicleId[vehicle.id]}
            />
            <div className="flex shrink-0 items-center gap-2">
              <div className="text-right">
                <p className="text-sm font-medium text-foreground">
                  {formatPriceKsh(vehicle.price)}
                </p>
                <div className="mt-1 flex justify-end">
                  <VehicleStatusBadge status={vehicle.status} />
                </div>
              </div>
              <InventoryRowActions
                vehicleId={vehicle.id}
                make={vehicle.make}
                model={vehicle.model}
                stockId={vehicle.stockId}
                status={vehicle.status}
                canDelete={canDeleteVehicle}
              />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export { InventoryCardList };
