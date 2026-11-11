import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * The one KPI card. `emphasis="hero"` is for the few numbers a dealer
 * should read first; the default is for supporting figures. Values wrap
 * (never clip) so a long currency amount can't be cut off or overflow.
 */
function StatCard({
  label,
  value,
  hint,
  delta,
  trend,
  icon: Icon,
  emphasis = "default",
  className,
}: {
  label: string;
  value: string;
  /** Supporting line under the value, e.g. "of 42 vehicles". */
  hint?: string;
  delta?: string;
  trend?: "up" | "down";
  icon: LucideIcon;
  emphasis?: "default" | "hero";
  className?: string;
}) {
  const hero = emphasis === "hero";
  // Long figures (currency especially) scale to the card's own width via a
  // container query and never wrap mid-number; short ones keep the full size.
  const currency = value.match(/^([A-Za-z]{2,4})\s+(\d[\d,.]*)$/);
  const long = value.length > 8;
  const valueSize = long
    ? hero
      ? "whitespace-nowrap text-[clamp(0.875rem,10cqi,1.875rem)]"
      : "whitespace-nowrap text-[clamp(0.875rem,9cqi,1.5rem)]"
    : hero
      ? "text-2xl sm:text-3xl"
      : "text-xl sm:text-2xl";
  return (
    <Card className={className}>
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <span className="min-w-0 text-sm font-medium text-muted-foreground">
            {label}
          </span>
          <span
            aria-hidden="true"
            className={cn(
              "flex shrink-0 items-center justify-center rounded-lg",
              hero ? "h-9 w-9 bg-primary/10 text-primary" : "h-8 w-8 bg-surface-2 text-subtle-foreground"
            )}
          >
            <Icon className="h-4 w-4" />
          </span>
        </div>
        <div className="@container mt-3">
          <p className={cn("font-semibold tabular tracking-tight text-foreground", valueSize, !long && "[overflow-wrap:anywhere]")}>
            {currency ? (
              <>
                <span className="mr-1.5 text-[0.55em] font-medium text-muted-foreground">{currency[1]}</span>
                {currency[2]}
              </>
            ) : (
              value
            )}
          </p>
        </div>
        {hint ? <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p> : null}
        {delta && trend ? (
          <div
            className={cn(
              "mt-2 inline-flex items-center gap-1 text-xs font-medium",
              trend === "up" ? "text-success" : "text-destructive"
            )}
          >
            {trend === "up" ? (
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <ArrowDownRight className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {delta}
            <span className="font-normal text-subtle-foreground">vs last week</span>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export { StatCard };
