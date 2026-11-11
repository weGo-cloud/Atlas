import { Badge } from "@/components/ui/badge";
import { LEAD_STATUS_LABEL, type LeadStatus } from "../domain/lead";

const STATUS_VARIANT: Record<
  LeadStatus,
  "primary" | "warning" | "success" | "default" | "destructive"
> = {
  new: "primary",
  contacted: "warning",
  qualified: "success",
  negotiating: "warning",
  won: "success",
  lost: "destructive",
};

function LeadStatusBadge({ status }: { status: LeadStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{LEAD_STATUS_LABEL[status]}</Badge>;
}

export { LeadStatusBadge };
