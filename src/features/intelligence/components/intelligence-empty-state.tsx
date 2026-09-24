import { ShieldCheck } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";

export function IntelligenceEmptyState() {
  return (
    <EmptyState
      tone="success"
      icon={ShieldCheck}
      title="No active signals or recommendations for this period"
      description="Atlas checked inventory, follow-ups, the sales trend, and the lead pipeline against their thresholds and found nothing that needs attention right now."
    />
  );
}
