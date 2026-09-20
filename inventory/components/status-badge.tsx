import { Badge } from "@/components/ui/badge";
import { VEHICLE_STATUS_LABEL, type VehicleStatus } from "../data/types";

const STATUS_VARIANT: Record<
  VehicleStatus,
  "success" | "warning" | "default"
> = {
  available: "success",
  reserved: "warning",
  sold: "default",
};

function VehicleStatusBadge({ status }: { status: VehicleStatus }) {
  return (
    <Badge variant={STATUS_VARIANT[status]}>
      {VEHICLE_STATUS_LABEL[status]}
    </Badge>
  );
}

export { VehicleStatusBadge };
