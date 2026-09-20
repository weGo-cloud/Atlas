import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { MakeBreakdownItem } from "../domain/dashboard-summary";

function InventoryMakeBreakdown({ items }: { items: MakeBreakdownItem[] }) {
  const maxCount = items.length > 0 ? items[0].count : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Inventory composition</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {items.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No vehicles in inventory yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((item) => (
              <li key={item.make} className="flex items-center gap-3">
                <span className="w-24 shrink-0 truncate text-sm text-foreground">
                  {item.make}
                </span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{
                      width: `${maxCount > 0 ? (item.count / maxCount) * 100 : 0}%`,
                    }}
                  />
                </div>
                <span className="w-6 shrink-0 text-right text-sm font-medium tabular-nums text-foreground">
                  {item.count}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export { InventoryMakeBreakdown };
