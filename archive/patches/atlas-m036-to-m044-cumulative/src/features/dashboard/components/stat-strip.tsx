import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type StatStripItem = { label: string; value: string };

/**
 * Supporting figures as one quiet strip rather than a row of full-weight
 * cards — this is what keeps the dashboard from being a wall of equally
 * loud boxes. The hero KPIs above it carry the emphasis. Cell dividers
 * are drawn as right/bottom edge shadows (clipped at the strip's edge)
 * so a last row with fewer cells leaves clean space, not a filled gap.
 */
function StatStrip({ items }: { items: StatStripItem[] }) {
  return (
    <Card>
      <dl className="grid grid-cols-2 overflow-hidden rounded-lg sm:grid-cols-4 lg:grid-cols-7">
        {items.map((item) => (
          <div
            key={item.label}
            className="@container min-w-0 px-4 py-3 [box-shadow:1px_0_0_0_var(--border),0_1px_0_0_var(--border)]"
          >
            <dt className="truncate text-xs text-muted-foreground">{item.label}</dt>
            <dd
              className={cn(
                "mt-0.5 font-semibold tabular text-foreground",
                item.value.length > 8
                  ? "whitespace-nowrap text-[clamp(0.8125rem,9cqi,1rem)]"
                  : "text-base [overflow-wrap:anywhere]"
              )}
            >
              {item.value}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

export { StatStrip };
