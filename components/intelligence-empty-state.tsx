import { ShieldCheck } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

export function IntelligenceEmptyState() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
        <div className="flex h-11 w-11 items-center justify-center rounded-md bg-success/10">
          <ShieldCheck className="h-5 w-5 text-success" />
        </div>
        <p className="text-sm font-medium text-foreground">No active signals or recommendations for this period</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Atlas checked inventory, follow-ups, the sales trend, and the lead pipeline against their thresholds and
          found nothing that needs attention right now.
        </p>
      </CardContent>
    </Card>
  );
}
