import { Badge } from "@/components/ui/badge";
import { FURNITURE_STATUS_LABEL, type FurnitureStatus } from "../domain/furniture-product";

const STATUS_VARIANT: Record<FurnitureStatus, "success" | "warning" | "default"> = {
  available: "success",
  reserved: "warning",
  sold: "default",
};

export function FurnitureStatusBadge({ status }: { status: FurnitureStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{FURNITURE_STATUS_LABEL[status]}</Badge>;
}
