import type { Vehicle } from "../data/types";
import { formatAddedDate, formatMileage, formatPriceKsh } from "../lib/format";
import { InventoryRowActions } from "./inventory-row-actions";
import { VehicleIdentity } from "./vehicle-identity";
import { VehicleStatusBadge } from "./status-badge";

const HEADERS = [
  "Vehicle",
  "Stock ID",
  "Price",
  "Mileage",
  "Status",
  "Added",
  "",
];

type InventoryTableProps = {
  vehicles: Vehicle[];
  primaryPhotoUrlByVehicleId: Record<string, string>;
  canDeleteVehicle: boolean;
};

function InventoryTable({
  vehicles,
  primaryPhotoUrlByVehicleId,
  canDeleteVehicle,
}: InventoryTableProps) {
  return (
    <div className="hidden overflow-hidden rounded-lg border border-border md:block">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-2/60">
            {HEADERS.map((header) => (
              <th
                key={header}
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground"
              >
                {header || <span className="sr-only">Actions</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {vehicles.map((vehicle) => (
            <tr
              key={vehicle.id}
              className="border-b border-border last:border-0 hover:bg-surface-2/40"
            >
              <td className="px-4 py-3">
                <VehicleIdentity
                  make={vehicle.make}
                  model={vehicle.model}
                  year={vehicle.year}
                  href={`/app/inventory/${vehicle.id}`}
                  photoUrl={primaryPhotoUrlByVehicleId[vehicle.id]}
                />
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {vehicle.stockId}
              </td>
              <td className="px-4 py-3 font-medium text-foreground">
                {formatPriceKsh(vehicle.price)}
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {formatMileage(vehicle.mileage)}
              </td>
              <td className="px-4 py-3">
                <VehicleStatusBadge status={vehicle.status} />
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {formatAddedDate(vehicle.addedAt)}
              </td>
              <td className="px-4 py-3 text-right">
                <InventoryRowActions
                  vehicleId={vehicle.id}
                  make={vehicle.make}
                  model={vehicle.model}
                  stockId={vehicle.stockId}
                  status={vehicle.status}
                  canDelete={canDeleteVehicle}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export { InventoryTable };
