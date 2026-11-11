import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { VehicleStatus } from "../data/types";

type SummaryMetric = {
  label: string;
  value: number;
  dot?: string;
};

type InventorySummaryProps = {
  /** Status counts across the whole inventory (not just the current page) — a single aggregate query. */
  counts: Record<VehicleStatus, number>;
};

function InventorySummary({ counts }: InventorySummaryProps) {
  const total = counts.available + counts.reserved + counts.sold;

  const metrics: SummaryMetric[] = [
    { label: "Total vehicles", value: total },
    { label: "Available", value: counts.available, dot: "bg-success" },
    { label: "Reserved", value: counts.reserved, dot: "bg-warning-fill" },
    { label: "Sold", value: counts.sold, dot: "bg-subtle-foreground" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {metrics.map((metric) => (
        <Card key={metric.label}>
          <CardContent className="p-4 sm:p-4">
            <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              {metric.dot ? (
                <span aria-hidden="true" className={cn("h-2 w-2 rounded-full", metric.dot)} />
              ) : null}
              {metric.label}
            </p>
            <p className="mt-1.5 text-2xl font-semibold tabular tracking-tight text-foreground">
              {metric.value}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export { InventorySummary };
