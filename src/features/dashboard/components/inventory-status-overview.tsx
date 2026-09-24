import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { StatusBreakdownItem } from "../domain/dashboard-summary";

const SEGMENT_CLASS: Record<string, string> = {
  available: "bg-success",
  reserved: "bg-warning-fill",
  sold: "bg-subtle-foreground",
};

function InventoryStatusOverview({ items }: { items: StatusBreakdownItem[] }) {
  const total = items.reduce((sum, item) => sum + item.count, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Inventory by status</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {total === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No vehicles in inventory yet.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-3">
              {items.map((item) =>
                item.count > 0 ? (
                  <div
                    key={item.status}
                    className={SEGMENT_CLASS[item.status]}
                    style={{ width: `${(item.count / total) * 100}%` }}
                    title={`${item.label}: ${item.count}`}
                  />
                ) : null
              )}
            </div>

            <div className="grid grid-cols-3 gap-3 border-t border-border pt-4">
              {items.map((item) => (
                <div key={item.status} className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className={`h-2 w-2 shrink-0 rounded-full ${SEGMENT_CLASS[item.status]}`}
                  />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{item.label}</p>
                    <p className="text-lg font-semibold tabular text-foreground">
                      {item.count}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export { InventoryStatusOverview };
