import type { ReactNode } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Vehicle } from "../data/types";
import { formatAddedDate, formatMileage, formatPriceKsh } from "../lib/format";
import { VehicleStatusBadge } from "./status-badge";

function SpecRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between border-b border-border py-2.5 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

function VehicleSpecifications({ vehicle }: { vehicle: Vehicle }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Vehicle Information</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="mb-4 flex items-baseline justify-between rounded-md bg-surface-2/60 px-3 py-3">
          <span className="text-sm text-muted-foreground">Price</span>
          <span className="text-xl font-semibold text-foreground">
            {formatPriceKsh(vehicle.price)}
          </span>
        </div>

        <SpecRow label="Make" value={vehicle.make} />
        <SpecRow label="Model" value={vehicle.model} />
        <SpecRow label="Year" value={vehicle.year} />
        <SpecRow label="Mileage" value={formatMileage(vehicle.mileage)} />
        <SpecRow label="Stock ID" value={vehicle.stockId} />
        <SpecRow
          label="Status"
          value={<VehicleStatusBadge status={vehicle.status} />}
        />
        <SpecRow label="Date Added" value={formatAddedDate(vehicle.addedAt)} />
      </CardContent>
    </Card>
  );
}

export { VehicleSpecifications };
