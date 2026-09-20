import { Card, CardContent } from "@/components/ui/card";
import type { VehicleStatus } from "../data/types";

type SummaryMetric = {
  label: string;
  value: number;
  accent?: "success" | "warning" | "muted";
};

const ACCENT_CLASS: Record<NonNullable<SummaryMetric["accent"]>, string> = {
  success: "text-success",
  warning: "text-warning",
  muted: "text-muted-foreground",
};

type InventorySummaryProps = {
  /** Status counts across the whole inventory (not just the current page) — a single aggregate query. */
  counts: Record<VehicleStatus, number>;
};

function InventorySummary({ counts }: InventorySummaryProps) {
  const total = counts.available + counts.reserved + counts.sold;

  const metrics: SummaryMetric[] = [
    { label: "Total vehicles", value: total },
    { label: "Available", value: counts.available, accent: "success" },
    { label: "Reserved", value: counts.reserved, accent: "warning" },
    { label: "Sold", value: counts.sold, accent: "muted" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {metrics.map((metric) => (
        <Card key={metric.label}>
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground">
              {metric.label}
            </p>
            <p
              className={`mt-1.5 text-2xl font-semibold tabular-nums ${
                metric.accent ? ACCENT_CLASS[metric.accent] : "text-foreground"
              }`}
            >
              {metric.value}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export { InventorySummary };
