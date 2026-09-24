import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
    <Table className="min-w-[52rem]" containerClassName="hidden md:block">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          {HEADERS.map((header, index) => (
            <TableHead key={header || `actions-${index}`}>
              {header || <span className="sr-only">Actions</span>}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {vehicles.map((vehicle) => (
          <TableRow key={vehicle.id}>
            <TableCell className="max-w-[18rem]">
              <VehicleIdentity
                make={vehicle.make}
                model={vehicle.model}
                year={vehicle.year}
                href={`/app/inventory/${vehicle.id}`}
                photoUrl={primaryPhotoUrlByVehicleId[vehicle.id]}
              />
            </TableCell>
            <TableCell className="whitespace-nowrap text-muted-foreground">
              {vehicle.stockId}
            </TableCell>
            <TableCell className="whitespace-nowrap font-medium tabular text-foreground">
              {formatPriceKsh(vehicle.price)}
            </TableCell>
            <TableCell className="whitespace-nowrap tabular text-muted-foreground">
              {formatMileage(vehicle.mileage)}
            </TableCell>
            <TableCell>
              <VehicleStatusBadge status={vehicle.status} />
            </TableCell>
            <TableCell className="whitespace-nowrap text-muted-foreground">
              {formatAddedDate(vehicle.addedAt)}
            </TableCell>
            <TableCell className="text-right">
              <InventoryRowActions
                vehicleId={vehicle.id}
                make={vehicle.make}
                model={vehicle.model}
                stockId={vehicle.stockId}
                status={vehicle.status}
                canDelete={canDeleteVehicle}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export { InventoryTable };
