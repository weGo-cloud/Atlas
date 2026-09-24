import { CheckCircle2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";

/** Mission 019 — Sale has no status lifecycle (see domain/sale.ts): its existence is the fact. This is a static label, not a variant-per-status badge like DealStatusBadge. */
function SaleBadge() {
  return (
    <Badge variant="success">
      <CheckCircle2 className="h-3 w-3" />
      Finalized
    </Badge>
  );
}

export { SaleBadge };
