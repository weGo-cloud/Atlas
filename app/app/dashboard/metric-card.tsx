import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

function MetricCard({
  label,
  value,
  delta,
  trend,
  icon: Icon,
}: {
  label: string;
  value: string;
  delta?: string;
  trend?: "up" | "down";
  icon: LucideIcon;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <span className="text-sm font-medium text-muted-foreground">
            {label}
          </span>
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-surface-2">
            <Icon className="h-4 w-4 text-subtle-foreground" />
          </div>
        </div>
        <p className="mt-3 font-mono text-2xl font-semibold tracking-tight text-foreground">
          {value}
        </p>
        {delta && trend && (
          <div
            className={cn(
              "mt-2 inline-flex items-center gap-1 text-xs font-medium",
              trend === "up" ? "text-success" : "text-destructive"
            )}
          >
            {trend === "up" ? (
              <ArrowUpRight className="h-3.5 w-3.5" />
            ) : (
              <ArrowDownRight className="h-3.5 w-3.5" />
            )}
            {delta}
            <span className="font-normal text-subtle-foreground">vs last week</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export { MetricCard };
