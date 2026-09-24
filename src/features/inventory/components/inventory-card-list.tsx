import type { Vehicle } from "../data/types";
import { InventoryRowActions } from "./inventory-row-actions";
import { VehicleCard } from "./vehicle-card";

type InventoryCardListProps = {
  vehicles: Vehicle[];
  primaryPhotoUrlByVehicleId: Record<string, string>;
  canDeleteVehicle: boolean;
};

/**
 * The inventory grid: one VehicleCard per vehicle. Columns collapse
 * 1 → 2 → 3 → 4 with the available width, and every card in a row is
 * the same height (cards stretch; their content is clamped).
 */
function InventoryCardList({
  vehicles,
  primaryPhotoUrlByVehicleId,
  canDeleteVehicle,
}: InventoryCardListProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {vehicles.map((vehicle) => (
        <VehicleCard
          key={vehicle.id}
          vehicle={vehicle}
          photoUrl={primaryPhotoUrlByVehicleId[vehicle.id]}
          actions={
            <InventoryRowActions
              vehicleId={vehicle.id}
              make={vehicle.make}
              model={vehicle.model}
              stockId={vehicle.stockId}
              status={vehicle.status}
              canDelete={canDeleteVehicle}
            />
          }
        />
      ))}
    </div>
  );
}

export { InventoryCardList };
