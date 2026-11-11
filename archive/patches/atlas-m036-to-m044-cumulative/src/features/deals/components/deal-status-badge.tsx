import { Badge } from "@/components/ui/badge";
import { DEAL_STATUS_LABEL, type DealStatus } from "../domain/deal";

const STATUS_VARIANT: Record<
  DealStatus,
  "primary" | "warning" | "success" | "default" | "destructive"
> = {
  draft: "default",
  negotiating: "warning",
  reserved: "primary",
  completed: "success",
  cancelled: "destructive",
};

function DealStatusBadge({ status }: { status: DealStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{DEAL_STATUS_LABEL[status]}</Badge>;
}

export { DealStatusBadge };
